const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('./storage.cjs');
const { useGameStore: store } = require('../build/engine-tests/src/store/gameStore.js');
mock.restore();
test.before(async () => { await store.persist.rehydrate(); });
test.beforeEach(() => { store.setState(store.getInitialState(), true); });
const game = () => store.getState();
const addDart = (segment, multiplier, legId = game().currentLegId) => game().addDart(segment, multiplier, legId);
const start = (score = 501) => game().startMatch({ playerIds: ['a', 'b'], startScore: score });

test('three darts auto-commit with real leg metadata; undo reopens then removes a dart', () => {
  start();
  for (let i = 0; i < 3; i++) addDart(20, 3);
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
  addDart(20, 1);
  addDart(20, 3);
  assert.equal(game().currentLegState.visits[0].isBust, true);
  assert.equal(game().currentLegState.scoresByPlayer.a, 40);
  game().undoDart();
  game().undoDart();
  assert.equal(game().currentLegState.scoresByPlayer.a, 20);
  addDart(10, 2);
  assert.equal(game().matches[0].status, 'COMPLETED');
});

test('checkout finalizes immediately and undo cannot reopen a completed match', () => {
  start(40);
  const result = addDart(20, 2);
  assert.equal(result.matchFinished, true);
  game().undoDart();
  assert.equal(game().matches[0].status, 'COMPLETED');
  assert.equal(game().matches[0].legs[0].winnerPlayerId, 'a');
  assert.equal(game().currentMatch, undefined);
  assert.equal(game().finishLegIfNeeded().matchFinished, false);
});

test('partial turns, empty undo and impossible triple bull', () => {
  start();
  game().undoDart();
  addDart(25, 3);
  assert.equal(game().currentLegState.turnDarts.length, 0);
  addDart(25, 2);
  game().endTurn(game().currentLegId);
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
  addDart(20, 3);
  const saved = mock.values.get('darts-tracker-store-v1');
  store.setState(store.getInitialState(), true);
  mock.values.set('darts-tracker-store-v1', saved);
  await store.persist.rehydrate();
  assert.equal(game().players[0].name, 'Alice');
  assert.equal(game().currentLegState.scoresByPlayer.a, 441);
});

const engine = require('../build/engine-tests/src/engine/x01.js');
const metadata = { visitId: 'visit', nextLegId: 'next-leg', now: '2026-11-09T00:00:00.000Z' };

function pendingCheckout(bestOfLegs = 3) {
  game().startMatch({ playerIds: ['a', 'b'], startScore: 40, bestOfLegs });
  const leg = engine.applyDart(game().currentLegState, engine.createDartThrow(20, 2));
  const committed = engine.commitTurn(leg);
  committed.legState.visits[0].legId = game().currentLegId;
  store.setState({ currentLegState: committed.legState });
}
async function restart() {
  const saved = mock.values.get('darts-tracker-store-v1');
  store.setState(store.getInitialState(), true);
  mock.values.set('darts-tracker-store-v1', saved);
  await store.persist.rehydrate();
}

test('partial turns and early End retain exact darts and score', () => {
  start();
  addDart(20, 3);
  assert.equal(game().currentLegState.turnDarts.length, 1);
  assert.equal(game().currentLegState.visits.length, 0);
  assert.equal(game().currentLegState.scoresByPlayer.a, 441);
  assert.equal(game().endTurn(game().currentLegId).outcome, 'visit-completed');
  assert.deepEqual(game().currentLegState.visits[0].scores, [60]);
});

test('bust variants restore score and rotate exactly once', () => {
  for (const [score, segment, multiplier] of [[40, 20, 3], [40, 13, 3], [20, 20, 1]]) {
    start(score);
    addDart(segment, multiplier);
    const leg = game().currentLegState;
    assert.equal(leg.scoresByPlayer.a, score);
    assert.equal(leg.currentPlayerId, 'b');
    assert.equal(leg.visits.length, 1);
    assert.equal(leg.visits[0].totalScore, 0);
    assert.equal(leg.visits[0].isBust, true);
  }
});

test('double and bull winning darts publish a single completed transition', () => {
  for (const [score, segment] of [[40, 20], [50, 25]]) {
    start(score);
    const oldLegId = game().currentLegId;
    const observed = [];
    const unsubscribe = store.subscribe(state => observed.push(state));
    const result = addDart(segment, 2, oldLegId);
    unsubscribe();
    assert.equal(observed.length, 1);
    assert.equal(observed[0].currentMatch, undefined);
    assert.equal(result.outcome, 'match-completed');
    assert.equal(result.matchId, game().matches.at(-1).id);
    assert.equal(addDart(segment, 2, oldLegId).outcome, 'stale-leg');
    game().finishLegIfNeeded();
    assert.equal(game().matches.at(-1).legs.length, 1);
    assert.equal(game().matches.at(-1).legWinsByPlayer.a, 1);
  }
});

test('leg transitions rotate starters, reject stale dart/End and preserve undo boundary', () => {
  game().startMatch({ playerIds: ['a', 'b', 'c'], startScore: 40, bestOfLegs: 5 });
  for (const starter of ['b', 'c']) {
    const oldLegId = game().currentLegId;
    assert.equal(addDart(20, 2).outcome, 'leg-completed');
    assert.equal(game().currentLegState.currentPlayerId, starter);
    const before = game();
    assert.equal(addDart(20, 2, oldLegId).outcome, 'stale-leg');
    assert.equal(game().endTurn(oldLegId).outcome, 'stale-leg');
    game().finishLegIfNeeded();
    game().undoDart();
    assert.equal(game(), before);
  }
  assert.equal(game().currentMatch.legs.length, 2);
  assert.deepEqual(game().currentLegWins, { a: 1, b: 1, c: 0 });
});

test('unfinished visits and committed visits survive restart and remain undoable', async () => {
  start();
  addDart(20, 3);
  await restart();
  assert.equal(game().currentLegState.turnDarts.length, 1);
  game().undoDart();
  assert.equal(game().currentLegState.scoresByPlayer.a, 501);
  for (let i = 0; i < 3; i++) addDart(20, 3);
  await restart();
  game().undoDart();
  assert.equal(game().currentLegState.turnDarts.length, 3);
  game().undoDart();
  assert.equal(game().currentLegState.scoresByPlayer.a, 381);
});

test('legacy pending checkout recovers during hydration exactly once and persists next leg', async () => {
  pendingCheckout();
  await restart();
  assert.equal(game().currentMatch.legs.length, 1);
  assert.equal(game().currentLegState.currentPlayerId, 'b');
  assert.equal(game().currentLegWins.a, 1);
  const nextLegId = game().currentLegId;
  await restart();
  assert.equal(game().currentLegId, nextLegId);
  assert.equal(game().currentMatch.legs.length, 1);
});

test('legacy match-ending checkout recovers and stays completed across restarts', async () => {
  pendingCheckout(1);
  const matchId = game().currentMatch.id;
  await restart();
  assert.equal(game().currentMatch, undefined);
  assert.equal(game().matches.find(match => match.id === matchId).status, 'COMPLETED');
  await restart();
  game().finishLegIfNeeded();
  assert.equal(game().matches.find(match => match.id === matchId).legs.length, 1);
});

const { getX01RecoveryPersistenceStatus } = require('../build/engine-tests/src/store/gameStore.js');
const storageKey = 'darts-tracker-store-v1';
const tick = () => new Promise(resolve => setImmediate(resolve));

// Intercept the native string storage boundary, not Zustand's JSON storage or setState.
// A delayed write changes durable values only when the test explicitly resolves it.
function controlRecoveryWrites(t) {
  const originalWrite = mock.storage.setItem;
  const writes = [];
  mock.storage.setItem = (key, value) => new Promise((resolve, reject) => {
    writes.push({ value, reject, resolve: () => { mock.values.set(key, value); resolve(); } });
  });
  t.after(() => { mock.storage.setItem = originalWrite; });
  return writes;
}
function seedLegacy(bestOfLegs = 3) {
  pendingCheckout(bestOfLegs);
  const original = mock.values.get(storageKey);
  store.setState(store.getInitialState(), true);
  mock.values.set(storageKey, original);
  return original;
}

test('normal hydration adds no persistence write or extra subscriber notification', async t => {
  start();
  addDart(20, 3);
  const writes = controlRecoveryWrites(t);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  t.after(unsubscribe);
  await store.persist.rehydrate();
  assert.equal(writes.length, 0);
  assert.equal(notifications, 1, 'only the middleware hydration publication');
  assert.equal(store.persist.hasHydrated(), true);
  assert.equal(game().currentLegState.turnDarts.length, 1);
  assert.equal(game().currentLegState.scoresByPlayer.a, 441);
});

test('delayed recovery is not published or reported hydrated until its write succeeds', async t => {
  const original = seedLegacy();
  const writes = controlRecoveryWrites(t);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  t.after(unsubscribe);
  const hydration = store.persist.rehydrate();
  await tick();
  assert.equal(writes.length, 1);
  assert.equal(getX01RecoveryPersistenceStatus().status, 'pending');
  assert.equal(store.persist.hasHydrated(), false);
  assert.equal(game().currentMatch, undefined);
  assert.equal(notifications, 0);
  assert.equal(mock.values.get(storageKey), original);
  writes[0].resolve();
  await hydration;
  assert.equal(getX01RecoveryPersistenceStatus().status, 'saved');
  assert.equal(store.persist.hasHydrated(), true);
  assert.equal(notifications, 1);
  assert.equal(game().currentMatch.legs.length, 1);
  assert.equal(game().currentLegWins.a, 1);
  assert.equal(JSON.parse(mock.values.get(storageKey)).version, 4);
  await store.persist.rehydrate();
  assert.equal(writes.length, 1, 'already recovered data needs no additional write');
});

test('rejected recovery write is observable, handled and retry uses the same next-leg ID', async t => {
  const original = seedLegacy();
  const writes = controlRecoveryWrites(t);
  const hydration = store.persist.rehydrate();
  await tick();
  const failure = new Error('disk unavailable');
  writes[0].reject(failure);
  await hydration; // Zustand catches getItem rejection; Node would fail on an unhandled rejection.
  assert.equal(store.persist.hasHydrated(), false);
  assert.deepEqual(getX01RecoveryPersistenceStatus(), { status: 'failed', error: failure });
  assert.equal(mock.values.get(storageKey), original);
  assert.equal(game().currentMatch, undefined);
  const retry = store.persist.rehydrate();
  await tick();
  assert.equal(getX01RecoveryPersistenceStatus().status, 'pending');
  assert.equal(writes.length, 2);
  assert.equal(writes[1].value, writes[0].value, 'retry preserves generated IDs and timestamp');
  writes[1].resolve();
  await retry;
  assert.equal(getX01RecoveryPersistenceStatus().status, 'saved');
  assert.equal(store.persist.hasHydrated(), true);
  assert.equal(game().currentMatch.legs.length, 1);
  assert.equal(game().currentLegWins.a, 1);
});

test('overlapping hydration serializes pending recovery and publishes one next leg', async t => {
  seedLegacy();
  const writes = controlRecoveryWrites(t);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  t.after(unsubscribe);
  const first = store.persist.rehydrate();
  await tick();
  const second = store.persist.rehydrate();
  await tick();
  assert.equal(writes.length, 1);
  assert.equal(store.persist.hasHydrated(), false);
  const nextLegId = JSON.parse(writes[0].value).state.currentLegId;
  writes[0].resolve();
  await Promise.all([first, second]);
  assert.equal(writes.length, 1);
  assert.equal(notifications, 1, 'Zustand discards the superseded hydration result');
  assert.equal(game().currentLegId, nextLegId);
  assert.equal(game().currentMatch.legs.length, 1);
  assert.equal(game().currentLegWins.a, 1);
  await store.persist.rehydrate();
  assert.equal(writes.length, 1);
  assert.equal(game().currentLegId, nextLegId);
});

test('overlapping match-ending recovery saves completed history exactly once', async t => {
  seedLegacy(1);
  const writes = controlRecoveryWrites(t);
  const first = store.persist.rehydrate();
  await tick();
  const second = store.persist.rehydrate();
  writes[0].resolve();
  await Promise.all([first, second]);
  assert.equal(writes.length, 1);
  assert.equal(game().currentMatch, undefined);
  assert.equal(game().matches.length, 1);
  assert.equal(game().matches[0].status, 'COMPLETED');
  assert.equal(game().matches[0].legs.length, 1);
  assert.equal(game().matches[0].legWinsByPlayer.a, 1);
  await store.persist.rehydrate();
  assert.equal(writes.length, 1);
  assert.equal(game().matches[0].legs.length, 1);
});
