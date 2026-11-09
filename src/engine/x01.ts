import { Visit, DartMultiplier } from '../types/domain';

/**
 * A single dart throw in the current turn.
 * segment:
 *  - 0 = miss
 *  - 1..20 = board number
 *  - 25 = bull area
 */
export interface DartThrow {
    segment: number;
    multiplier: DartMultiplier;
    score: number;
}

export type TurnStatus = 'IN_PROGRESS' | 'BUST' | 'CHECKOUT';

export interface X01LegState {
    startScore: number;
    playerOrder: string[];
    scoresByPlayer: Record<string, number>;
    currentPlayerId: string;
    visits: Visit[];
    winnerPlayerId?: string;

    /**
     * Current editable turn.
     * turnStartRemaining = score before this player's current turn started.
     * turnDarts = darts entered so far this turn.
     */
    turnStartRemaining: number;
    turnDarts: DartThrow[];
    turnStatus: TurnStatus;
}

const uuid = () => Math.random().toString(36).slice(2);

/**
 * Convert a board segment + multiplier into the numerical score.
 */
export function computeDartScore(segment: number, multiplier: DartMultiplier): number {
    if (segment <= 0) return 0;

    // bull rules
    if (segment === 25) {
        if (multiplier === 2) return 50;
        return 25;
    }

    return segment * multiplier;
}

export function createDartThrow(segment: number, multiplier: DartMultiplier): DartThrow {
    return {
        segment,
        multiplier,
        score: computeDartScore(segment, multiplier),
    };
}

function isDoubleOut(dart: DartThrow): boolean {
    if (dart.segment === 25) return dart.multiplier === 2; // bull finish
    return dart.multiplier === 2;
}

function nextPlayerId(legState: X01LegState, playerId: string): string {
    const idx = legState.playerOrder.indexOf(playerId);
    const nextIdx = (idx + 1) % legState.playerOrder.length;
    return legState.playerOrder[nextIdx];
}

/**
 * Evaluate the current turn so far.
 * This is used both when:
 * - adding a dart
 * - undoing a dart
 */
function evaluateTurn(startRemaining: number, turnDarts: DartThrow[]): { remainingAfter: number; turnStatus: TurnStatus } {
    if (turnDarts.length === 0) {
        return {
            remainingAfter: startRemaining,
            turnStatus: 'IN_PROGRESS',
        };
    }

    const totalAttempted = turnDarts.reduce((sum, d) => sum + d.score, 0);
    let remaining = startRemaining - totalAttempted;

    // Bust if below 0 or exactly 1
    if (remaining < 0 || remaining === 1) {
        return {
            remainingAfter: startRemaining,
            turnStatus: 'BUST',
        };
    }

    // On 0 you must finish on a double/bull
    if (remaining === 0) {
        const lastDart = turnDarts[turnDarts.length - 1];
        if (isDoubleOut(lastDart)) {
            return {
                remainingAfter: 0,
                turnStatus: 'CHECKOUT',
            };
        }

        // Not finished on a double -> bust
        return {
            remainingAfter: startRemaining,
            turnStatus: 'BUST',
        };
    }

    return {
        remainingAfter: remaining,
        turnStatus: 'IN_PROGRESS',
    };
}

export function createInitialLegState(playerOrder: string[], startScore: number): X01LegState {
    const scoresByPlayer: Record<string, number> = {};
    for (const pid of playerOrder) {
        scoresByPlayer[pid] = startScore;
    }

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
 * Add a dart to the current turn, but DO NOT commit the turn yet.
 * The store decides when to commit:
 * - after 3 darts
 * - on bust
 * - on checkout
 */
export function applyDart(legState: X01LegState, dart: DartThrow): X01LegState {
    if (legState.winnerPlayerId) return legState;
    if (legState.turnStatus !== 'IN_PROGRESS') return legState;
    if (legState.turnDarts.length >= 3) return legState;

    const playerId = legState.currentPlayerId;
    const nextTurnDarts = [...legState.turnDarts, dart];
    const evaluated = evaluateTurn(legState.turnStartRemaining, nextTurnDarts);

    return {
        ...legState,
        turnDarts: nextTurnDarts,
        turnStatus: evaluated.turnStatus,
        scoresByPlayer: {
            ...legState.scoresByPlayer,
            [playerId]: evaluated.remainingAfter,
        },
    };
}

/**
 * Undo the last dart in the current editable turn.
 */
export function undoLastDart(legState: X01LegState): X01LegState {
    if (legState.winnerPlayerId) return legState;
    if (legState.turnDarts.length === 0) return legState;

    const playerId = legState.currentPlayerId;
    const nextTurnDarts = legState.turnDarts.slice(0, -1);
    const evaluated = evaluateTurn(legState.turnStartRemaining, nextTurnDarts);

    return {
        ...legState,
        turnDarts: nextTurnDarts,
        turnStatus: evaluated.turnStatus,
        scoresByPlayer: {
            ...legState.scoresByPlayer,
            [playerId]: evaluated.remainingAfter,
        },
    };
}

export function commitTurn(
    legState: X01LegState,
    metadata?: { id: string; createdAt: string }
): { legState: X01LegState; committedVisit?: Visit } {
    if (legState.winnerPlayerId) {
        return { legState };
    }

    // Nothing to commit
    if (legState.turnDarts.length === 0) {
        return { legState };
    }

    const playerId = legState.currentPlayerId;
    const evaluated = evaluateTurn(legState.turnStartRemaining, legState.turnDarts);

    const isBust = evaluated.turnStatus === 'BUST';
    const isCheckout = evaluated.turnStatus === 'CHECKOUT';

    const rawScores = legState.turnDarts.map(d => d.score);
    const totalScore = isBust ? 0 : rawScores.reduce((sum, s) => sum + s, 0);

    const visit: Visit = {
        id: metadata?.id ?? uuid(),
        legId: 'LEG_TEMP',
        playerId,
        scores: rawScores,
        totalScore,
        remainingBefore: legState.turnStartRemaining,
        remainingAfter: evaluated.remainingAfter,
        isBust,
        isCheckout,
        createdAt: metadata?.createdAt ?? new Date().toISOString(),
        segments: legState.turnDarts.map(d => d.segment),
        multipliers: legState.turnDarts.map(d => d.multiplier),
    };

    const updatedVisits = [...legState.visits, visit];
    const updatedScoresByPlayer = {
        ...legState.scoresByPlayer,
        [playerId]: evaluated.remainingAfter,
    };

    // Checkout -> leg ends immediately
    if (isCheckout) {
        return {
            committedVisit: visit,
            legState: {
                ...legState,
                visits: updatedVisits,
                scoresByPlayer: updatedScoresByPlayer,
                winnerPlayerId: playerId,
                turnDarts: [],
                turnStatus: 'IN_PROGRESS',
            },
        };
    }

    // Otherwise rotate to next player
    const nextPlayer = nextPlayerId(legState, playerId);

    return {
        committedVisit: visit,
        legState: {
            ...legState,
            visits: updatedVisits,
            scoresByPlayer: updatedScoresByPlayer,
            currentPlayerId: nextPlayer,
            turnStartRemaining: updatedScoresByPlayer[nextPlayer],
            turnDarts: [],
            turnStatus: 'IN_PROGRESS',
        },
    };
}

/**
 * End turn early (used if player throws only 1 or 2 darts and wants to stop).
 */
export function endTurn(legState: X01LegState): { legState: X01LegState; committedVisit?: Visit } {
    return commitTurn(legState);
}

export function getLegAverage(legState: X01LegState, playerId: string): number {
    const visits = legState.visits.filter(v => v.playerId === playerId);
    if (visits.length === 0) return 0;

    const totalScored = visits.reduce((sum, v) => sum + (v.totalScore ?? 0), 0);
    const dartsThrown = visits.reduce((sum, v) => {
        const len = Array.isArray(v.scores) && v.scores.length > 0 ? v.scores.length : 3;
        return sum + len;
    }, 0);

    if (dartsThrown === 0) return 0;
    return (totalScored / dartsThrown) * 3;
}

/* ===========================
   CHECKOUT / SETUP ADVICE
   =========================== */

export type CheckoutAdvice =
    | {
    kind: 'checkout';
    dartsNeeded: number;
    route: string[];
    message: string;
}
    | {
    kind: 'no-checkout';
    message: string;
    setup?: {
        aim: string;
        leaves: number;
        nextOut?: string[];
    };
};

type AdviceTarget = {
    segment: number;
    multiplier: DartMultiplier;
    score: number;
    label: string;
    isFinish: boolean;
    finishRank: number;
};

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

function isFinishTarget(target: { segment: number; multiplier: DartMultiplier }): boolean {
    if (target.segment === 25) return target.multiplier === 2;
    return target.multiplier === 2;
}

const ALL_TARGETS: AdviceTarget[] = (() => {
    const out: AdviceTarget[] = [];

    for (let n = 1; n <= 20; n++) {
        for (const m of [1, 2, 3] as DartMultiplier[]) {
            const score = computeDartScore(n, m);
            const label = targetLabel(n, m);
            const isFinish = isFinishTarget({ segment: n, multiplier: m });
            const finishRank = isFinish ? (FINISH_RANK[label] ?? 999) : 999;

            out.push({
                segment: n,
                multiplier: m,
                score,
                label,
                isFinish,
                finishRank,
            });
        }
    }

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

function rankRoute(route: AdviceTarget[]): number {
    const dartsUsed = route.length;
    const last = route[route.length - 1];

    let score = dartsUsed * 10000;
    score += last.finishRank * 10;

    if (last.label === 'BULL') score += 40;

    for (let i = 0; i < route.length - 1; i++) {
        if (route[i].label === 'BULL') score += 60;
        if (route[i].label === '25') score += 15;
    }

    score += 200 - route[0].score;
    return score;
}

function findBestCheckoutRoute(remaining: number, dartsLeft: number): { route: AdviceTarget[]; dartsNeeded: number } | null {
    if (remaining <= 1) return null;
    if (dartsLeft <= 0) return null;
    if (dartsLeft <= 3 && remaining > 170) return null;

    let best: { route: AdviceTarget[]; dartsNeeded: number; rank: number } | null = null;
    const maxDartsToTry = Math.min(dartsLeft, 3);

    // 1 dart
    if (maxDartsToTry >= 1) {
        for (const fin of FINISH_TARGETS) {
            if (fin.score === remaining) {
                const route = [fin];
                const rank = rankRoute(route);
                best = { route, dartsNeeded: 1, rank };
                break;
            }
        }
    }

    if (best?.dartsNeeded === 1) {
        return { route: best.route, dartsNeeded: 1 };
    }

    // 2 darts
    if (maxDartsToTry >= 2) {
        for (const t1 of ALL_TARGETS) {
            const r1 = remaining - t1.score;
            if (r1 <= 1) continue;

            for (const fin of FINISH_TARGETS) {
                if (fin.score !== r1) continue;
                const route = [t1, fin];
                const rank = rankRoute(route);
                if (!best || rank < best.rank) best = { route, dartsNeeded: 2, rank };
            }
        }
    }

    // 3 darts
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

function findSetupSuggestion(remaining: number): { aim: AdviceTarget; leaves: number; nextOut?: string[] } | null {
    if (remaining <= 1) return null;

    let best: { aim: AdviceTarget; leaves: number; rank: number; nextOut?: string[] } | null = null;

    for (const aim of ALL_TARGETS) {
        const leaves = remaining - aim.score;
        if (leaves <= 1) continue;

        const next = leaves <= 170 ? findBestCheckoutRoute(leaves, 3) : null;
        if (!next) continue;

        const nextFinish = next.route[next.route.length - 1];
        const nextFinishRank = nextFinish.finishRank;

        let rank = 0;
        rank += next.dartsNeeded * 10000;
        rank += nextFinishRank * 10;
        rank += 200 - aim.score;

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

export function getCheckoutAdvice(remaining: number, dartsLeft: number): CheckoutAdvice {
    if (remaining <= 1) {
        return { kind: 'no-checkout', message: 'No checkout from 1.' };
    }

    const out = findBestCheckoutRoute(remaining, dartsLeft);

    if (out) {
        const routeLabels = out.route.map(t => t.label);
        return {
            kind: 'checkout',
            dartsNeeded: out.dartsNeeded,
            route: routeLabels,
            message: `Checkout in ${out.dartsNeeded}: ${routeLabels.join(' → ')}`,
        };
    }

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

    return {
        kind: 'no-checkout',
        message: `No checkout with ${dartsLeft} dart${dartsLeft === 1 ? '' : 's'} left.`,
    };
}
