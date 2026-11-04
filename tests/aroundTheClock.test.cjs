const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createInitialAroundTheClockState,
  applyAroundTheClockDart,
  cloneAroundTheClockState,
  getCompletedTargetCount,
  getAverageDartsPerNumber,
} = require('../build/engine-tests/src/engine/aroundTheClock.js');

test('starts at target one with no darts or completed numbers', () => {
  const state = createInitialAroundTheClockState(3);
  assert.equal(state.currentTarget, 1);
  assert.equal(state.dartsThrown, 0);
  assert.equal(state.isFinished, false);
  assert.equal(getCompletedTargetCount(state), 0);
  assert.deepEqual(state.hitsByNumber, { 1: 0, 2: 0, 3: 0 });
});

test('a miss consumes one dart without advancing', () => {
  const state = applyAroundTheClockDart(createInitialAroundTheClockState(2), false);
  assert.equal(state.dartsThrown, 1);
  assert.equal(state.currentTarget, 1);
  assert.equal(state.currentStreak, 0);
});

test('hits advance targets, track streaks and finish the session', () => {
  const initial = createInitialAroundTheClockState(2);
  const afterFirst = applyAroundTheClockDart(initial, true);
  assert.equal(afterFirst.currentTarget, 2);
  assert.equal(afterFirst.bestStreak, 1);
  assert.equal(initial.currentTarget, 1, 'engine must not mutate input state');

  const afterSecond = applyAroundTheClockDart(afterFirst, true);
  assert.equal(afterSecond.isFinished, true);
  assert.equal(afterSecond.hitsByNumber[2], 1);
  assert.equal(afterSecond.bestStreak, 2);
  assert.equal(getCompletedTargetCount(afterSecond), 2);
  assert.equal(getAverageDartsPerNumber(afterSecond), 1);
  assert.equal(applyAroundTheClockDart(afterSecond, true), afterSecond);
});

test('miss breaks streak; cloning protects nested hit counters', () => {
  let state = createInitialAroundTheClockState(3);
  state = applyAroundTheClockDart(state, true);
  state = applyAroundTheClockDart(state, false);
  assert.equal(state.currentStreak, 0);
  assert.equal(state.bestStreak, 1);
  const clone = cloneAroundTheClockState(state);
  clone.hitsByNumber[1] = 100;
  assert.equal(state.hitsByNumber[1], 1);
});
