// src/types/domain.ts

// Your game modes – we start with X01 only, practice later
export type GameMode = 'X01'; // later: | 'AROUND_THE_CLOCK' | 'BOBS_27'

// A person that can play darts in the app
export interface Player {
    id: string;          // internal ID
    name: string;        // e.g. "Konrad"
    nickname?: string;   // optional, e.g. "kondzio"
    createdAt: string;   // ISO date string
}

// One match = a group of legs between 1–4 players
export interface Match {
    id: string;
    mode: GameMode;
    startScore: number;      // 301, 501, 701 etc.
    bestOfLegs?: number;     // e.g. best of 5 (optional for now)
    bestOfSets?: number;     // future
    createdAt: string;
    finishedAt?: string;

    playerIds: string[];     // IDs in throwing order
    legs: Leg[];             // all legs played in this match
}

// One leg = playing from startScore down to 0 once
export interface Leg {
    id: string;
    matchId: string;
    sequence: number;        // leg number in the match: 1, 2, 3 ...
    startingPlayerId: string;
    winnerPlayerId?: string;
    visits: Visit[];         // all turns in this leg
}

// One visit = up to 3 darts thrown by one player
export interface Visit {
    id: string;
    legId: string;
    playerId: string;

    // per-dart scores (e.g. [60, 60, 60] for 180 or [20, 1, 5])
    scores: number[];

    totalScore: number;      // sum(scores)
    remainingAfter: number;  // score remaining after this visit
    isBust: boolean;
    isCheckout: boolean;     // this visit finished the leg
    createdAt: string;
}
