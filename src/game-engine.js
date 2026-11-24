const MAX_TEAMS = 10;

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createGame({ works, teams, target, random = Math.random }) {
  if (teams.length < 2 || teams.length > MAX_TEAMS) throw new Error('A game needs 2–10 teams.');
  if (works.length <= teams.length) throw new Error('Add more works than teams so there are cards to play.');
  const maxWinningTimeline = Math.min(30, works.length - teams.length + 1);
  if (!Number.isInteger(target) || target < 2 || target > maxWinningTimeline) {
    throw new Error(`The winning timeline must be 2–${maxWinningTimeline} works to leave one starter for every other team.`);
  }

  const shuffled = shuffle(works, random);
  const players = teams.map((team, index) => ({
    name: team.name.trim(),
    color: team.color,
    timeline: [shuffled[index]],
  }));

  return {
    teams: players,
    deck: shuffled.slice(players.length + 1),
    unclaimed: [],
    random,
    target,
    round: 1,
    teamIndex: 0,
    currentWork: shuffled[players.length],
    drawCount: 0,
    revealed: false,
    selectedSlot: null,
    correctSlot: null,
    correct: false,
    feedback: '',
    closingRound: false,
    finished: false,
    exhausted: false,
  };
}

export function currentTeam(game) {
  return game.teams[game.teamIndex];
}

export function chooseTimelineSlot(game, slotIndex) {
  if (game.finished || game.revealed || !game.currentWork) throw new Error('There is no active placement to resolve.');
  const { timeline } = currentTeam(game);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > timeline.length) throw new Error('Choose a valid place on the timeline.');

  const work = game.currentWork;
  const fitsBefore = slotIndex === 0 || timeline[slotIndex - 1].year <= work.year;
  const fitsAfter = slotIndex === timeline.length || timeline[slotIndex].year >= work.year;
  const firstLaterWork = timeline.findIndex((item) => item.year > work.year);
  game.correctSlot = firstLaterWork < 0 ? timeline.length : firstLaterWork;
  game.selectedSlot = slotIndex;
  game.correct = fitsBefore && fitsAfter;

  if (game.correct) {
    timeline.splice(slotIndex, 0, work);
    game.feedback = 'That’s the right place. It’s yours.';
    if (timeline.length >= game.target) game.closingRound = true;
  } else {
    game.unclaimed.push(work);
    game.feedback = 'Not quite';
  }
  game.revealed = true;
  return game;
}

export function isFinalTurn(game) {
  return game.closingRound && game.teamIndex === game.teams.length - 1;
}

export function advanceGame(game) {
  if (game.finished || !game.revealed) throw new Error('Resolve the current turn before continuing.');
  if (isFinalTurn(game)) {
    game.finished = true;
    return game;
  }

  game.teamIndex += 1;
  if (game.teamIndex === game.teams.length) {
    game.teamIndex = 0;
    game.round += 1;
  }

  if (!game.deck.length) {
    game.deck = shuffle(game.unclaimed, game.random);
    game.unclaimed = [];
  }
  game.currentWork = game.deck.pop() ?? null;
  game.drawCount += 1;
  game.selectedSlot = null;
  game.correctSlot = null;
  game.correct = false;
  game.revealed = false;
  game.feedback = '';

  if (!game.currentWork) {
    game.finished = true;
    game.exhausted = true;
  }
  return game;
}

export function rankedTeams(game) {
  return game.teams
    .map((team, index) => ({ ...team, index }))
    .sort((a, b) => b.timeline.length - a.timeline.length || a.index - b.index);
}
