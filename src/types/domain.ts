// src/types/domain.ts

export type DartMultiplier = 1 | 2 | 3;

export type GameMode = 'X01' | 'AROUND_THE_CLOCK';
export type MatchStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

export interface Player {
    id: string;
    name: string;
    nickname?: string;
    flag?: string;
    isHidden?: boolean;
    createdAt: string;
}

export interface Match {
    id: string;
    mode: GameMode;
    startScore: number;
    bestOfLegs?: number;
    bestOfSets?: number;
    createdAt: string;
    status: MatchStatus;
    finishedAt?: string;
    abandonedAt?: string;

    playerIds: string[];
    legs: Leg[];
    legWinsByPlayer?: Record<string, number>;
}

export interface Leg {
    id: string;
    matchId: string;
    sequence: number;
    startingPlayerId: string;
    winnerPlayerId?: string;
    visits: Visit[];
}

export interface Visit {
    id: string;
    legId: string;
    playerId: string;

    // per-dart numeric scores, e.g. [60, 20, 20]
    scores: number[];

    // optional extra metadata for per-dart tracking
    segments?: number[];
    multipliers?: DartMultiplier[];

    totalScore: number;

    // IMPORTANT: needed by the new x01 / undo / stats logic
    remainingBefore: number;
    remainingAfter: number;

    isBust: boolean;
    isCheckout: boolean;
    createdAt: string;
}

export interface AroundTheClockPlayerResult {
    playerId: string;
    completed: boolean;
    /** Highest target completed when the session ended. */
    targetReached: number;
    dartsThrown: number;
    bestStreak: number;
    hitsByNumber: Record<number, number>;
}

export interface AroundTheClockSession {
    id: string;
    playerIds: string[];
    winnerPlayerId?: string;
    createdAt: string;
    finishedAt: string;
    maxTarget: number;
    results: AroundTheClockPlayerResult[];
}
