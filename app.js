import { createCollection, downloadFile, readCollection } from './src/archive.js';
import { advanceGame, chooseTimelineSlot, createGame, currentTeam, isFinalTurn, rankedTeams } from './src/game-engine.js';
import { loadLibrary, saveLibrary } from './src/library-storage.js';
import { createId, mediaForWork, normalizeWork } from './src/works.js';

const TEAM_COLORS = ['#4f745d', '#b66a50', '#6577a2', '#b28a43', '#845f7b', '#49838a', '#9b6856', '#74834a', '#74717f', '#a45f70'];
const state = { libraryWorks: [], gameWorks: [], gameFileName: '', teams: [], game: null };
const $ = (id) => document.getElementById(id);
let toastTimeout;
let editingMedia = null;
let displayedMedia = null;
let displayedMediaUrl = null;
let libraryMediaUrls = [];
let timelineMediaUrls = [];
const finalTimelineMediaUrls = [];

function releaseMediaUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.length = 0;
}

function createWorkMedia(work, urls) {
  const container = document.createElement('div');
  container.className = 'work-media';
  const media = work.media;
  if (!media) {
    container.textContent = 'Media missing';
  } else if (media.type === 'text') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Read excerpt';
    const excerpt = document.createElement('blockquote');
    excerpt.textContent = media.content;
    details.append(summary, excerpt);
    container.append(details);
  } else {
    const url = URL.createObjectURL(media.blob);
    urls.push(url);
    const element = document.createElement(media.type === 'image' ? 'img' : 'audio');
    element.src = url;
    if (media.type === 'image') {
      element.alt = work.title;
      element.loading = 'lazy';
    } else {
      element.controls = true;
      element.preload = 'none';
      element.setAttribute('aria-label', `Play ${work.title}`);
    }
    container.append(element);
  }
  return container;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

async function persistLibrary() {
  try {
    await saveLibrary(state.libraryWorks);
  } catch {
    showToast('Could not save this collection on your device. Download the .humster file to keep it.');
  }
}


function renderLibrary() {
  releaseMediaUrls(libraryMediaUrls);
  $('work-count-label').textContent = `(${state.libraryWorks.length})`;
  $('library-empty').classList.toggle('hidden', state.libraryWorks.length > 0);
  const list = $('work-list');
  list.replaceChildren();
  for (const work of [...state.libraryWorks].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title))) {
    const card = document.createElement('article');
    card.className = 'work-card';
    card.append(createWorkMedia(work, libraryMediaUrls));
    const details = document.createElement('div');
    details.className = 'work-details';
    details.innerHTML = `<div class="work-title">${escapeHtml(work.title)}</div>
      <div class="work-meta">${escapeHtml(work.artist)} · ${escapeHtml(work.year)}</div>
      <div class="work-actions">
        <button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(work.id)}" aria-label="Edit ${escapeHtml(work.title)}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.8V20h3.2L18.9 8.3l-3.2-3.2L4 16.8Zm16.3-10a1.1 1.1 0 0 0 0-1.6l-1.5-1.5a1.1 1.1 0 0 0-1.6 0L16 4.9l3.2 3.2 1.1-1.3Z"/></svg></button>
        <button class="icon-button" type="button" data-action="delete" data-id="${escapeHtml(work.id)}" aria-label="Remove ${escapeHtml(work.title)}" title="Remove">×</button>
      </div>`;
    card.append(details);
    list.append(card);
  }
}

function showMediaFields() {
  const kind = $('work-kind').value;
  $('image-input').classList.toggle('hidden', kind !== 'Art');
  $('audio-input').classList.toggle('hidden', kind !== 'Music');
  $('text-input').classList.toggle('hidden', kind !== 'Literature');
}

function resetWorkForm() {
  $('work-form').reset();
  $('work-id').value = '';
  editingMedia = null;
  $('media-current').classList.add('hidden');
  $('media-current').textContent = '';
  $('save-work').innerHTML = 'Add to library <span aria-hidden="true">↗</span>';
  $('cancel-edit').classList.add('hidden');
  showMediaFields();
}

function editWork(work) {
  $('work-id').value = work.id;
  $('work-title').value = work.title;
  $('work-artist').value = work.artist;
  $('work-year').value = work.year;
  $('work-kind').value = work.kind === 'Other'
    ? ({ image: 'Art', audio: 'Music', text: 'Literature' }[work.media?.type] || 'Art')
    : work.kind;
  editingMedia = work.media;
  if (work.media?.type === 'text') $('work-text').value = work.media.content;
  showMediaFields();
  if (work.media && work.media.type !== 'text') {
    $('media-current').textContent = `Current file: ${work.media.name}. Choose another file to replace it.`;
    $('media-current').classList.remove('hidden');
  } else if (work.media?.type === 'text') {
    $('media-current').textContent = 'The pasted excerpt is loaded below.';
    $('media-current').classList.remove('hidden');
  }
  $('save-work').innerHTML = 'Save changes <span aria-hidden="true">↗</span>';
  $('cancel-edit').classList.remove('hidden');
  $('work-title').focus();
}

function collectMedia(kind) {
  const imageFile = $('work-image').files[0];
  const audioFile = $('work-audio').files[0];
  const text = $('work-text').value;
  const expectedType = kind === 'Art' ? 'image' : kind === 'Music' ? 'audio' : kind === 'Literature' ? 'text' : null;

  if (kind === 'Art' && !imageFile && editingMedia?.type === 'image') return editingMedia;
  if (kind === 'Music' && !audioFile && editingMedia?.type === 'audio') return editingMedia;
  if (kind === 'Literature' && !text.trim() && editingMedia?.type === 'text') return editingMedia;
  if (expectedType === 'image') return mediaForWork(kind, { imageFile });
  if (expectedType === 'audio') return mediaForWork(kind, { audioFile });
  if (expectedType === 'text') return mediaForWork(kind, { text });
  return mediaForWork(kind, { imageFile, audioFile, text });
}

$('work-kind').addEventListener('change', showMediaFields);
$('work-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('work-id').value || createId();
  let media;
  try {
    media = collectMedia($('work-kind').value);
  } catch (error) {
    return showToast(error.message);
  }
  const work = normalizeWork({
    id,
    title: $('work-title').value,
    artist: $('work-artist').value,
    year: $('work-year').value,
    kind: $('work-kind').value,
    media,
  });
  if (!work) return showToast('Add a title, creator, valid year, and supported work media.');

  const existingIndex = state.libraryWorks.findIndex((item) => item.id === id);
  if (existingIndex < 0) state.libraryWorks.push(work);
  else state.libraryWorks[existingIndex] = work;
  await persistLibrary();
  renderLibrary();
  resetWorkForm();
  showToast(existingIndex < 0 ? 'Work added to your collection.' : 'Work updated.');
});

$('cancel-edit').addEventListener('click', resetWorkForm);
$('work-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const work = state.libraryWorks.find((item) => item.id === button.dataset.id);
  if (!work) return;
  if (button.dataset.action === 'edit') return editWork(work);
  state.libraryWorks = state.libraryWorks.filter((item) => item.id !== work.id);
  await persistLibrary();
  renderLibrary();
  showToast('Work removed.');
});

$('clear-library').addEventListener('click', async () => {
  if (!state.libraryWorks.length || !window.confirm('Remove every work from this collection?')) return;
  state.libraryWorks = [];
  await persistLibrary();
  renderLibrary();
});

$('export-library').addEventListener('click', async () => {
  if (!state.libraryWorks.length) return showToast('Add at least one work before saving.');
  try {
    downloadFile(await createCollection(state.libraryWorks), 'my-collection.humster');
  } catch {
    showToast('Could not package this collection. Check that each media file is still available.');
  }
});

$('library-upload').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    state.libraryWorks = await readCollection(file);
    await persistLibrary();
    renderLibrary();
    showToast(`Opened ${state.libraryWorks.length} works from ${file.name}.`);
  } catch (error) {
    showToast(error.message || 'Could not open this collection.');
  }
});

function availableColor() {
  const usedColors = new Set(state.teams.map((team) => team.color));
  const available = TEAM_COLORS.filter((color) => !usedColors.has(color));
  return available[Math.floor(Math.random() * available.length)] || TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];
}

function renderTeamFields() {
  $('team-fields').innerHTML = state.teams.map((team, index) => `
    <div class="team-field">
      <span class="team-swatch" style="background:${team.color}"></span>
      <input class="team-name" data-team-index="${index}" maxlength="28" aria-label="Team ${index + 1} name" value="${escapeHtml(team.name)}" placeholder="Team ${index + 1}">
      ${index > 1 ? `<button type="button" class="remove-team" data-remove-team="${index}" aria-label="Remove team ${index + 1}">×</button>` : ''}
    </div>`).join('');
  $('team-count').textContent = `${state.teams.length} TEAM${state.teams.length === 1 ? '' : 'S'}`;
  $('add-team').disabled = state.teams.length >= TEAM_COLORS.length;
  updateStartButton();
}

function updateStartButton() {
  let message = '';
  if (!state.gameFileName) message = 'Choose a .humster file to start.';
  else if (state.gameWorks.some((work) => !work.media)) message = 'Add playable media to every work in the library first.';
  else if (state.gameWorks.length <= state.teams.length) message = 'Add more works than teams so there are cards to draw.';
  else if (state.gameWorks.length < Number($('target-count').value) + state.teams.length - 1) {
    const max = Math.min(30, state.gameWorks.length - state.teams.length + 1);
    message = `Lower the winning timeline to ${max} or add more works.`;
  }
  else if (state.teams.some((team) => !team.name.trim())) message = 'Name every team to start.';
  $('setup-error').textContent = message;
  $('start-game').disabled = Boolean(message);
}

function addTeam(name = '') {
  if (state.teams.length >= TEAM_COLORS.length) return;
  state.teams.push({ name, color: availableColor() });
  renderTeamFields();
}

$('team-fields').addEventListener('input', (event) => {
  const input = event.target.closest('[data-team-index]');
  if (!input) return;
  state.teams[Number(input.dataset.teamIndex)].name = input.value;
  updateStartButton();
});
$('team-fields').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-team]');
  if (!button) return;
  state.teams.splice(Number(button.dataset.removeTeam), 1);
  renderTeamFields();
});
$('add-team').addEventListener('click', () => addTeam());

function setTargetCount(value) {
  $('target-count').value = Math.max(2, Math.min(30, Number(value) || 10));
  updateStartButton();
}
$('target-count').addEventListener('input', () => setTargetCount($('target-count').value));
$('target-count').addEventListener('change', () => setTargetCount($('target-count').value));
document.querySelectorAll('[data-step]').forEach((button) => {
  button.addEventListener('click', () => setTargetCount(Number($('target-count').value) + Number(button.dataset.step)));
});

async function loadGameCollection(file, input) {
  if (!file) return;
  try {
    state.gameWorks = await readCollection(file);
    state.gameFileName = file.name;
    $('game-file-name').textContent = file.name;
    $('game-file-meta').textContent = `${state.gameWorks.length} works ready to play`;
    $('setup-error').textContent = state.gameWorks.some((work) => !work.media)
      ? 'This collection has works without media. Add an image, audio file, or literature excerpt in the library before playing.'
      : '';
  } catch (error) {
    state.gameWorks = [];
    state.gameFileName = '';
    $('game-file-name').textContent = 'Choose a .humster file';
    $('game-file-meta').textContent = 'ZIP collections only';
    $('setup-error').textContent = error.message || 'Could not open this collection.';
  } finally {
    if (input) input.value = '';
    updateStartButton();
  }
}

$('game-upload').addEventListener('change', (event) => loadGameCollection(event.target.files[0], event.target));
const dropZone = $('game-drop-zone');
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('drag-over');
  loadGameCollection(event.dataTransfer.files[0]);
});

function switchView(view) {
  $('library-view').classList.toggle('hidden', view !== 'library');
  $('game-view').classList.toggle('hidden', view !== 'game');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('open-game').addEventListener('click', () => switchView('game'));
$('back-library').addEventListener('click', () => {
  if (state.game && !state.game.finished && !window.confirm('End this game and return to the library?')) return;
  state.game = null;
  $('active-game').classList.add('hidden');
  $('results-view').classList.add('hidden');
  $('game-setup').classList.remove('hidden');
  $('game-heading').textContent = 'Game setup';
  releaseMediaUrls(timelineMediaUrls);
  releaseMediaUrls(finalTimelineMediaUrls);
  switchView('library');
});

function renderMedia(work, revealed) {
  const mediaBox = $('draw-media');
  const card = $('draw-card');
  const media = work.media;
  card.classList.toggle('presenting-media', Boolean(media));
  card.classList.toggle('revealed', revealed);

  if (displayedMedia !== media) {
    if (displayedMediaUrl) URL.revokeObjectURL(displayedMediaUrl);
    displayedMediaUrl = null;
    displayedMedia = media;
    mediaBox.replaceChildren();
    if (media?.type === 'image' || media?.type === 'audio') {
      displayedMediaUrl = URL.createObjectURL(media.blob);
      const element = document.createElement(media.type === 'image' ? 'img' : 'audio');
      element.src = displayedMediaUrl;
      element.alt = media.type === 'image' ? 'Artwork clue' : '';
      if (media.type === 'audio') {
        element.controls = true;
        element.preload = 'metadata';
        element.setAttribute('aria-label', 'Play the music work');
      }
      mediaBox.append(element);
    } else if (media?.type === 'text') {
      const excerpt = document.createElement('blockquote');
      excerpt.textContent = media.content;
      mediaBox.append(excerpt);
    }
  }
}

function createTimelineItem(work, color, urls) {
  const card = document.createElement('article');
  card.className = 'timeline-item';
  card.style.setProperty('--timeline-color', color);
  const year = document.createElement('div');
  year.className = 'timeline-year';
  year.textContent = work.year;
  card.append(year, createWorkMedia(work, urls));
  const details = document.createElement('div');
  details.className = 'timeline-details';
  details.innerHTML = `<div class="timeline-work">${escapeHtml(work.title)}</div><div class="timeline-artist">${escapeHtml(work.artist)}</div>`;
  card.append(details);
  return card;
}

function renderTimelineSlots() {
  const game = state.game;
  const team = currentTeam(game);
  const slots = $('timeline-slots');
  releaseMediaUrls(timelineMediaUrls);
  slots.replaceChildren();

  for (let index = 0; index <= team.timeline.length; index += 1) {
    if (!game.revealed) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'timeline-slot';
      const position = index === 0 ? 'before all works' : index === team.timeline.length ? 'after all works' : `between works ${index} and ${index + 1}`;
      button.textContent = '+';
      button.setAttribute('aria-label', `Place new work ${position}`);
      button.addEventListener('click', () => {
        chooseTimelineSlot(game, index);
        renderGameTurn();
      });
      slots.append(button);
    } else if (!game.correct && index === game.selectedSlot) {
      const marker = document.createElement('div');
      marker.className = 'timeline-slot result-slot';
      marker.textContent = '×';
      marker.setAttribute('aria-label', 'Incorrect placement');
      slots.append(marker);
    }

    if (index < team.timeline.length) {
      slots.append(createTimelineItem(team.timeline[index], team.color, timelineMediaUrls));
    }
  }
}

function renderGameTurn() {
  const game = state.game;
  if (!game || game.finished) return showResults();
  const team = currentTeam(game);
  const work = game.currentWork;
  renderMedia(work, game.revealed);
  $('round-number').textContent = String(game.round).padStart(2, '0');
  $('turn-label').textContent = `${team.name}’s turn`;
  $('draw-title').textContent = work.title;
  $('draw-artist').textContent = game.revealed ? work.artist : 'Artist and year are hidden';
  $('draw-status').textContent = game.revealed ? String(work.year) : '';
  $('timeline-team-name').textContent = team.name;
  $('timeline-team-name').style.color = team.color;
  $('timeline-score').textContent = `${team.timeline.length} ${team.timeline.length === 1 ? 'work' : 'works'}`;
  $('round-progress').innerHTML = game.teams.map((item, index) => `
    <span class="progress-dot ${index < game.teamIndex ? 'complete' : index === game.teamIndex ? 'current' : ''}" title="${escapeHtml(item.name)}"></span>`).join('');
  $('next-turn').classList.toggle('hidden', !game.revealed);
  $('next-turn').innerHTML = isFinalTurn(game) ? 'See results <span aria-hidden="true">→</span>' : 'Next team <span aria-hidden="true">→</span>';
  $('game-feedback').textContent = game.feedback;
  $('game-feedback').classList.toggle('incorrect', game.revealed && !game.correct);
  renderTimelineSlots();
}

function showResults() {
  if (!state.game) return;
  $('active-game').classList.add('hidden');
  $('results-view').classList.remove('hidden');
  $('game-heading').textContent = 'Results';
  const ranked = rankedTeams(state.game);
  $('results-intro').textContent = state.game.exhausted
    ? 'Every work was claimed. Final places are by timeline length.'
    : 'First, second, and third by timeline length.';
  $('podium').innerHTML = ranked.slice(0, 3).map((team, index) => `
    <article class="podium-place ${index === 0 ? 'first' : index === 1 ? 'second' : 'third'}" style="--timeline-color:${team.color}">
      <span class="podium-medal">${index + 1}</span><h3>${escapeHtml(team.name)}</h3>
      <div class="podium-score">${team.timeline.length} WORK${team.timeline.length === 1 ? '' : 'S'}</div>
      <span class="place-label">${['FIRST', 'SECOND', 'THIRD'][index]}</span>
    </article>`).join('');
  releaseMediaUrls(finalTimelineMediaUrls);
  const finalTimelines = $('final-timelines');
  finalTimelines.replaceChildren();
  for (const team of ranked) {
    const section = document.createElement('section');
    section.className = 'final-team timeline-panel';
    const heading = document.createElement('div');
    heading.className = 'timeline-heading';
    const name = document.createElement('h2');
    name.textContent = team.name;
    name.style.color = team.color;
    const count = document.createElement('span');
    count.textContent = `${team.timeline.length} ${team.timeline.length === 1 ? 'work' : 'works'}`;
    heading.append(name, count);
    const timeline = document.createElement('div');
    timeline.className = 'timeline-slots';
    for (const work of team.timeline) {
      timeline.append(createTimelineItem(work, team.color, finalTimelineMediaUrls));
    }
    section.append(heading, timeline);
    finalTimelines.append(section);
  }
  $('show-timelines').classList.remove('hidden');
  $('final-timelines').classList.add('hidden');
  $('play-again').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startGame() {
  try {
    state.game = createGame({
      works: state.gameWorks,
      teams: state.teams,
      target: Number($('target-count').value),
    });
  } catch (error) {
    $('setup-error').textContent = error.message;
    return;
  }
  $('game-setup').classList.add('hidden');
  $('results-view').classList.add('hidden');
  $('active-game').classList.remove('hidden');
  $('game-heading').textContent = '';
  renderGameTurn();
}

$('start-game').addEventListener('click', startGame);
$('next-turn').addEventListener('click', () => {
  advanceGame(state.game);
  renderGameTurn();
});
$('quit-game').addEventListener('click', () => {
  if (!window.confirm('End this game and return to setup?')) return;
  state.game = null;
  $('active-game').classList.add('hidden');
  $('game-setup').classList.remove('hidden');
  $('game-heading').textContent = 'Game setup';
});
$('show-timelines').addEventListener('click', () => {
  $('final-timelines').classList.remove('hidden');
  $('show-timelines').classList.add('hidden');
  $('play-again').classList.remove('hidden');
});
$('play-again').addEventListener('click', () => {
  state.game = null;
  $('results-view').classList.add('hidden');
  $('game-setup').classList.remove('hidden');
  $('game-heading').textContent = 'Game setup';
  releaseMediaUrls(finalTimelineMediaUrls);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

async function initialize() {
  state.libraryWorks = await loadLibrary();
  renderLibrary();
  showMediaFields();
  addTeam('');
  addTeam('');
  updateStartButton();
}

initialize();
