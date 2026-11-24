export const WORK_KINDS = ['Art', 'Literature', 'Music', 'Other'];
export const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

function normalizeMedia(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.type === 'text') {
    const content = String(input.content ?? '');
    if (!content.trim() || content.length > 50_000) return null;
    return { type: 'text', name: String(input.name || 'Literature excerpt'), content };
  }
  if (!['image', 'audio'].includes(input.type) || !(input.blob instanceof Blob)) return null;
  if (input.blob.size === 0 || input.blob.size > MAX_MEDIA_BYTES) return null;
  return {
    type: input.type,
    name: String(input.name || 'work media'),
    mime: String(input.mime || input.blob.type || 'application/octet-stream'),
    blob: input.blob,
  };
}

export function normalizeWork(input) {
  const title = String(input.title ?? input.name ?? '').trim();
  const artist = String(input.artist ?? input.creator ?? '').trim();
  const year = Number(input.year);
  if (!title || !artist || !Number.isInteger(year) || year < -9999 || year > 9999) return null;

  return {
    id: String(input.id || createId()),
    title,
    artist,
    year,
    kind: WORK_KINDS.includes(input.kind) ? input.kind : 'Other',
    media: normalizeMedia(input.media),
  };
}

export function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mediaForWork(kind, { imageFile, audioFile, text }) {
  if (kind === 'Art') {
    if (!imageFile || !imageFile.type.startsWith('image/')) throw new Error('Choose an image file for an artwork.');
    return mediaFromFile(imageFile, 'image');
  }
  if (kind === 'Music') {
    if (!audioFile || !audioFile.type.startsWith('audio/')) throw new Error('Choose an audio file for a music work.');
    return mediaFromFile(audioFile, 'audio');
  }
  if (kind === 'Literature') {
    const content = String(text || '').trim();
    if (!content) throw new Error('Paste a literature excerpt to show during the game.');
    if (content.length > 50_000) throw new Error('Literature excerpts must be 50,000 characters or fewer.');
    return { type: 'text', name: 'Literature excerpt', content };
  }
  if (imageFile) return mediaFromFile(imageFile, 'image');
  if (audioFile) return mediaFromFile(audioFile, 'audio');
  const content = String(text || '').trim();
  if (content) return { type: 'text', name: 'Work excerpt', content };
  throw new Error('Add an image, audio file, or text excerpt for this work.');
}

function mediaFromFile(file, type) {
  if (file.size > MAX_MEDIA_BYTES) throw new Error('Media files must be 30 MB or smaller.');
  return { type, name: file.name, mime: file.type, blob: file };
}
