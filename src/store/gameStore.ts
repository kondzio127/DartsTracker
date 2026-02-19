// src/store/gameStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';

import { Player, Match, Leg, AroundTheClockSession } from '../types/domain';
import { X01LegState, createInitialLegState, applyVisit } from '../engine/x01';
import {
    AroundTheClockState,
    createInitialAroundTheClockState,
    applyAroundTheClockDart,
} from '../engine/aroundTheClock';

// simple ID generator for local use
const uuid = () => Math.random().toString(36).slice(2);

// Standard Around-the-Clock is usually 3 darts per turn.
// If you prefer switching after every dart, change this to 1.
const DARTS_PER_TURN = 3;

interface GameState {
    // Data
    players: Player[];
    matches: Match[];

    updatePlayer: (playerId: string, updates: Partial<Omit<Player, 'id' | 'createdAt'>>) => void;
    togglePlayerHidden: (playerId: string) => void;

    // Current x01 match + leg
    currentMatch?: Match;
    currentLegState?: X01LegState;
    currentLegId?: string;

    // Leg wins within the CURRENT match (for quick access)
    currentLegWins: Record<string, number>;

    // Around the Clock (per-player state)
    aroundTheClockStatesByPlayer: Record<string, AroundTheClockState>;
    aroundTheClockSessions: AroundTheClockSession[];
    aroundTheClockPlayerIds: string[];
    aroundTheClockCurrentPlayerIndex: number;
    aroundTheClockDartInTurn: number; // 0..DARTS_PER_TURN-1
    aroundTheClockStartedAt?: string;
    aroundTheClockWinnerPlayerId?: string;

    // Actions
    addPlayer: (name: string, nickname?: string, flag?: string) => Player;

    startMatch: (config: {
        playerIds: string[];
        startScore: number;
        bestOfLegs?: number;
    }) => void;

    addVisit: (dartScores: number[]) => void;

    finishLegIfNeeded: () => { matchFinished: boolean; matchId?: string };

    // Practice actions
    startAroundTheClock: (playerIds: string[], maxTarget?: number) => void;
    registerAroundTheClockDart: (hit: boolean) => void;
    resetAroundTheClock: () => void;
}

export const useGameStore = create<GameState>()(
    persist(
        (set, get) => ({
            // ----- initial state -----
            players: [],
            matches: [],

            currentMatch: undefined,
            currentLegState: undefined,
            currentLegId: undefined,
            currentLegWins: {},

            aroundTheClockStatesByPlayer: {},
            aroundTheClockSessions: [],
            aroundTheClockPlayerIds: [],
            aroundTheClockCurrentPlayerIndex: 0,
            aroundTheClockDartInTurn: 0,
            aroundTheClockStartedAt: undefined,
            aroundTheClockWinnerPlayerId: undefined,

            // ----- actions -----

            addPlayer: (name, nickname, flag) => {
                const newPlayer: Player = {
                    id: uuid(),
                    name,
                    nickname,
                    flag,
                    isHidden: false,
                    createdAt: new Date().toISOString(),
                };

                set(state => ({
                    players: [...state.players, newPlayer],
                }));

                return newPlayer;
            },

            // ---------- X01 MATCH FLOW ----------

            startMatch: ({ playerIds, startScore, bestOfLegs }) => {
                const { matches } = get();

                const matchId = uuid();
                const legId = uuid();

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

                const visitWithLegId = { ...visit, legId: currentLegId };

                const newLegState: X01LegState = {
                    ...updatedLegState,
                    visits: [...updatedLegState.visits.slice(0, -1), visitWithLegId],
                };

                set({ currentLegState: newLegState });
            },

            finishLegIfNeeded: () => {
                const { currentLegState, currentMatch, currentLegId, matches } = get();
                if (!currentLegState || !currentMatch || !currentLegId) {
                    return { matchFinished: false };
                }
                if (!currentLegState.winnerPlayerId) {
                    return { matchFinished: false };
                }

                const completedLeg: Leg = {
                    id: currentLegId,
                    matchId: currentMatch.id,
                    sequence: currentMatch.legs.length + 1,
                    startingPlayerId: currentLegState.playerOrder[0],
                    winnerPlayerId: currentLegState.winnerPlayerId,
                    visits: currentLegState.visits,
                };

                const updatedLegs = [...currentMatch.legs, completedLeg];

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

                const otherMatches = matches.filter(m => m.id !== currentMatch.id);

                const bestOf = updatedMatch.bestOfLegs ?? 1;
                const legsToWin = Math.floor(bestOf / 2) + 1;

                let matchFinished = false;
                for (const pid of updatedMatch.playerIds) {
                    if ((legWins[pid] ?? 0) >= legsToWin) {
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

                // Start next leg (alternate starter by rotating order)
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

            // ---------- AROUND THE CLOCK (COMPETITIVE MULTI-PLAYER) ----------

            startAroundTheClock: (playerIds: string[], maxTarget: number = 20) => {
                const states: Record<string, AroundTheClockState> = {};
                for (const pid of playerIds) {
                    states[pid] = createInitialAroundTheClockState(maxTarget);
                }

                set({
                    aroundTheClockStatesByPlayer: states,
                    aroundTheClockPlayerIds: playerIds,
                    aroundTheClockCurrentPlayerIndex: 0,
                    aroundTheClockDartInTurn: 0,
                    aroundTheClockStartedAt: new Date().toISOString(),
                    aroundTheClockWinnerPlayerId: undefined,
                });
            },

            registerAroundTheClockDart: (hit: boolean) => {
                const {
                    aroundTheClockStatesByPlayer,
                    aroundTheClockPlayerIds,
                    aroundTheClockCurrentPlayerIndex,
                    aroundTheClockDartInTurn,
                    aroundTheClockWinnerPlayerId,
                    aroundTheClockSessions,
                } = get();

                // already finished
                if (aroundTheClockWinnerPlayerId) return;
                if (aroundTheClockPlayerIds.length === 0) return;

                const currentPlayerId = aroundTheClockPlayerIds[aroundTheClockCurrentPlayerIndex];
                const currentState = aroundTheClockStatesByPlayer[currentPlayerId];
                if (!currentState) return;

                const updatedPlayerState = applyAroundTheClockDart(currentState, hit);

                const nextStates = {
                    ...aroundTheClockStatesByPlayer,
                    [currentPlayerId]: updatedPlayerState,
                };

                // If THIS player finishes, they win (standard competitive mode)
                if (updatedPlayerState.isFinished) {
                    // total darts across all players
                    const totalDarts = Object.values(nextStates).reduce(
                        (sum, s) => sum + (s?.dartsThrown ?? 0),
                        0
                    );
                    const bestStreakOverall = Math.max(
                        ...Object.values(nextStates).map(s => s?.bestStreak ?? 0),
                        0
                    );

                    const finishedAt = new Date().toISOString();
                    const createdAt = get().aroundTheClockStartedAt ?? finishedAt;

                    const session: AroundTheClockSession = {
                        id: uuid(),
                        playerId: currentPlayerId, // winner
                        createdAt,
                        finishedAt,
                        maxTarget: updatedPlayerState.maxTarget,
                        dartsThrown: totalDarts,
                        bestStreak: bestStreakOverall,
                    };

                    set({
                        aroundTheClockStatesByPlayer: nextStates,
                        aroundTheClockWinnerPlayerId: currentPlayerId,
                        aroundTheClockSessions: [...aroundTheClockSessions, session],
                    });

                    return;
                }

                // Otherwise: advance dart-in-turn, rotate player after DARTS_PER_TURN darts
                const nextDartInTurn = aroundTheClockDartInTurn + 1;

                if (nextDartInTurn >= DARTS_PER_TURN) {
                    const nextIndex =
                        (aroundTheClockCurrentPlayerIndex + 1) % aroundTheClockPlayerIds.length;

                    set({
                        aroundTheClockStatesByPlayer: nextStates,
                        aroundTheClockCurrentPlayerIndex: nextIndex,
                        aroundTheClockDartInTurn: 0,
                    });
                } else {
                    set({
                        aroundTheClockStatesByPlayer: nextStates,
                        aroundTheClockDartInTurn: nextDartInTurn,
                    });
                }
            },

            resetAroundTheClock: () => {
                set({
                    aroundTheClockStatesByPlayer: {},
                    aroundTheClockPlayerIds: [],
                    aroundTheClockCurrentPlayerIndex: 0,
                    aroundTheClockDartInTurn: 0,
                    aroundTheClockStartedAt: undefined,
                    aroundTheClockWinnerPlayerId: undefined,
                });
            },

            updatePlayer: (playerId, updates) => {
                set(state => ({
                    players: state.players.map(p =>
                        p.id === playerId ? { ...p, ...updates } : p
                    ),
                }));
            },

            togglePlayerHidden: (playerId) => {
                set(state => ({
                    players: state.players.map(p =>
                        p.id === playerId ? { ...p, isHidden: !p.isHidden } : p
                    ),
                }));
            },
        }),

        {
            name: 'darts-tracker-store-v1',
            version: 1,
            storage: createJSONStorage(() => AsyncStorage),

            // Persist ONLY long-lived data (avoid persisting in-progress match/practice state)
            partialize: (state) => ({
                players: state.players,
                matches: state.matches,
                aroundTheClockSessions: state.aroundTheClockSessions,
            }),
        }
    )
);
