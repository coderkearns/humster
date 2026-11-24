import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollection, readCollection } from '../src/archive.js';

const works = [
  {
    id: 'wave', title: 'The Great Wave', artist: 'Hokusai', year: 1831, kind: 'Art',
    media: { type: 'image', name: 'wave.png', mime: 'image/png', blob: new Blob([Uint8Array.of(137, 80, 78, 71)], { type: 'image/png' }) },
  },
  {
    id: 'song', title: 'A song', artist: 'A musician', year: 1972, kind: 'Music',
    media: { type: 'audio', name: 'song.mp3', mime: 'audio/mpeg', blob: new Blob([Uint8Array.of(1, 2, 3, 4)], { type: 'audio/mpeg' }) },
  },
  {
    id: 'book', title: 'A passage', artist: 'A writer', year: 1920, kind: 'Literature',
    media: { type: 'text', name: 'Literature excerpt', content: 'Call me Ishmael.' },
  },
];

test('a .humster ZIP round-trips details and bundled media', async () => {
  const archive = await createCollection(works);
  const imported = await readCollection(archive);
  assert.deepEqual(imported.map(({ title, year, kind }) => ({ title, year, kind })), works.map(({ title, year, kind }) => ({ title, year, kind })));
  assert.deepEqual([...new Uint8Array(await imported[0].media.blob.arrayBuffer())], [137, 80, 78, 71]);
  assert.deepEqual([...new Uint8Array(await imported[1].media.blob.arrayBuffer())], [1, 2, 3, 4]);
  assert.equal(imported[2].media.content, 'Call me Ishmael.');
});
