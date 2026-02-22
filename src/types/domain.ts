// src/types/domain.ts

// Dart multipliers used throughout the scoring UI
export type DartMultiplier = 1 | 2 | 3;

export type GameMode = 'X01' | 'AROUND_THE_CLOCK';

export interface Player {
    id: string;
    name: string;
    nickname?: string;

    /**
     * We store the player's "flag" as an ISO-3166 alpha-2 code.
     * Examples:
     *  - "GB" (United Kingdom)
     *  - "BG" (Bulgaria)
     *
     * Why store the code instead of an emoji?
     * - The code is stable and searchable.
     * - We can always render the emoji on screen from the code.
     */
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
    finishedAt?: string;

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
    scores: number[];
    totalScore: number;
    remainingAfter: number;
    isBust: boolean;
    isCheckout: boolean;
    createdAt: string;
}

export interface AroundTheClockSession {
    id: string;
    playerId?: string;
    createdAt: string;
    finishedAt: string;
    maxTarget: number;
    dartsThrown: number;
    bestStreak: number;
}
