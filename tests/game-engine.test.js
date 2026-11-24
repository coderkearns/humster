import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceGame, chooseTimelineSlot, createGame, isFinalTurn } from '../src/game-engine.js';

function makeWorks(years) {
  return years.map((year, index) => ({
    id: String(index), title: `Work ${index}`, artist: 'Creator', year, kind: 'Art',
    media: { type: 'image', name: 'clue.png', mime: 'image/png', blob: new Blob(['image']) },
  }));
}

const teams = [{ name: 'North', color: '#123456' }, { name: 'South', color: '#654321' }];

test('the target leaves one starting work for every other team', () => {
  assert.throws(
    () => createGame({ works: makeWorks([1, 2, 3]), teams, target: 3 }),
    /leave one starter for every other team/,
  );
});

test('equal-year works are valid before or after an existing work', () => {
  const works = makeWorks([1900, 1900, 1900, 1900]);
  const before = createGame({ works, teams, target: 3, random: () => 0 });
  chooseTimelineSlot(before, 0);
  assert.equal(before.correct, true);
  const after = createGame({ works, teams, target: 3, random: () => 0 });
  chooseTimelineSlot(after, after.teams[0].timeline.length);
  assert.equal(after.correct, true);
});

test('wrong guesses are recycled after the unclaimed deck is drawn', () => {
  const game = createGame({ works: makeWorks([1, 2, 3, 4, 5]), teams, target: 4, random: () => 0 });
  const firstMiss = game.currentWork;
  for (let turn = 0; turn < 3; turn += 1) {
    chooseTimelineSlot(game, wrongSlot(game));
    assert.equal(game.correct, false);
    advanceGame(game);
  }
  assert.equal(game.round, 2);
  assert.equal(game.currentWork.id, firstMiss.id);
  assert.equal(game.unclaimed.length, 0);
  assert.equal(game.deck.length, 2);
});

function wrongSlot(game) {
  const timeline = game.teams[game.teamIndex].timeline;
  return Array.from({ length: timeline.length + 1 }, (_, index) => index).find((index) => (
    (index > 0 && timeline[index - 1].year > game.currentWork.year)
    || (index < timeline.length && timeline[index].year < game.currentWork.year)
  ));
}

test('a winning team finishes the round after the other team takes its turn', () => {
  const game = createGame({ works: makeWorks([1, 2, 3, 4, 5]), teams, target: 2, random: () => 0.999 });
  chooseTimelineSlot(game, 1);
  assert.equal(game.teams[0].timeline.length, 2);
  assert.equal(isFinalTurn(game), false);
  advanceGame(game);
  assert.equal(game.teamIndex, 1);
  assert.equal(game.revealed, false);
  chooseTimelineSlot(game, 0);
  assert.equal(game.correct, false);
  assert.equal(isFinalTurn(game), true);
  advanceGame(game);
  assert.equal(game.finished, true);
});
