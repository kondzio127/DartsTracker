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

// -----------------------------
// Checkout tips ("outs") helpers
// -----------------------------

/**
 * We return strings (e.g. "T20", "D16", "BULL") so the UI can display them easily
 * without needing special types.
 */
export type CheckoutAdvice =
    | {
    kind: 'checkout';
    dartsNeeded: number;
    route: string[]; // e.g. ["T20", "T20", "BULL"]
    message: string;
}
    | {
    kind: 'no-checkout';
    message: string;
    setup?: {
        aim: string;      // what to aim at next
        leaves: number;   // what score you'd leave if you hit it
        nextOut?: string[]; // an example out next turn (optional)
    };
};

type Target = {
    segment: number;
    multiplier: DartMultiplier;
    score: number;
    label: string;       // "20", "T20", "D16", "25", "BULL"
    isFinish: boolean;   // must be a double (or bull) to finish
    finishRank: number;  // preference for finishing double (lower = better)
};

/**
 * Preferred doubles to finish on.
 * This is subjective, but common preferences are D20 and D16.
 * We also allow BULL (50) as a finish.
 */
const FINISH_PREFERENCE: string[] = [
    'D20',
    'D16',
    'D18',
    'D10',
    'D12',
    'D8',
    'D6',
    'D4',
    'D2',
    'BULL',
    // fallback doubles (still valid, just less preferred)
    'D14',
    'D9',
    'D11',
    'D13',
    'D15',
    'D17',
    'D19',
    'D1',
    'D3',
    'D5',
    'D7',
];

const FINISH_RANK: Record<string, number> = FINISH_PREFERENCE.reduce((acc, key, idx) => {
    acc[key] = idx;
    return acc;
}, {} as Record<string, number>);

function targetLabel(segment: number, m: DartMultiplier): string {
    if (segment === 25) return m === 2 ? 'BULL' : '25';
    if (m === 1) return `${segment}`;
    if (m === 2) return `D${segment}`;
    return `T${segment}`;
}

function isFinishTarget(t: { segment: number; multiplier: DartMultiplier }): boolean {
    // double-out rules: any double or double bull
    if (t.segment === 25) return t.multiplier === 2; // bull
    return t.multiplier === 2;
}

/**
 * Build the target list once.
 * Includes:
 * - Singles 1..20
 * - Doubles 1..20
 * - Triples 1..20
 * - 25 (outer bull)
 * - BULL (50)
 */
const ALL_TARGETS: Target[] = (() => {
    const out: Target[] = [];

    for (let n = 1; n <= 20; n++) {
        for (const m of [1, 2, 3] as DartMultiplier[]) {
            const score = computeDartScore(n, m);
            const label = targetLabel(n, m);
            const isFinish = isFinishTarget({ segment: n, multiplier: m });
            const finishRank = isFinish ? (FINISH_RANK[label] ?? 999) : 999;

            out.push({ segment: n, multiplier: m, score, label, isFinish, finishRank });
        }
    }

    // Outer bull (25) and bull (50)
    out.push({
        segment: 25,
        multiplier: 1,
        score: 25,
        label: '25',
        isFinish: false,
        finishRank: 999,
    });

    out.push({
        segment: 25,
        multiplier: 2,
        score: 50,
        label: 'BULL',
        isFinish: true,
        finishRank: FINISH_RANK['BULL'] ?? 999,
    });

    return out;
})();

const FINISH_TARGETS = ALL_TARGETS.filter(t => t.isFinish);

/**
 * Score (rank) a candidate route so we can pick the "most standard" checkout.
 * Lower score = better.
 */
function rankRoute(route: Target[]): number {
    const dartsUsed = route.length;
    const last = route[route.length - 1];

    // 1) Fewer darts is better (1-dart outs > 2-dart outs > 3-dart outs)
    let score = dartsUsed * 10000;

    // 2) Prefer common finishing doubles (D20/D16/etc)
    score += last.finishRank * 10;

    // 3) Slight penalty for finishing on bull (some players dislike bull finishes)
    if (last.label === 'BULL') score += 40;

    // 4) Slight penalty if we use bull/25 earlier (keeps routes more "standard")
    for (let i = 0; i < route.length - 1; i++) {
        if (route[i].label === 'BULL') score += 60;
        if (route[i].label === '25') score += 15;
    }

    // 5) Tie-breaker: prefer higher scoring first dart (more typical)
    score += (200 - route[0].score);

    return score;
}

/**
 * Finds the best checkout route for a given remaining score and available darts.
 *
 * Important rule: you cannot EVER leave 1 after a dart (that's a bust position),
 * so during search we avoid intermediate "remaining == 1".
 */
function findBestCheckoutRoute(remaining: number, dartsLeft: number): { route: Target[]; dartsNeeded: number } | null {
    if (remaining <= 1) return null;
    if (dartsLeft <= 0) return null;

    // If remaining > 170, you cannot checkout in one turn of 3 darts (max is 170).
    // Still might be possible if dartsLeft > 3 (not in our UI), so we keep the check general:
    if (dartsLeft <= 3 && remaining > 170) return null;

    let best: { route: Target[]; dartsNeeded: number; rank: number } | null = null;

    // Try 1 dart, then 2, then 3 (or up to dartsLeft)
    const maxDartsToTry = Math.min(dartsLeft, 3);

    // 1-dart finish
    if (maxDartsToTry >= 1) {
        for (const fin of FINISH_TARGETS) {
            if (fin.score === remaining) {
                const route = [fin];
                const rank = rankRoute(route);
                best = { route, dartsNeeded: 1, rank };
                break; // can't beat a 1-dart finish, but there might be multiple—rank decides, yet 1 dart is top anyway
            }
        }
    }

    // If already found a 1-dart route, no need to search 2/3 darts.
    if (best?.dartsNeeded === 1) return { route: best.route, dartsNeeded: 1 };

    // 2-dart finish
    if (maxDartsToTry >= 2) {
        for (const t1 of ALL_TARGETS) {
            const r1 = remaining - t1.score;
            if (r1 <= 1) continue; // can't leave 0/1 here; 0 would mean it was a 1-dart finish
            for (const fin of FINISH_TARGETS) {
                if (fin.score !== r1) continue;
                const route = [t1, fin];
                const rank = rankRoute(route);
                if (!best || rank < best.rank) best = { route, dartsNeeded: 2, rank };
            }
        }
    }

    // 3-dart finish
    if (maxDartsToTry >= 3) {
        for (const t1 of ALL_TARGETS) {
            const r1 = remaining - t1.score;
            if (r1 <= 1) continue;

            for (const t2 of ALL_TARGETS) {
                const r2 = r1 - t2.score;
                if (r2 <= 1) continue;

                for (const fin of FINISH_TARGETS) {
                    if (fin.score !== r2) continue;
                    const route = [t1, t2, fin];
                    const rank = rankRoute(route);
                    if (!best || rank < best.rank) best = { route, dartsNeeded: 3, rank };
                }
            }
        }
    }

    if (!best) return null;
    return { route: best.route, dartsNeeded: best.dartsNeeded };
}

/**
 * If no checkout is possible with the darts left, we provide a "setup" suggestion:
 * - choose ONE good next dart to aim for
 * - it should leave a finishable number (<=170) if possible
 * - and ideally leave a nice double (D20/D16/etc)
 */
function findSetupSuggestion(remaining: number): { aim: Target; leaves: number; nextOut?: string[] } | null {
    if (remaining <= 1) return null;

    let best:
        | { aim: Target; leaves: number; rank: number; nextOut?: string[] }
        | null = null;

    for (const aim of ALL_TARGETS) {
        // We don't recommend aiming "BULL" for setup unless it is clearly helpful,
        // but it's allowed. We'll let the ranking handle it.
        const leaves = remaining - aim.score;

        // Invalid leaves
        if (leaves <= 1) continue;

        // Prefer leaving a score that is checkoutable next turn (with 3 darts)
        const next = leaves <= 170 ? findBestCheckoutRoute(leaves, 3) : null;
        if (!next) continue;

        // Rank setup:
        // - prefer leaving a checkout in fewer darts next turn
        // - prefer nice finishing doubles next turn
        // - prefer scoring higher now (so aim.score larger)
        const nextFinish = next.route[next.route.length - 1];
        const nextFinishRank = nextFinish.finishRank;

        let rank = 0;
        rank += next.dartsNeeded * 10000;
        rank += nextFinishRank * 10;

        // prefer higher aim score as tiebreaker
        rank += (200 - aim.score);

        // small penalty for bull/25 as setup dart
        if (aim.label === 'BULL') rank += 60;
        if (aim.label === '25') rank += 20;

        if (!best || rank < best.rank) {
            best = {
                aim,
                leaves,
                rank,
                nextOut: next.route.map(t => t.label),
            };
        }
    }

    if (!best) return null;
    return { aim: best.aim, leaves: best.leaves, nextOut: best.nextOut };
}

/**
 * Public function the UI calls.
 * - remaining: your current score left (after darts already entered)
 * - dartsLeft: how many darts remain in THIS turn (3 - dartsAlreadyEntered)
 */
export function getCheckoutAdvice(remaining: number, dartsLeft: number): CheckoutAdvice {
    // Common invalid / edge cases
    if (remaining <= 1) {
        return { kind: 'no-checkout', message: 'No checkout (you cannot finish from 1).' };
    }

    // Try to find a checkout within the darts left
    const out = findBestCheckoutRoute(remaining, dartsLeft);

    if (out) {
        const routeLabels = out.route.map(t => t.label);
        return {
            kind: 'checkout',
            dartsNeeded: out.dartsNeeded,
            route: routeLabels,
            message: `Checkout in ${out.dartsNeeded} dart${out.dartsNeeded === 1 ? '' : 's'}: ${routeLabels.join(' → ')}`,
        };
    }

    // No checkout possible with the darts left.
    // We suggest a setup dart to leave a finishable number next turn.
    const setup = findSetupSuggestion(remaining);

    if (setup) {
        return {
            kind: 'no-checkout',
            message: `No checkout with ${dartsLeft} dart${dartsLeft === 1 ? '' : 's'} left.`,
            setup: {
                aim: setup.aim.label,
                leaves: setup.leaves,
                nextOut: setup.nextOut,
            },
        };
    }

    // Fallback: nothing good found (rare)
    return {
        kind: 'no-checkout',
        message: `No checkout with ${dartsLeft} dart${dartsLeft === 1 ? '' : 's'} left.`,
    };
}

