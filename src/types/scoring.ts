import type { DartMultiplier } from './domain';

export type BoardNumber =
    | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
    | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export type BoardTarget =
    | { kind: 'number'; segment: BoardNumber; multiplier: DartMultiplier }
    | { kind: 'bull'; multiplier: 1 | 2 };

/** Miss is a recorded zero; an absent observation is not a miss. */
export type DartLanding = BoardTarget | { kind: 'miss' };

export type IntendedTarget =
    | BoardTarget
    | { kind: 'any-ring'; segment: BoardNumber }
    | { kind: 'unknown' };

export interface DetailedDartInput {
    kind: 'dart';
    source: 'keypad' | 'dartboard';
    landing: DartLanding;
    /** Omitted and explicitly unknown both mean no intention was recorded. */
    intendedTarget?: IntendedTarget;
}

export type DartsUsed =
    | { kind: 'known'; count: 1 | 2 | 3 }
    | { kind: 'unknown' };

/** Total-only declarations intentionally have no individual dart observations. */
export interface VisitTotalInput {
    kind: 'visit-total';
    dartsUsed: DartsUsed;
    result:
        | { kind: 'score'; total: number }
        // A bust always credits zero. This is the attempted sum up to the bust,
        // not the credited score; null means that attempted sum was not recorded.
        | { kind: 'bust'; attemptedTotal: number | null }
        | { kind: 'checkout'; total: number; doubleOutConfirmed: true };
}

export type ScoringInput = DetailedDartInput | VisitTotalInput;

export interface ValidationError {
    code:
        | 'INVALID_SHAPE'
        | 'INVALID_SEGMENT'
        | 'INVALID_MULTIPLIER'
        | 'INVALID_SOURCE'
        | 'INVALID_INTENTION'
        | 'INVALID_DART_COUNT'
        | 'INVALID_TOTAL'
        | 'INVALID_REMAINING'
        | 'CHECKOUT_CONFIRMATION_REQUIRED'
        | 'OUTCOME_MISMATCH'
        | 'IMPOSSIBLE_VISIT';
    path: string;
    message: string;
}

export type ValidationResult<T> =
    | { valid: true; value: T }
    | { valid: false; error: ValidationError };
