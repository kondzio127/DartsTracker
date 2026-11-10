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

const operations = require('../build/engine-tests/src/application/x01Operations.js');
test('application operations are deterministic, immutable and validate detailed inputs', () => {
  start(40);
  const state = game();
  const snapshot = JSON.stringify(state);
  const input = { kind: 'dart', source: 'keypad', landing: { kind: 'number', segment: 20, multiplier: 2 } };
  const first = operations.recordX01Dart(state, state.currentLegId, input, metadata);
  assert.deepEqual(first, operations.recordX01Dart(state, state.currentLegId, input, metadata));
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(first.state.matches[0].legs[0].visits[0].id, 'visit');
  const invalid = operations.recordX01Dart(state, state.currentLegId,
    { ...input, landing: { kind: 'bull', multiplier: 3 } }, metadata);
  assert.equal(invalid.outcome, 'invalid-input');
  assert.equal(invalid.state, state);
});

test('recovery does not duplicate a leg already archived under the active leg ID', () => {
  pendingCheckout();
  const state = game();
  const first = operations.completeX01LegIfNeeded(state, metadata);
  const inconsistent = { ...state, matches: first.state.matches, currentMatch: first.state.currentMatch };
  const recovered = operations.completeX01LegIfNeeded(inconsistent, metadata);
  assert.equal(recovered.state.currentMatch.legs.length, 1);
  assert.equal(recovered.state.currentLegWins.a, 1);
  assert.equal(operations.completeX01LegIfNeeded(recovered.state, metadata).state, recovered.state);
});
