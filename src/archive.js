import { normalizeWork } from './works.js';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
const DOS_DATE = 0x21;

function write16(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function write32(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function joinBytes(parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name, content) {
  const filename = ENCODER.encode(name);
  const checksum = crc32(content);
  const localHeader = joinBytes([
    write32(ZIP_LOCAL), write16(20), write16(0x0800), write16(0),
    write16(0), write16(DOS_DATE), write32(checksum), write32(content.length),
    write32(content.length), write16(filename.length), write16(0), filename,
  ]);
  const centralHeader = joinBytes([
    write32(ZIP_CENTRAL), write16(20), write16(20), write16(0x0800),
    write16(0), write16(0), write16(DOS_DATE), write32(checksum),
    write32(content.length), write32(content.length), write16(filename.length),
    write16(0), write16(0), write16(0), write16(0), write32(0), write32(0), filename,
  ]);
  return { localHeader, content, centralHeader };
}

function safeExtension(filename, fallback) {
  return filename.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase() || fallback;
}

export async function createCollection(works) {
  const assets = [];
  const manifestWorks = [];
  for (const [index, work] of works.entries()) {
    const { media, ...details } = work;
    if (!media) {
      manifestWorks.push(details);
      continue;
    }
    if (media.type === 'text') {
      manifestWorks.push({ ...details, media: { type: 'text', name: media.name, content: media.content } });
      continue;
    }

    const fallback = media.type === 'image' ? '.png' : '.mp3';
    const path = `media/work-${String(index + 1).padStart(4, '0')}${safeExtension(media.name, fallback)}`;
    const bytes = new Uint8Array(await media.blob.arrayBuffer());
    assets.push({ path, bytes });
    manifestWorks.push({ ...details, media: { type: media.type, name: media.name, mime: media.mime, path } });
  }

  const manifest = ENCODER.encode(JSON.stringify({ format: 'humster', version: 1, works: manifestWorks }, null, 2));
  const entries = [zipEntry('works.json', manifest), ...assets.map(({ path, bytes }) => zipEntry(path, bytes))];
  let localOffset = 0;
  const centralParts = [];
  for (const entry of entries) {
    const offsetField = write32(localOffset);
    entry.centralHeader.set(offsetField, 42);
    centralParts.push(entry.centralHeader);
    localOffset += entry.localHeader.length + entry.content.length;
  }
  const central = joinBytes(centralParts);
  const end = joinBytes([
    write32(ZIP_END), write16(0), write16(0), write16(entries.length), write16(entries.length),
    write32(central.length), write32(localOffset), write16(0),
  ]);
  if (localOffset + central.length + end.length > MAX_ARCHIVE_BYTES) throw new Error('The finished collection would exceed 100 MB.');
  return new Blob([...entries.flatMap(({ localHeader, content }) => [localHeader, content]), central, end], { type: 'application/zip' });
}

function assertRange(view, offset, size) {
  if (offset < 0 || size < 0 || offset + size > view.byteLength) throw new Error('The ZIP archive is damaged.');
}

async function readEntry(bytes, view, entry) {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error('A media file in this collection exceeds 30 MB.');
  assertRange(view, entry.localOffset, 30);
  if (view.getUint32(entry.localOffset, true) !== ZIP_LOCAL) throw new Error('A collection file is missing.');
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  assertRange(view, dataOffset, entry.compressedSize);
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
  let data;

  if (entry.method === 0) data = compressed;
  else if (entry.method === 8 && typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new Error('This ZIP compression method is not supported in this browser.');
    }
  } else throw new Error('This ZIP compression method is not supported in this browser.');

  if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc) throw new Error('A file in this collection failed its ZIP checksum.');
  return data;
}

export async function readCollection(file) {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('This collection is too large to open (100 MB maximum).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - 65_558);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error('This file is not a valid ZIP archive.');
  assertRange(view, endOffset, 22);

  const entryCount = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  let cursor = centralOffset;
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    assertRange(view, cursor, 46);
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL) throw new Error('The ZIP archive is damaged.');
    const filenameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    assertRange(view, cursor + 46, filenameLength + extraLength + commentLength);
    const name = DECODER.decode(bytes.subarray(cursor + 46, cursor + 46 + filenameLength));
    entries.set(name, {
      method: view.getUint16(cursor + 10, true),
      crc: view.getUint32(cursor + 16, true),
      compressedSize: view.getUint32(cursor + 20, true),
      uncompressedSize: view.getUint32(cursor + 24, true),
      localOffset: view.getUint32(cursor + 42, true),
    });
    cursor += 46 + filenameLength + extraLength + commentLength;
  }

  const manifestName = entries.has('works.json') ? 'works.json' : [...entries.keys()].find((name) => name.endsWith('/works.json'));
  if (!manifestName) throw new Error('No works.json found. This is not a Humster collection.');
  const manifestBytes = await readEntry(bytes, view, entries.get(manifestName));
  let parsed;
  try { parsed = JSON.parse(DECODER.decode(manifestBytes)); }
  catch { throw new Error('The works.json file is not valid JSON.'); }
  const inputWorks = Array.isArray(parsed) ? parsed : parsed?.works;
  if (!Array.isArray(inputWorks)) throw new Error('The collection has no works list.');

  const works = [];
  for (const input of inputWorks) {
    let media = null;
    if (input.media?.type === 'text') {
      media = { type: 'text', name: input.media.name, content: input.media.content };
    } else if (['image', 'audio'].includes(input.media?.type) && typeof input.media.path === 'string') {
      const entry = entries.get(input.media.path);
      if (!entry) throw new Error(`Media file missing for “${input.title || 'a work'}”.`);
      const data = await readEntry(bytes, view, entry);
      media = {
        type: input.media.type,
        name: input.media.name,
        mime: input.media.mime,
        blob: new Blob([data], { type: input.media.mime || 'application/octet-stream' }),
      };
    }
    const work = normalizeWork({ ...input, media });
    if (work) works.push(work);
  }
  if (!works.length) throw new Error('No valid works found. Each work needs a title, creator, and year.');
  return works;
}

export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
