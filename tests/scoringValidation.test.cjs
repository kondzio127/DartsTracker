const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateDartLanding, validateIntendedTarget, validateDetailedDartInput,
  validateDartsUsed, validateVisitTotalInput, getLandingScore,
} = require('../build/engine-tests/src/engine/scoringValidation.js');
const { createInitialLegState, createDartThrow, applyDart, commitTurn } = require('../build/engine-tests/src/engine/x01.js');

const known = count => ({ kind: 'known', count });
const unknown = { kind: 'unknown' };
const number = (segment, multiplier = 1) => ({ kind: 'number', segment, multiplier });
const visit = (result, count = known(3)) => ({ kind: 'visit-total', dartsUsed: count, result });
const score = total => ({ kind: 'score', total });
const bust = attemptedTotal => ({ kind: 'bust', attemptedTotal });
const checkout = total => ({ kind: 'checkout', total, doubleOutConfirmed: true });
function valid(result) {
  assert.equal(result.valid, true, JSON.stringify(result));
  return result.value;
}
function invalid(result, code, path) {
  assert.equal(result.valid, false, JSON.stringify(result));
  if (code) assert.equal(result.error.code, code);
  if (path) assert.equal(result.error.path, path);
  assert.ok(result.error.message.length > 0);
}

test('all legal numbered landings and bulls have their exact scores; miss is a known zero', () => {
  for (let segment = 1; segment <= 20; segment++) {
    for (const multiplier of [1, 2, 3]) {
      const landing = valid(validateDartLanding(number(segment, multiplier)));
      assert.equal(getLandingScore(landing), segment * multiplier);
    }
  }
  for (const multiplier of [1, 2]) {
    const landing = valid(validateDartLanding({ kind: 'bull', multiplier }));
    assert.equal(getLandingScore(landing), 25 * multiplier);
  }
  assert.equal(getLandingScore(valid(validateDartLanding({ kind: 'miss' }))), 0);
  invalid(validateDartLanding(undefined));
  invalid(validateDartLanding(null));
});

test('invalid segments, multipliers, triple bull, malformed shapes and redundant scores are rejected', () => {
  for (const segment of [0, -1, 21, 25, 50, 1.5, NaN, Infinity, '20', null, undefined]) {
    invalid(validateDartLanding(number(segment)), 'INVALID_SEGMENT', 'landing.segment');
  }
  for (const multiplier of [0, 4, -1, 1.5, NaN, '2', null, undefined]) {
    invalid(validateDartLanding({ kind: 'number', segment: 20, multiplier }), 'INVALID_MULTIPLIER');
  }
  invalid(validateDartLanding({ kind: 'bull', multiplier: 3 }), 'INVALID_MULTIPLIER', 'landing.multiplier');
  for (const input of [[], {}, 'miss', { kind: 'unknown' }, { kind: 'miss', score: 0 }, { ...number(20), score: 60 }]) {
    invalid(validateDartLanding(input), 'INVALID_SHAPE');
  }
});

test('optional and explicitly unknown intention stay unknown; intended target is independent of landing', () => {
  assert.deepEqual(valid(validateIntendedTarget(undefined)), unknown);
  assert.deepEqual(valid(validateIntendedTarget(unknown)), unknown);
  const input = { kind: 'dart', source: 'keypad', landing: number(20), intendedTarget: number(20, 2) };
  assert.deepEqual(valid(validateDetailedDartInput(input)), input);
  for (const source of ['keypad', 'dartboard']) {
    const dart = valid(validateDetailedDartInput({ kind: 'dart', source, landing: { kind: 'miss' } }));
    assert.deepEqual(dart.intendedTarget, unknown);
    assert.equal(getLandingScore(dart.landing), 0);
  }
  assert.deepEqual(valid(validateIntendedTarget({ kind: 'any-ring', segment: 20 })), { kind: 'any-ring', segment: 20 });
  assert.deepEqual(valid(validateIntendedTarget({ kind: 'bull', multiplier: 2 })), { kind: 'bull', multiplier: 2 });
});

test('invalid intentions, missing landings and invalid sources return field errors', () => {
  invalid(validateIntendedTarget({ kind: 'miss' }), 'INVALID_INTENTION');
  invalid(validateIntendedTarget(null), 'INVALID_INTENTION');
  invalid(validateIntendedTarget({ kind: 'unknown', segment: 20 }));
  invalid(validateIntendedTarget({ kind: 'any-ring', segment: 21 }), 'INVALID_SEGMENT');
  invalid(validateIntendedTarget({ kind: 'any-ring', segment: 20, multiplier: 2 }));
  invalid(validateIntendedTarget({ kind: 'bull', multiplier: 3 }), 'INVALID_MULTIPLIER');
  invalid(validateDetailedDartInput({ kind: 'dart', source: 'automatic', landing: number(1) }), 'INVALID_SOURCE', 'source');
  invalid(validateDetailedDartInput({ kind: 'dart', source: 'keypad' }), 'INVALID_SHAPE', 'landing');
});

test('known dart counts require 1–3; unknown remains distinct from zero and three', () => {
  for (const count of [1, 2, 3]) assert.deepEqual(valid(validateDartsUsed(known(count))), known(count));
  assert.deepEqual(valid(validateDartsUsed(unknown)), unknown);
  for (const count of [0, 4, -1, 1.5, NaN, Infinity, '3', null, undefined]) {
    invalid(validateDartsUsed(known(count)), 'INVALID_DART_COUNT');
  }
  for (const count of [undefined, null, 3, {}, { kind: 'unknown', count: 3 }]) {
    invalid(validateDartsUsed(count), 'INVALID_DART_COUNT');
  }
});

test('ordinary totals must be reachable with the exact known count, including gaps below the maximum', () => {
  for (const [total, count] of [[0, 1], [25, 1], [50, 1], [60, 1], [100, 2], [120, 2], [171, 3], [180, 3]]) {
    assert.deepEqual(valid(validateVisitTotalInput(visit(score(total), known(count)), 501)), visit(score(total), known(count)));
  }
  for (const [total, count] of [[23, 1], [49, 1], [59, 1], [61, 1], [109, 2], [119, 2], [121, 2], [175, 3], [178, 3], [179, 3]]) {
    invalid(validateVisitTotalInput(visit(score(total), known(count)), 501), 'IMPOSSIBLE_VISIT');
  }
});

test('unknown counts allow any feasible 1–3 dart count without inferring or fabricating observations', () => {
  for (const total of [0, 23, 100, 180]) {
    const input = visit(score(total), unknown);
    const output = valid(validateVisitTotalInput(input, 501));
    assert.deepEqual(output, input);
    assert.deepEqual(output.dartsUsed, unknown);
    assert.deepEqual(Object.keys(output).sort(), ['dartsUsed', 'kind', 'result']);
  }
  invalid(validateVisitTotalInput(visit(score(179), unknown), 501), 'IMPOSSIBLE_VISIT');
  invalid(validateVisitTotalInput({ ...visit(score(100)), darts: [number(20, 3)] }, 501), 'INVALID_SHAPE');
});

test('ordinary zero and declared bust are distinct; bust declarations must actually be possible', () => {
  assert.deepEqual(valid(validateVisitTotalInput(visit(score(0)), 40)).result, score(0));
  assert.deepEqual(valid(validateVisitTotalInput(visit(bust(null), unknown), 40)).result, bust(null));
  valid(validateVisitTotalInput(visit(bust(39), known(1)), 40)); // T13 leaves one.
  valid(validateVisitTotalInput(visit(bust(60), known(1)), 40)); // Overscore.
  valid(validateVisitTotalInput(visit(bust(20), known(1)), 20)); // Single 20 fails double-out.
  valid(validateVisitTotalInput(visit(bust(40), known(2)), 40)); // S20, S20 can bust.
  invalid(validateVisitTotalInput(visit(bust(40), known(1)), 40), 'IMPOSSIBLE_VISIT'); // D20 would win.
  invalid(validateVisitTotalInput(visit(bust(0)), 40), 'IMPOSSIBLE_VISIT');
  invalid(validateVisitTotalInput(visit(bust(20)), 40), 'IMPOSSIBLE_VISIT');
  invalid(validateVisitTotalInput(visit(bust(null), unknown), 501), 'IMPOSSIBLE_VISIT');
  invalid(validateVisitTotalInput(visit(bust(null), known(2)), 122), 'IMPOSSIBLE_VISIT');
  valid(validateVisitTotalInput(visit(bust(null), known(2)), 121)); // Two T20s leave one.
});

test('possibility checks stop at the first bust or checkout', () => {
  invalid(validateVisitTotalInput(visit(bust(180), known(3)), 40), 'IMPOSSIBLE_VISIT');
  valid(validateVisitTotalInput(visit(bust(60), known(3)), 40)); // Misses before the bust are possible.
  valid(validateVisitTotalInput(visit(checkout(40), known(3)), 40)); // Misses before D20 are possible.
});

test('an early bust preserves the attempted total while the existing engine credits zero', () => {
  const declaration = valid(validateVisitTotalInput(visit(bust(60), known(1)), 40));
  const leg = applyDart(createInitialLegState(['a', 'b'], 40), createDartThrow(20, 3));
  const committed = commitTurn(leg);
  assert.deepEqual(declaration.result, { kind: 'bust', attemptedTotal: 60 });
  assert.equal(committed.committedVisit.totalScore, 0);
  assert.equal(committed.legState.scoresByPlayer.a, 40);
  assert.equal(committed.legState.currentPlayerId, 'b');
  assert.deepEqual(committed.committedVisit.scores, [60]);
  assert.equal(committed.committedVisit.scores.length, declaration.dartsUsed.count);
});

test('known outcomes do not reveal missing intentions, dart counts or individual observations', () => {
  for (const landing of [number(20, 2), { kind: 'bull', multiplier: 2 }, { kind: 'miss' }]) {
    for (const intendedTarget of [undefined, unknown]) {
      const dart = valid(validateDetailedDartInput({ kind: 'dart', source: 'keypad', landing, intendedTarget }));
      assert.deepEqual(dart.intendedTarget, unknown);
    }
  }
  // Even a one-dart checkout candidate must not become an asserted landing/count.
  for (const result of [score(0), score(20), bust(null), bust(60), checkout(40)]) {
    const input = visit(result, unknown);
    const output = valid(validateVisitTotalInput(input, 40));
    assert.deepEqual(output, input);
    assert.deepEqual(output.dartsUsed, unknown);
    assert.deepEqual(Object.keys(output).sort(), ['dartsUsed', 'kind', 'result']);
  }
});

test('unexpected fields are rejected at every input boundary, including nested declarations', () => {
  const dart = { kind: 'dart', source: 'keypad', landing: number(20) };
  const cases = [
    [validateDartLanding, number(20)],
    [validateDartLanding, { kind: 'bull', multiplier: 2 }],
    [validateDartLanding, { kind: 'miss' }],
    [validateIntendedTarget, number(20, 2)],
    [validateIntendedTarget, { kind: 'any-ring', segment: 20 }],
    [validateIntendedTarget, unknown],
    [validateDartsUsed, known(2)],
    [validateDartsUsed, unknown],
    [validateDetailedDartInput, dart],
    [input => validateVisitTotalInput(input, 40), visit(score(20))],
  ];
  for (const [validate, input] of cases) {
    invalid(validate({ ...input, unexpected: true }));
    invalid(validate({ ...input, unexpected: undefined }));
  }
  for (const result of [score(20), bust(null), checkout(40)]) {
    invalid(validateVisitTotalInput(visit({ ...result, creditedTotal: 0 }), 40), 'INVALID_SHAPE', 'result');
    invalid(validateVisitTotalInput({ ...visit(result), darts: [] }, 40), 'INVALID_SHAPE', 'input');
  }
  invalid(validateDetailedDartInput({ ...dart, landing: { ...number(20), score: 20 } }), 'INVALID_SHAPE', 'landing');
  invalid(validateDetailedDartInput({ ...dart, intendedTarget: { ...unknown, segment: 20 } }));
});

test('non-object runtime inputs produce validation errors rather than exceptions', () => {
  const validators = [
    validateDartLanding, validateDetailedDartInput, validateDartsUsed,
    input => validateVisitTotalInput(input, 40),
  ];
  for (const validate of validators) {
    for (const input of [undefined, null, true, false, 40, NaN, Infinity, '40', [], () => {}, 40n, Symbol('input')]) {
      invalid(validate(input));
    }
  }
  // Intention alone deliberately treats undefined as unknown, but not other values.
  assert.deepEqual(valid(validateIntendedTarget(undefined)), unknown);
  for (const input of [null, true, 40, NaN, 'unknown', [], () => {}, 40n, Symbol('input')]) {
    invalid(validateIntendedTarget(input));
  }
});

test('checkout requires literal confirmation, matching remaining score and a feasible final double', () => {
  for (const [total, count] of [[2, 1], [40, 1], [50, 1], [100, 2], [170, 3]]) {
    valid(validateVisitTotalInput(visit(checkout(total), known(count)), total));
  }
  for (const confirmation of [undefined, false, 'true', 1, null]) {
    invalid(validateVisitTotalInput(visit({ ...checkout(40), doubleOutConfirmed: confirmation }), 40), 'CHECKOUT_CONFIRMATION_REQUIRED');
  }
  invalid(validateVisitTotalInput(visit(checkout(40)), 50), 'OUTCOME_MISMATCH');
  for (const [total, count] of [[3, 1], [25, 1], [60, 1], [100, 1], [170, 2], [169, 3], [171, 3]]) {
    invalid(validateVisitTotalInput(visit(checkout(total), known(count)), total), 'IMPOSSIBLE_VISIT');
  }
  assert.deepEqual(valid(validateVisitTotalInput(visit(checkout(170), unknown), 170)).dartsUsed, unknown);
});

test('ordinary scoring cannot hide a bust or unconfirmed checkout', () => {
  for (const total of [39, 40, 60]) {
    invalid(validateVisitTotalInput(visit(score(total)), 40), 'OUTCOME_MISMATCH');
  }
});

test('malformed totals and invalid context fail without throwing or coercing', () => {
  for (const total of [-1, 181, 1.5, NaN, Infinity, '40', null, undefined]) {
    invalid(validateVisitTotalInput(visit(score(total)), 501), 'INVALID_TOTAL', 'result.total');
    invalid(validateVisitTotalInput(visit(bust(total === null ? undefined : total)), 40), 'INVALID_TOTAL');
  }
  for (const remaining of [0, 1, -1, 2.5, NaN, Infinity, '40', null, Number.MAX_SAFE_INTEGER + 1]) {
    invalid(validateVisitTotalInput(visit(score(0)), remaining), 'INVALID_REMAINING');
  }
  for (const value of [null, [], {}, visit({ kind: 'other' }), visit({ ...score(10), doubleOutConfirmed: true })]) {
    invalid(validateVisitTotalInput(value, 501), 'INVALID_SHAPE');
  }
});

test('validators do not mutate inputs and return fresh domain objects', () => {
  const input = Object.freeze({ kind: 'dart', source: 'keypad', landing: Object.freeze(number(20, 3)), intendedTarget: Object.freeze(unknown) });
  const output = valid(validateDetailedDartInput(input));
  assert.deepEqual(output, input);
  assert.notEqual(output.landing, input.landing);
  const total = Object.freeze({ kind: 'visit-total', dartsUsed: Object.freeze(known(2)), result: Object.freeze(score(100)) });
  const result = valid(validateVisitTotalInput(total, 501));
  assert.deepEqual(result, total);
  assert.notEqual(result, total);
  assert.notEqual(result.result, total.result);
});

test('one- and two-dart total declarations agree with the existing X01 engine', () => {
  const darts = [createDartThrow(0, 1), createDartThrow(25, 1), createDartThrow(25, 2)];
  for (let segment = 1; segment <= 20; segment++) {
    for (const multiplier of [1, 2, 3]) darts.push(createDartThrow(segment, multiplier));
  }
  for (const remaining of [2, 20, 40, 50, 61]) {
    for (const count of [1, 2]) {
      let endings = [{ state: createInitialLegState(['a'], remaining), total: 0 }];
      for (let index = 0; index < count; index++) {
        endings = endings.flatMap(prefix => prefix.state.turnStatus !== 'IN_PROGRESS' ? [] :
          darts.map(dart => ({ state: applyDart(prefix.state, dart), total: prefix.total + dart.score })));
      }
      const possible = new Set(endings.map(({ state, total }) => {
        const kind = { IN_PROGRESS: 'score', BUST: 'bust', CHECKOUT: 'checkout' }[state.turnStatus];
        return `${kind}:${total}`;
      }));
      for (let total = 0; total <= count * 60; total++) {
        for (const result of [score(total), bust(total), checkout(total)]) {
          const actual = validateVisitTotalInput(visit(result, known(count)), remaining);
          assert.equal(actual.valid, possible.has(`${result.kind}:${total}`), `${remaining}, ${count} darts: ${result.kind} ${total}`);
        }
      }
    }
  }
});
