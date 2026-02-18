// src/store/gameStore.ts
import { create } from 'zustand';
import { Player, Match } from '../types/domain';

// Very simple ID generator for now.
// Good enough for local/offline use.
const uuid = () => Math.random().toString(36).slice(2);

// What lives in our global store
interface GameState {
    // Data
    players: Player[];
    matches: Match[];

    // The match currently being played (if any)
    currentMatch?: Match;

    // Actions (functions we can call from components)
    addPlayer: (name: string, nickname?: string) => Player;
    startMatch: (config: {
        playerIds: string[];
        startScore: number;
        bestOfLegs?: number;
    }) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    // ----- initial state -----
    players: [],
    matches: [],
    currentMatch: undefined,

    // ----- actions -----

    // Create a new Player and add it to the list
    addPlayer: (name: string, nickname?: string) => {
        const newPlayer: Player = {
            id: uuid(),
            name,
            nickname,
            createdAt: new Date().toISOString(),
        };

        // 'set' lets us update the store based on previous state
        set(state => ({
            players: [...state.players, newPlayer],
        }));

        return newPlayer;
    },

// Start a new match with existing players
    startMatch: ({ playerIds, startScore, bestOfLegs }) => {
        const { matches } = get();

        const newMatch: Match = {
            id: uuid(),
            mode: 'X01',
            startScore,
            bestOfLegs,
            createdAt: new Date().toISOString(),
            playerIds,
            legs: [],
            // finishedAt is left undefined until the match ends
        };

        set({
            matches: [...matches, newMatch],
            currentMatch: newMatch,
        });

        // For now, we’re not creating legs or legState yet.
        // That comes in Phase 1 when we wire in the scoring engine.
    },
}));
