// src/engine/x01.ts
import { Visit } from '../types/domain';

// State for ONE leg of x01 (no match metadata here)
export interface X01LegState {
    startScore: number;
    playerOrder: string[];                    // player IDs in throwing order
    scoresByPlayer: Record<string, number>;   // remaining score per player
    currentPlayerId: string;
    visits: Visit[];
    winnerPlayerId?: string;
}

export interface ApplyVisitInput {
    legState: X01LegState;
    playerId: string;
    dartScores: number[]; // per-dart scores, up to 3 values
}

export interface ApplyVisitResult {
    legState: X01LegState;
    visit: Visit;
}

// quick-and-dirty ID – fine for local/offline
const uuid = () => Math.random().toString(36).slice(2);

// Create initial leg state for given players and start score
export function createInitialLegState(
    playerOrder: string[],
    startScore: number
): X01LegState {
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
    };
}

export function applyVisit(input: ApplyVisitInput): ApplyVisitResult {
    const { legState, playerId, dartScores } = input;

    if (legState.winnerPlayerId) {
        throw new Error('Leg already finished');
    }
    if (playerId !== legState.currentPlayerId) {
        throw new Error("It's not this player's turn");
    }

    const currentRemaining = legState.scoresByPlayer[playerId];
    const totalScore = dartScores.reduce((sum, s) => sum + s, 0);
    let newRemaining = currentRemaining - totalScore;

    let isBust = false;
    let isCheckout = false;

    // x01 rules:
    // - newRemaining < 0 → bust
    // - newRemaining === 1 → bust (can't finish on 1)
    // - newRemaining === 0 → checkout (assume valid double for now)
    if (newRemaining < 0 || newRemaining === 1) {
        isBust = true;
        newRemaining = currentRemaining; // revert
    } else if (newRemaining === 0) {
        isCheckout = true;
    }

    // We'll overwrite legId in the store, so we put a placeholder here
    const visit: Visit = {
        id: uuid(),
        legId: 'LEG_TEMP',
        playerId,
        scores: dartScores,
        totalScore,
        remainingAfter: newRemaining,
        isBust,
        isCheckout,
        createdAt: new Date().toISOString(),
    };

    const newScoresByPlayer = { ...legState.scoresByPlayer };
    newScoresByPlayer[playerId] = newRemaining;

    let winnerPlayerId = legState.winnerPlayerId;
    let currentPlayerId = legState.currentPlayerId;

    if (isCheckout) {
        winnerPlayerId = playerId;
        // currentPlayerId stays the same; leg ends
    } else {
        // move to next player in order
        const idx = legState.playerOrder.indexOf(playerId);
        const nextIdx = (idx + 1) % legState.playerOrder.length;
        currentPlayerId = legState.playerOrder[nextIdx];
    }

    const newLegState: X01LegState = {
        ...legState,
        scoresByPlayer: newScoresByPlayer,
        visits: [...legState.visits, visit],
        currentPlayerId,
        winnerPlayerId,
    };

    return { legState: newLegState, visit };
}

// 3-dart average for a player in THIS leg
export function getLegAverage(legState: X01LegState, playerId: string): number {
    const visits = legState.visits.filter(v => v.playerId === playerId);

    if (visits.length === 0) return 0;

    const totalScored = visits.reduce((sum, v) => sum + v.totalScore, 0);

    // For MVP we assume each visit is 3 darts.
    const dartsThrown = visits.length * 3;

    const perDart = totalScored / dartsThrown;
    return perDart * 3; // 3-dart average
}

