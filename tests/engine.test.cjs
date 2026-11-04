const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDartThrow,
  computeDartScore,
  createInitialLegState,
  applyDart,
  undoLastDart,
  commitTurn,
  endTurn,
  getLegAverage,
  getCheckoutAdvice,
} = require('../build/engine-tests/src/engine/x01.js');

function throwDart(state, segment, multiplier) {
  return applyDart(state, createDartThrow(segment, multiplier));
}

test('board scoring covers singles, doubles, triples, misses and bull', () => {
  assert.equal(computeDartScore(20, 1), 20);
  assert.equal(computeDartScore(20, 2), 40);
  assert.equal(computeDartScore(20, 3), 60);
  assert.equal(computeDartScore(0, 1), 0);
  assert.equal(computeDartScore(25, 1), 25);
  assert.equal(computeDartScore(25, 2), 50);
});

test('three darts make one visit and rotate the player', () => {
  let leg = createInitialLegState(['alice', 'bob'], 501);
  leg = throwDart(leg, 20, 3);
  leg = throwDart(leg, 20, 3);
  leg = throwDart(leg, 20, 3);
  assert.equal(leg.scoresByPlayer.alice, 321);
  assert.equal(leg.turnDarts.length, 3);
  const fourthDart = throwDart(leg, 5, 1);
  assert.equal(fourthDart, leg, 'fourth dart must be ignored');

  const { legState, committedVisit } = commitTurn(leg);
  assert.equal(committedVisit.totalScore, 180);
  assert.deepEqual(committedVisit.scores, [60, 60, 60]);
  assert.equal(committedVisit.remainingBefore, 501);
  assert.equal(committedVisit.remainingAfter, 321);
  assert.equal(legState.currentPlayerId, 'bob');
  assert.equal(legState.scoresByPlayer.bob, 501);
  assert.equal(legState.visits.length, 1);
  assert.equal(getLegAverage(legState, 'alice'), 180);
});

test('bust restores the starting score and records a zero-scoring visit', () => {
  let leg = createInitialLegState(['alice', 'bob'], 32);
  leg = throwDart(leg, 20, 3);
  assert.equal(leg.turnStatus, 'BUST');
  assert.equal(leg.scoresByPlayer.alice, 32);
  const { legState, committedVisit } = commitTurn(leg);
  assert.equal(committedVisit.isBust, true);
  assert.equal(committedVisit.totalScore, 0);
  assert.equal(committedVisit.scores.length, 1);
  assert.equal(legState.currentPlayerId, 'bob');
});

test('leaving exactly one is a bust', () => {
  const leg = throwDart(createInitialLegState(['alice'], 40), 13, 3);
  assert.equal(leg.turnStatus, 'BUST');
  assert.equal(leg.scoresByPlayer.alice, 40);
});

test('finishing on a single is a bust in double-out X01', () => {
  const leg = throwDart(createInitialLegState(['alice'], 20), 20, 1);
  assert.equal(leg.turnStatus, 'BUST');
  assert.equal(leg.scoresByPlayer.alice, 20);
});

test('D20 or inner bull checks out and wins the leg', () => {
  for (const [score, segment, multiplier] of [[40, 20, 2], [50, 25, 2]]) {
    const leg = throwDart(createInitialLegState(['alice', 'bob'], score), segment, multiplier);
    assert.equal(leg.turnStatus, 'CHECKOUT');
    const result = commitTurn(leg);
    assert.equal(result.legState.winnerPlayerId, 'alice');
    assert.equal(result.legState.scoresByPlayer.alice, 0);
    assert.equal(result.committedVisit.isCheckout, true);
  }
});

test('undoing an editable dart restores the remaining score', () => {
  let leg = createInitialLegState(['alice'], 501);
  leg = throwDart(leg, 20, 3);
  assert.equal(leg.scoresByPlayer.alice, 441);
  const undone = undoLastDart(leg);
  assert.equal(undone.scoresByPlayer.alice, 501);
  assert.deepEqual(undone.turnDarts, []);
  assert.equal(undone.turnStatus, 'IN_PROGRESS');
});

test('end turn early records only the darts actually thrown', () => {
  const leg = throwDart(createInitialLegState(['alice', 'bob'], 301), 20, 1);
  const result = endTurn(leg);
  assert.equal(result.committedVisit.totalScore, 20);
  assert.equal(result.committedVisit.scores.length, 1);
  assert.equal(result.legState.currentPlayerId, 'bob');
});

test('undo recovers from a bust or uncommitted checkout without mutating the input', () => {
  for (const [segment, multiplier, status] of [[20, 3, 'BUST'], [20, 2, 'CHECKOUT']]) {
    const initial = createInitialLegState(['alice'], 40);
    const thrown = throwDart(initial, segment, multiplier);
    const undone = undoLastDart(thrown);
    assert.equal(thrown.turnStatus, status);
    assert.equal(undone.turnStatus, 'IN_PROGRESS');
    assert.equal(undone.scoresByPlayer.alice, 40);
    assert.equal(initial.turnDarts.length, 0);
    assert.equal(initial.scoresByPlayer.alice, 40);
  }
});

test('finished legs and empty turns ignore further engine operations', () => {
  const initial = createInitialLegState(['alice'], 40);
  assert.equal(commitTurn(initial).legState, initial);
  assert.equal(undoLastDart(initial), initial);
  const finished = commitTurn(throwDart(initial, 20, 2)).legState;
  assert.equal(throwDart(finished, 1, 1), finished);
  assert.equal(undoLastDart(finished), finished);
  assert.equal(commitTurn(finished).legState, finished);
});

test('checkout advice respects available darts and bogey scores', () => {
  assert.deepEqual(getCheckoutAdvice(40, 1).route, ['D20']);
  assert.deepEqual(getCheckoutAdvice(170, 3).route, ['T20', 'T20', 'BULL']);
  assert.equal(getCheckoutAdvice(170, 2).kind, 'no-checkout');
  assert.equal(getCheckoutAdvice(169, 3).kind, 'no-checkout');
});
