// src/store/gameStore.ts
import { create } from 'zustand';
import { Player, Match, Leg } from '../types/domain';
import { X01LegState, createInitialLegState, applyVisit } from '../engine/x01';

// simple ID generator for local use
const uuid = () => Math.random().toString(36).slice(2);

interface GameState {
    // Data
    players: Player[];
    matches: Match[];

    // Current x01 match + leg
    currentMatch?: Match;
    currentLegState?: X01LegState;
    currentLegId?: string;

    // Leg wins within the CURRENT match (for quick access)
    currentLegWins: Record<string, number>;

    // Actions
    addPlayer: (name: string, nickname?: string) => Player;

    startMatch: (config: {
        playerIds: string[];
        startScore: number;
        bestOfLegs?: number;
    }) => void;

    addVisit: (dartScores: number[]) => void;

    // Finalise a finished leg, update match, and either:
    // - start next leg, or
    // - finish the match
    // Returns whether match is finished and the matchId.
    finishLegIfNeeded: () => { matchFinished: boolean; matchId?: string };
}

export const useGameStore = create<GameState>((set, get) => ({
    // ----- initial state -----
    players: [],
    matches: [],

    currentMatch: undefined,
    currentLegState: undefined,
    currentLegId: undefined,

    currentLegWins: {},

    // ----- actions -----

    addPlayer: (name: string, nickname?: string) => {
        const newPlayer: Player = {
            id: uuid(),
            name,
            nickname,
            createdAt: new Date().toISOString(),
        };

        set(state => ({
            players: [...state.players, newPlayer],
        }));

        return newPlayer;
    },

    startMatch: ({ playerIds, startScore, bestOfLegs }) => {
        const { matches } = get();

        const matchId = uuid();
        const legId = uuid();

        // bestOfLegs defaults to 1 (single leg) if not provided
        const normalizedBestOfLegs = bestOfLegs ?? 1;

        const initialLegWins: Record<string, number> = {};
        playerIds.forEach(pid => {
            initialLegWins[pid] = 0;
        });

        const newMatch: Match = {
            id: matchId,
            mode: 'X01',
            startScore,
            bestOfLegs: normalizedBestOfLegs,
            createdAt: new Date().toISOString(),
            playerIds,
            legs: [],
            legWinsByPlayer: initialLegWins,
        };

        const initialLegState = createInitialLegState(playerIds, startScore);

        set({
            matches: [...matches, newMatch],
            currentMatch: newMatch,
            currentLegState: initialLegState,
            currentLegId: legId,
            currentLegWins: initialLegWins,
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

        // attach real legId instead of placeholder
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
        if (!currentLegState || !currentMatch || !currentLegId) {
            return { matchFinished: false };
        }
        if (!currentLegState.winnerPlayerId) {
            return { matchFinished: false };
        }

        // ----- 1. Build the completed leg -----
        const completedLeg: Leg = {
            id: currentLegId,
            matchId: currentMatch.id,
            sequence: currentMatch.legs.length + 1,
            startingPlayerId: currentLegState.playerOrder[0],
            winnerPlayerId: currentLegState.winnerPlayerId,
            visits: currentLegState.visits,
        };

        // ----- 2. Update the match with this leg -----
        const updatedLegs = [...currentMatch.legs, completedLeg];

        // Recalculate leg wins
        const legWins: Record<string, number> = {};
        currentMatch.playerIds.forEach(pid => {
            legWins[pid] = 0;
        });

        for (const leg of updatedLegs) {
            if (leg.winnerPlayerId) {
                legWins[leg.winnerPlayerId] = (legWins[leg.winnerPlayerId] ?? 0) + 1;
            }
        }

        const updatedMatch: Match = {
            ...currentMatch,
            legs: updatedLegs,
            legWinsByPlayer: legWins,
        };

        // Replace match in matches array
        const otherMatches = matches.filter(m => m.id !== currentMatch.id);

        // ----- 3. Check if match is finished -----
        const bestOfLegs = updatedMatch.bestOfLegs ?? 1;
        const legsToWin = Math.floor(bestOfLegs / 2) + 1;

        let matchFinished = false;

        for (const pid of updatedMatch.playerIds) {
            if (legWins[pid] >= legsToWin) {
                matchFinished = true;
                break;
            }
        }

        if (matchFinished) {
            const finishedMatch: Match = {
                ...updatedMatch,
                finishedAt: new Date().toISOString(),
            };

            set({
                matches: [...otherMatches, finishedMatch],
                currentMatch: undefined,
                currentLegState: undefined,
                currentLegId: undefined,
                currentLegWins: {},
            });

            return { matchFinished: true, matchId: finishedMatch.id };
        }

        // ----- 4. Match not finished → start a new leg with alternating start -----

        // How many legs have now been played in this match
        const legsPlayed = updatedMatch.legs.length;

        const baseOrder = updatedMatch.playerIds;
        const startIndex = legsPlayed % baseOrder.length;
        const rotatedOrder = [
            ...baseOrder.slice(startIndex),
            ...baseOrder.slice(0, startIndex),
        ];

        const newLegId = uuid();
        const newLegState = createInitialLegState(rotatedOrder, updatedMatch.startScore);

        set({
            matches: [...otherMatches, updatedMatch],
            currentMatch: updatedMatch,
            currentLegState: newLegState,
            currentLegId: newLegId,
            currentLegWins: legWins,
        });

        return { matchFinished: false, matchId: updatedMatch.id };
    },
}));
