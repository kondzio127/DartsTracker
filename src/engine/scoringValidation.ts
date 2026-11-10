import type {
    BoardNumber, DartLanding, DetailedDartInput, DartsUsed, IntendedTarget,
    ValidationError, ValidationResult, VisitTotalInput,
} from '../types/scoring';

const fail = (code: ValidationError['code'], path: string, message: string): ValidationResult<never> =>
    ({ valid: false, error: { code, path, message } });

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
    return Object.keys(value).every(key => keys.includes(key));
}

function isBoardNumber(value: unknown): value is BoardNumber {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;
}

function isTotal(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 180;
}

function validateLanding(value: unknown, path: string): ValidationResult<DartLanding> {
    if (!isRecord(value)) return fail('INVALID_SHAPE', path, 'Provide a numbered landing, bull, or miss.');
    if (value.kind === 'miss' && hasOnlyKeys(value, ['kind'])) {
        return { valid: true, value: { kind: 'miss' } };
    }
    if (value.kind === 'bull' && hasOnlyKeys(value, ['kind', 'multiplier'])) {
        if (value.multiplier !== 1 && value.multiplier !== 2) {
            return fail('INVALID_MULTIPLIER', `${path}.multiplier`, 'Bull allows only single (25) or double (50); triple bull is invalid.');
        }
        return { valid: true, value: { kind: 'bull', multiplier: value.multiplier } };
    }
    if (value.kind === 'number' && hasOnlyKeys(value, ['kind', 'segment', 'multiplier'])) {
        if (!isBoardNumber(value.segment)) {
            return fail('INVALID_SEGMENT', `${path}.segment`, 'Board numbers must be integers from 1 to 20.');
        }
        if (value.multiplier !== 1 && value.multiplier !== 2 && value.multiplier !== 3) {
            return fail('INVALID_MULTIPLIER', `${path}.multiplier`, 'Numbered segments allow multipliers 1, 2, or 3.');
        }
        return { valid: true, value: { kind: 'number', segment: value.segment, multiplier: value.multiplier } };
    }
    return fail('INVALID_SHAPE', path, 'Use only the fields belonging to the landing kind.');
}

export function validateDartLanding(value: unknown): ValidationResult<DartLanding> {
    return validateLanding(value, 'landing');
}

/** Use after validation; score is derived, never separately accepted from input. */
export function getLandingScore(landing: DartLanding): number {
    if (landing.kind === 'miss') return 0;
    return landing.kind === 'bull' ? 25 * landing.multiplier : landing.segment * landing.multiplier;
}

export function validateIntendedTarget(value: unknown): ValidationResult<IntendedTarget> {
    if (value === undefined) return { valid: true, value: { kind: 'unknown' } };
    if (!isRecord(value)) return fail('INVALID_INTENTION', 'intendedTarget', 'Omit intention or provide an explicit target or unknown intention.');
    if (value.kind === 'unknown' && hasOnlyKeys(value, ['kind'])) {
        return { valid: true, value: { kind: 'unknown' } };
    }
    if (value.kind === 'any-ring' && hasOnlyKeys(value, ['kind', 'segment'])) {
        if (!isBoardNumber(value.segment)) {
            return fail('INVALID_SEGMENT', 'intendedTarget.segment', 'An any-ring target must be an integer from 1 to 20.');
        }
        return { valid: true, value: { kind: 'any-ring', segment: value.segment } };
    }
    const target = validateLanding(value, 'intendedTarget');
    if (!target.valid) return target;
    if (target.value.kind === 'miss') return fail('INVALID_INTENTION', 'intendedTarget', 'A miss is an outcome, not an intended target.');
    return { valid: true, value: target.value };
}

export function validateDetailedDartInput(value: unknown): ValidationResult<DetailedDartInput> {
    if (!isRecord(value) || value.kind !== 'dart' || !hasOnlyKeys(value, ['kind', 'source', 'landing', 'intendedTarget'])) {
        return fail('INVALID_SHAPE', 'input', 'Provide a dart source, landing, and optional intended target.');
    }
    if (value.source !== 'keypad' && value.source !== 'dartboard') {
        return fail('INVALID_SOURCE', 'source', 'Dart source must be keypad or dartboard.');
    }
    const landing = validateDartLanding(value.landing);
    if (!landing.valid) return landing;
    const intention = validateIntendedTarget(value.intendedTarget);
    if (!intention.valid) return intention;
    return { valid: true, value: { kind: 'dart', source: value.source, landing: landing.value, intendedTarget: intention.value } };
}

export function validateDartsUsed(value: unknown): ValidationResult<DartsUsed> {
    if (isRecord(value)) {
        if (value.kind === 'unknown' && hasOnlyKeys(value, ['kind'])) {
            return { valid: true, value: { kind: 'unknown' } };
        }
        if (value.kind === 'known' && hasOnlyKeys(value, ['kind', 'count']) &&
            (value.count === 1 || value.count === 2 || value.count === 3)) {
            return { valid: true, value: { kind: 'known', count: value.count } };
        }
    }
    return fail('INVALID_DART_COUNT', 'dartsUsed', 'Declare 1, 2, or 3 darts, or explicitly mark the count unknown.');
}

// Only numerical possibilities are retained, never a route or dart observations.
const dartPossibilities: ReadonlyArray<{ score: number; double: boolean }> = (() => {
    const unique = new Map<string, { score: number; double: boolean }>();
    const add = (score: number, double: boolean) => unique.set(`${score}:${double}`, { score, double });
    add(0, false);
    add(25, false);
    add(50, true);
    for (let segment = 1; segment <= 20; segment++) {
        for (const multiplier of [1, 2, 3]) add(segment * multiplier, multiplier === 2);
    }
    return [...unique.values()];
})();

function isPossibleVisit(input: VisitTotalInput, remainingBefore: number): boolean {
    let prefixes = new Set([0]);
    const limit = input.dartsUsed.kind === 'known' ? input.dartsUsed.count : 3;
    for (let count = 1; count <= limit; count++) {
        const next = new Set<number>();
        const allowedCount = input.dartsUsed.kind === 'unknown' || count === input.dartsUsed.count;
        for (const prefix of prefixes) {
            for (const dart of dartPossibilities) {
                const total = prefix + dart.score;
                const remaining = remainingBefore - total;
                const bust = remaining < 0 || remaining === 1 || (remaining === 0 && !dart.double);
                const checkout = remaining === 0 && dart.double;
                if (allowedCount) {
                    if (input.result.kind === 'bust' && bust &&
                        (input.result.attemptedTotal === null || input.result.attemptedTotal === total)) return true;
                    if (input.result.kind === 'checkout' && checkout && input.result.total === total) return true;
                    if (input.result.kind === 'score' && !bust && !checkout && input.result.total === total) return true;
                }
                // No darts can follow a bust or checkout: the current engine ends the turn.
                if (!bust && !checkout) next.add(total);
            }
        }
        prefixes = next;
    }
    return false;
}

/** Validates a complete X01 visit declaration, not an editable total-text draft. */
export function validateVisitTotalInput(value: unknown, remainingBefore: number): ValidationResult<VisitTotalInput> {
    if (!Number.isSafeInteger(remainingBefore) || remainingBefore < 2) {
        return fail('INVALID_REMAINING', 'remainingBefore', 'Remaining score must be a safe integer of at least 2.');
    }
    if (!isRecord(value) || value.kind !== 'visit-total' || !hasOnlyKeys(value, ['kind', 'dartsUsed', 'result'])) {
        return fail('INVALID_SHAPE', 'input', 'A total-only visit contains a dart count and result, not individual dart observations.');
    }
    const count = validateDartsUsed(value.dartsUsed);
    if (!count.valid) return count;
    const result = value.result;
    if (!isRecord(result)) return fail('INVALID_SHAPE', 'result', 'Declare an ordinary score, bust, or checkout.');
    let declaration: VisitTotalInput['result'];
    if (result.kind === 'score' && hasOnlyKeys(result, ['kind', 'total'])) {
        if (!isTotal(result.total)) return fail('INVALID_TOTAL', 'result.total', 'Total must be an integer from 0 to 180.');
        if (remainingBefore - result.total < 2) {
            return fail('OUTCOME_MISMATCH', 'result', 'An ordinary score must leave at least 2; declare a bust or confirmed checkout instead.');
        }
        declaration = { kind: 'score', total: result.total };
    } else if (result.kind === 'bust' && hasOnlyKeys(result, ['kind', 'attemptedTotal'])) {
        if (result.attemptedTotal !== null && !isTotal(result.attemptedTotal)) {
            return fail('INVALID_TOTAL', 'result.attemptedTotal', 'Attempted total must be an integer from 0 to 180, or null if unknown.');
        }
        declaration = { kind: 'bust', attemptedTotal: result.attemptedTotal };
    } else if (result.kind === 'checkout' && hasOnlyKeys(result, ['kind', 'total', 'doubleOutConfirmed'])) {
        if (result.doubleOutConfirmed !== true) {
            return fail('CHECKOUT_CONFIRMATION_REQUIRED', 'result.doubleOutConfirmed', 'Confirm that the final dart hit a double or double bull.');
        }
        if (!isTotal(result.total)) return fail('INVALID_TOTAL', 'result.total', 'Checkout total must be an integer from 0 to 180.');
        if (result.total !== remainingBefore) return fail('OUTCOME_MISMATCH', 'result.total', 'A checkout total must equal the remaining score.');
        declaration = { kind: 'checkout', total: result.total, doubleOutConfirmed: true };
    } else {
        return fail('INVALID_SHAPE', 'result', 'Use only the fields belonging to score, bust, or checkout.');
    }
    const input: VisitTotalInput = { kind: 'visit-total', dartsUsed: count.value, result: declaration };
    if (!isPossibleVisit(input, remainingBefore)) {
        return fail('IMPOSSIBLE_VISIT', 'result', 'This result is not possible with the declared darts used and double-out rules. Unknown counts allow 1 to 3 darts.');
    }
    return { valid: true, value: input };
}
