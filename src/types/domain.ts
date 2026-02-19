// src/types/domain.ts

export type GameMode = 'X01' | 'AROUND_THE_CLOCK';

export interface Player {
    id: string;
    name: string;
    nickname?: string;
    createdAt: string;
}

export interface Match {
    id: string;
    mode: GameMode;
    startScore: number;          // 301, 501, 701 etc.
    bestOfLegs?: number;         // e.g. best of 3, 5, 7
    bestOfSets?: number;         // future, unused for now
    createdAt: string;
    finishedAt?: string;

    playerIds: string[];         // IDs in throwing order
    legs: Leg[];

    // number of legs each player has won in this match
    legWinsByPlayer?: Record<string, number>;
}

export interface Leg {
    id: string;
    matchId: string;
    sequence: number;        // leg number in match: 1, 2, 3, ...
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

// Simple record of an Around the Clock practice session
export interface AroundTheClockSession {
    id: string;
    // we’ll link to Player later – for now we can leave this optional
    playerId?: string;
    createdAt: string;
    finishedAt: string;
    maxTarget: number;
    dartsThrown: number;
    bestStreak: number;
}


