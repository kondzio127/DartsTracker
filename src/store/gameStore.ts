// src/store/gameStore.ts
import { create } from 'zustand';
import { Player, Match, Leg } from '../types/domain';
import { X01LegState, createInitialLegState, applyVisit } from '../engine/x01';

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

    // Current leg state for the active match
    currentLegState?: X01LegState;
    currentLegId?: string;

    // Actions (functions we can call from components)
    addPlayer: (name: string, nickname?: string) => Player;
    startMatch: (config: {
        playerIds: string[];
        startScore: number;
        bestOfLegs?: number;
    }) => void;

    addVisit: (dartScores: number[]) => void;
    finishLegIfNeeded: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    // ----- initial state -----
    players: [],
    matches: [],
    currentMatch: undefined,
    currentLegState: undefined,
    currentLegId: undefined,

    // ----- actions -----

    // Create a new Player and add it to the list
    addPlayer: (name: string, nickname?: string) => {
        const newPlayer: Player = {
            id: uuid(),
            name,
            nickname,
            createdAt: new Date().toISOString(),
        };

        // 'set' lets us update the store based on the previous state
        set(state => ({
            players: [...state.players, newPlayer],
        }));

        return newPlayer;
    },

// Start a new match with existing players
    startMatch: ({ playerIds, startScore, bestOfLegs }) => {
        const { matches } = get();

        const matchId = uuid();
        const legId = uuid();

        const newMatch: Match = {
            id: matchId,
            mode: 'X01',
            startScore,
            bestOfLegs,
            createdAt: new Date().toISOString(),
            playerIds,
            legs: [],
        };

        const initialLegState = createInitialLegState(playerIds, startScore);

        set({
            matches: [...matches, newMatch],
            currentMatch: newMatch,
            currentLegState: initialLegState,
            currentLegId: legId,
        });
    },

    addVisit: (dartScores: number[]) => {
        const { currentLegState, currentMatch, currentLegId } = get();
        if (!currentLegState || !currentMatch || !currentLegId) {
            console.warn('No active leg/match to add a visit to.');
            return;
        }

        const { legState: updatedLegState, visit } = applyVisit({
            legState: currentLegState,
            playerId: currentLegState.currentPlayerId,
            dartScores,
        });

        // attach the real legId instead of the placeholder
        const visitWithLegId = { ...visit, legId: currentLegId };

        const newLegState: X01LegState = {
            ...updatedLegState,
            visits: [
                ...updatedLegState.visits.slice(0, -1),
                visitWithLegId,
            ],
        };

        set({
            currentLegState: newLegState,
        });
    },

    finishLegIfNeeded: () => {
        const { currentLegState, currentMatch, currentLegId, matches } = get();
        if (!currentLegState || !currentMatch || !currentLegId) return;
        if (!currentLegState.winnerPlayerId) return;

        const leg: Leg = {
            id: currentLegId,
            matchId: currentMatch.id,
            sequence: currentMatch.legs.length + 1,
            startingPlayerId: currentLegState.playerOrder[0],
            winnerPlayerId: currentLegState.winnerPlayerId,
            visits: currentLegState.visits,
        };

        const updatedMatch: Match = {
            ...currentMatch,
            legs: [...currentMatch.legs, leg],
            finishedAt: new Date().toISOString(),
        };

        const otherMatches = matches.filter(m => m.id !== currentMatch.id);

        set({
            matches: [...otherMatches, updatedMatch],
            currentMatch: undefined,
            currentLegState: undefined,
            currentLegId: undefined,
        });
    },
}));
