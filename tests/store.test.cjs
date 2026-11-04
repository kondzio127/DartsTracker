const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./storage.cjs');
const { useGameStore: store } = require('../build/engine-tests/src/store/gameStore.js');
mock.restore();
test.before(async () => { await store.persist.rehydrate(); });
test.beforeEach(() => { store.setState(store.getInitialState(), true); });
const game = () => store.getState();
const start = (score = 501) => game().startMatch({ playerIds: ['a', 'b'], startScore: score });

test('three darts auto-commit with real leg metadata; undo reopens then removes a dart', () => {
  start();
  for (let i = 0; i < 3; i++) game().addDart(20, 3);
  assert.equal(game().currentLegState.currentPlayerId, 'b');
  assert.equal(game().currentLegState.visits[0].legId, game().currentLegId);
  game().undoDart();
  assert.equal(game().currentLegState.currentPlayerId, 'a');
  assert.equal(game().currentLegState.turnDarts.length, 3);
  assert.equal(game().currentLegState.visits.length, 0);
  game().undoDart();
  assert.equal(game().currentLegState.scoresByPlayer.a, 381);
});

test('bust auto-commits; undo restores score and allows correction', () => {
  start(40);
  game().addDart(20, 1);
  game().addDart(20, 3);
  assert.equal(game().currentLegState.visits[0].isBust, true);
  assert.equal(game().currentLegState.scoresByPlayer.a, 40);
  game().undoDart();
  game().undoDart();
  assert.equal(game().currentLegState.scoresByPlayer.a, 20);
  game().addDart(10, 2);
  assert.equal(game().currentLegState.winnerPlayerId, 'a');
});

test('checkout can be reopened before finalization; match completion preserves history', () => {
  start(40);
  game().addDart(20, 2);
  game().undoDart();
  game().undoDart();
  assert.equal(game().currentLegState.scoresByPlayer.a, 40);
  game().addDart(20, 2);
  const result = game().finishLegIfNeeded();
  assert.equal(result.matchFinished, true);
  assert.equal(game().matches[0].status, 'COMPLETED');
  assert.equal(game().matches[0].legs[0].winnerPlayerId, 'a');
  assert.equal(game().currentMatch, undefined);
});

test('partial turns, empty undo and impossible triple bull', () => {
  start();
  game().undoDart();
  game().addDart(25, 3);
  assert.equal(game().currentLegState.turnDarts.length, 0);
  game().addDart(25, 2);
  game().endTurn();
  assert.deepEqual(game().currentLegState.visits[0].scores, [50]);
  assert.equal(game().currentLegState.currentPlayerId, 'b');
});

test('Around the Clock rotates after three darts and undo crosses the turn boundary', () => {
  game().startAroundTheClock(['a', 'b'], 3);
  game().registerAroundTheClockDart(true);
  game().registerAroundTheClockDart(false);
  game().registerAroundTheClockDart(false);
  assert.equal(game().aroundTheClockCurrentPlayerIndex, 1);
  game().undoAroundTheClockDart();
  assert.equal(game().aroundTheClockCurrentPlayerIndex, 0);
  assert.equal(game().aroundTheClockDartInTurn, 2);
  assert.equal(game().aroundTheClockStatesByPlayer.a.dartsThrown, 2);
});

test('Around the Clock winning dart records results and undo removes only that session', () => {
  game().startAroundTheClock(['a'], 1);
  game().registerAroundTheClockDart(true);
  const previous = game().aroundTheClockSessions[0];
  game().startAroundTheClock(['a', 'b'], 1);
  game().registerAroundTheClockDart(true);
  assert.equal(game().aroundTheClockWinnerPlayerId, 'a');
  assert.equal(game().aroundTheClockSessions.length, 2);
  assert.equal(game().aroundTheClockSessions[1].results[1].completed, false);
  game().registerAroundTheClockDart(true);
  assert.equal(game().aroundTheClockSessions.length, 2);
  game().undoAroundTheClockDart();
  assert.equal(game().aroundTheClockWinnerPlayerId, undefined);
  assert.deepEqual(game().aroundTheClockSessions, [previous]);
  assert.equal(game().aroundTheClockStatesByPlayer.a.dartsThrown, 0);
});

test('persisted game rehydrates without losing active match or player data', async () => {
  game().addPlayer('Alice');
  start();
  game().addDart(20, 3);
  const saved = mock.values.get('darts-tracker-store-v1');
  store.setState(store.getInitialState(), true);
  mock.values.set('darts-tracker-store-v1', saved);
  await store.persist.rehydrate();
  assert.equal(game().players[0].name, 'Alice');
  assert.equal(game().currentLegState.scoresByPlayer.a, 441);
});
