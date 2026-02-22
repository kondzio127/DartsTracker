// src/engine/x01.ts
import { Visit } from '../types/domain';

export type DartMultiplier = 1 | 2 | 3;

export type TurnStatus = 'IN_PROGRESS' | 'DONE' | 'BUST' | 'CHECKOUT';

export interface DartThrow {
    segment: number; // 0..20 or 25 (bull). 0 = miss
    multiplier: DartMultiplier;
    score: number; // derived
}

export interface X01LegState {
    startScore: number;
    playerOrder: string[];
    scoresByPlayer: Record<string, number>; // remaining (updates after each dart)
    currentPlayerId: string;

    visits: Visit[];
    winnerPlayerId?: string;

    // Turn-in-progress (for currentPlayerId)
    turnStartRemaining: number;
    turnDarts: DartThrow[];
    turnStatus: TurnStatus;
}

const uuid = () => Math.random().toString(36).slice(2);

export function computeDartScore(segment: number, multiplier: DartMultiplier): number {
    if (segment <= 0) return 0;

    // Bull rules: 25 (single) or 50 (double)
    if (segment === 25) {
        if (multiplier === 2) return 50;
        return 25; // UI should block triple bull
    }

    return segment * multiplier;
}

export function createDartThrow(segment: number, multiplier: DartMultiplier): DartThrow {
    return { segment, multiplier, score: computeDartScore(segment, multiplier) };
}

export function isDoubleOut(dart: DartThrow): boolean {
    if (dart.segment === 25) return dart.multiplier === 2; // double bull
    return dart.multiplier === 2;
}

function nextPlayerId(legState: X01LegState, playerId: string): string {
    const idx = legState.playerOrder.indexOf(playerId);
    const nextIdx = (idx + 1) % legState.playerOrder.length;
    return legState.playerOrder[nextIdx];
}

export function createInitialLegState(playerOrder: string[], startScore: number): X01LegState {
    const scoresByPlayer: Record<string, number> = {};
    for (const pid of playerOrder) scoresByPlayer[pid] = startScore;

    return {
        startScore,
        playerOrder,
        scoresByPlayer,
        currentPlayerId: playerOrder[0],
        visits: [],
        winnerPlayerId: undefined,
        turnStartRemaining: startScore,
        turnDarts: [],
        turnStatus: 'IN_PROGRESS',
    };
}

/**
 * Apply a dart to the CURRENT turn, but DO NOT advance player / do not commit visit.
 * User must press "Next" to commit the turn (DartCounter-style option).
 *
 * Locks the turn when:
 * - bust happens
 * - checkout happens
 * - 3 darts entered (DONE)
 */
export function applyDart(legState: X01LegState, dart: DartThrow): X01LegState {
    if (legState.winnerPlayerId) return legState;

    // Turn locked: require user to press Next (or Undo)
    if (legState.turnStatus !== 'IN_PROGRESS') return legState;

    // Prevent 4th dart
    if (legState.turnDarts.length >= 3) {
        return { ...legState, turnStatus: 'DONE' };
    }

    const playerId = legState.currentPlayerId;

    const turnDarts = [...legState.turnDarts, dart];
    const attemptedTotal = turnDarts.reduce((s, d) => s + d.score, 0);

    const remainingBeforeTurn = legState.turnStartRemaining;
    let newRemaining = remainingBeforeTurn - attemptedTotal;

    let status: TurnStatus = 'IN_PROGRESS';

    // Bust if remaining < 0 or remaining === 1
    if (newRemaining < 0 || newRemaining === 1) {
        status = 'BUST';
        newRemaining = remainingBeforeTurn;
    } else if (newRemaining === 0) {
        // Double-out required
        if (isDoubleOut(dart)) {
            status = 'CHECKOUT';
        } else {
            status = 'BUST';
            newRemaining = remainingBeforeTurn;
        }
    } else if (turnDarts.length === 3) {
        status = 'DONE';
    }

    const newScoresByPlayer = { ...legState.scoresByPlayer, [playerId]: newRemaining };

    return {
        ...legState,
        scoresByPlayer: newScoresByPlayer,
        turnDarts,
        turnStatus: status,
    };
}

export interface CommitTurnResult {
    legState: X01LegState;
    committedVisit?: Visit;
}

/**
 * Commit the current turn:
 * - Creates a Visit from the turn darts (1..3)
 * - Adds to visits
 * - Advances to next player (unless checkout)
 * - Clears turn darts and resets turnStartRemaining for next player
 */
export function commitTurn(legState: X01LegState): CommitTurnResult {
    if (legState.winnerPlayerId) return { legState };

    const playerId = legState.currentPlayerId;

    // If user hits Next with 0 darts, treat as 3 misses.
    const darts = legState.turnDarts.length === 0
        ? [createDartThrow(0, 1), createDartThrow(0, 1), createDartThrow(0, 1)]
        : legState.turnDarts;

    const remainingBefore = legState.turnStartRemaining;

    // Recompute final state for this turn
    let tmp: X01LegState = {
        ...legState,
        turnDarts: [],
        turnStatus: 'IN_PROGRESS',
        scoresByPlayer: { ...legState.scoresByPlayer, [playerId]: remainingBefore },
    };
    for (const d of darts) tmp = applyDart(tmp, d);

    const remainingAfter = tmp.scoresByPlayer[playerId];
    const isBust = tmp.turnStatus === 'BUST';
    const isCheckout = tmp.turnStatus === 'CHECKOUT';

    const scores = tmp.turnDarts.map(d => d.score);
    const totalScore = isBust ? 0 : scores.reduce((s, x) => s + x, 0);

    const visit: Visit = {
        id: uuid(),
        legId: 'LEG_TEMP', // store overwrites
        playerId,
        scores,
        totalScore,
        remainingAfter,
        isBust,
        isCheckout,
        createdAt: new Date().toISOString(),
    };

    let winnerPlayerId = legState.winnerPlayerId;
    let nextPlayer = legState.currentPlayerId;
    let nextTurnStartRemaining = legState.turnStartRemaining;

    if (isCheckout) {
        winnerPlayerId = playerId;
        // keep current player; leg ends
    } else {
        nextPlayer = nextPlayerId(legState, playerId);
        nextTurnStartRemaining = tmp.scoresByPlayer[nextPlayer];
    }

    const newLegState: X01LegState = {
        ...tmp,
        visits: [...legState.visits, visit],
        currentPlayerId: nextPlayer,
        winnerPlayerId,
        turnDarts: [],
        turnStatus: 'IN_PROGRESS',
        turnStartRemaining: nextTurnStartRemaining,
    };

    return { legState: newLegState, committedVisit: visit };
}

/**
 * Convenience: pads with misses up to 3 darts (if IN_PROGRESS) then commits.
 * If bust/checkout already happened, it commits immediately with the darts thrown.
 */
export function endTurn(legState: X01LegState): CommitTurnResult {
    if (legState.winnerPlayerId) return { legState };

    let tmp = legState;
    while (tmp.turnStatus === 'IN_PROGRESS' && tmp.turnDarts.length < 3) {
        tmp = applyDart(tmp, createDartThrow(0, 1));
    }
    return commitTurn(tmp);
}

/**
 * Undo last dart within the current turn.
 * Recomputes turn state from scratch to keep bust/checkout logic consistent.
 */
export function undoLastDart(legState: X01LegState): X01LegState {
    if (legState.winnerPlayerId) return legState;
    if (legState.turnDarts.length === 0) return legState;

    const playerId = legState.currentPlayerId;
    const keep = legState.turnDarts.slice(0, -1);
    const start = legState.turnStartRemaining;

    let tmp: X01LegState = {
        ...legState,
        turnDarts: [],
        turnStatus: 'IN_PROGRESS',
        scoresByPlayer: { ...legState.scoresByPlayer, [playerId]: start },
    };

    for (const d of keep) {
        tmp = applyDart(tmp, d);
    }

    return tmp;
}

export function getLegAverage(legState: X01LegState, playerId: string): number {
    const visits = legState.visits.filter(v => v.playerId === playerId);
    if (visits.length === 0) return 0;

    const totalScored = visits.reduce((sum, v) => sum + (v.totalScore ?? 0), 0);
    const dartsThrown = visits.reduce((sum, v) => sum + (Array.isArray(v.scores) ? v.scores.length : 3), 0);

    if (dartsThrown === 0) return 0;
    return (totalScored / dartsThrown) * 3;
}
