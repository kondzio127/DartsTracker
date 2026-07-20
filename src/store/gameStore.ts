// src/store/gameStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';

import { Player, Match, Leg, AroundTheClockSession, DartMultiplier } from '../types/domain';
import {
    X01LegState,
    createInitialLegState,
    applyDart,
    createDartThrow,
    undoLastDart,
    commitTurn,
    endTurn as engineEndTurn,
} from '../engine/x01';
import {
    AroundTheClockState,
    createInitialAroundTheClockState,
    applyAroundTheClockDart,
} from '../engine/aroundTheClock';

const uuid = () => Math.random().toString(36).slice(2);
const DARTS_PER_TURN = 3;

function inferRemainingBefore(v: any): number {
    if (typeof v?.remainingBefore === 'number') return v.remainingBefore;
    const total = typeof v?.totalScore === 'number' ? v.totalScore : 0;
    const after = typeof v?.remainingAfter === 'number' ? v.remainingAfter : 0;
    return v?.isBust ? after : after + total;
}

function inferDartFromScore(score: number) {
    if (score === 50) return { segment: 25, multiplier: 2 as const, score: 50 };
    if (score === 25) return { segment: 25, multiplier: 1 as const, score: 25 };
    if (score === 0) return { segment: 0, multiplier: 1 as const, score: 0 };

    if (score % 3 === 0) {
        const seg = score / 3;
        if (seg >= 1 && seg <= 20) return { segment: seg, multiplier: 3 as const, score };
    }
    if (score % 2 === 0) {
        const seg = score / 2;
        if (seg >= 1 && seg <= 20) return { segment: seg, multiplier: 2 as const, score };
    }
    if (score >= 1 && score <= 20) return { segment: score, multiplier: 1 as const, score };

    return { segment: 0, multiplier: 1 as const, score: 0 };
}

interface GameState {
    players: Player[];
    matches: Match[];

    currentMatch?: Match;
    currentLegState?: X01LegState;
    currentLegId?: string;
    currentLegWins: Record<string, number>;

    aroundTheClockStatesByPlayer: Record<string, AroundTheClockState>;
    aroundTheClockSessions: AroundTheClockSession[];
    aroundTheClockPlayerIds: string[];
    aroundTheClockCurrentPlayerIndex: number;
    aroundTheClockDartInTurn: number;
    aroundTheClockStartedAt?: string;
    aroundTheClockWinnerPlayerId?: string;

    addPlayer: (name: string, nickname?: string, flag?: string) => Player;
    updatePlayer: (playerId: string, updates: Partial<Omit<Player, 'id' | 'createdAt'>>) => void;
    togglePlayerHidden: (playerId: string) => void;

    startMatch: (config: { playerIds: string[]; startScore: number; bestOfLegs?: number }) => void;
    abandonMatch: () => void;
    deleteMatch: (matchId: string) => void;

    addDart: (segment: number, multiplier: DartMultiplier) => void;
    undoDart: () => void;
    endTurn: () => void;

    finishLegIfNeeded: () => { matchFinished: boolean; matchId?: string };

    startAroundTheClock: (playerIds: string[], maxTarget?: number) => void;
    registerAroundTheClockDart: (hit: boolean) => void;
    resetAroundTheClock: () => void;
}

export const useGameStore = create<GameState>()(
    persist(
        (set, get) => ({
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

            addPlayer: (name, nickname, flag) => {
                const newPlayer: Player = {
                    id: uuid(),
                    name,
                    nickname,
                    flag,
                    isHidden: false,
                    createdAt: new Date().toISOString(),
                };
                set(state => ({ players: [...state.players, newPlayer] }));
                return newPlayer;
            },

            updatePlayer: (playerId, updates) => {
                set(state => ({
                    players: state.players.map(p => (p.id === playerId ? { ...p, ...updates } : p)),
                }));
            },

            togglePlayerHidden: (playerId) => {
                set(state => ({
                    players: state.players.map(p => (p.id === playerId ? { ...p, isHidden: !p.isHidden } : p)),
                }));
            },

            startMatch: ({ playerIds, startScore, bestOfLegs }) => {
                const { matches, currentMatch } = get();
                const now = new Date().toISOString();
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
                    createdAt: now,
                    status: 'IN_PROGRESS',
                    playerIds,
                    legs: [],
                    legWinsByPlayer: initialLegWins,
                };

                // Starting another X01 match preserves the previous one as abandoned.
                let nextMatches = matches.map(match =>
                    currentMatch && match.id === currentMatch.id && match.status === 'IN_PROGRESS'
                        ? { ...currentMatch, status: 'ABANDONED' as const, abandonedAt: now }
                        : match
                );

                if (currentMatch && !nextMatches.some(match => match.id === currentMatch.id)) {
                    nextMatches = [
                        ...nextMatches,
                        { ...currentMatch, status: 'ABANDONED', abandonedAt: now },
                    ];
                }

                set({
                    matches: [...nextMatches, newMatch],
                    currentMatch: newMatch,
                    currentLegState: createInitialLegState(playerIds, startScore),
                    currentLegId: legId,
                    currentLegWins: initialLegWins,
                });
            },

            abandonMatch: () => {
                const { matches, currentMatch } = get();
                const abandonedAt = new Date().toISOString();

                let nextMatches = matches;
                if (currentMatch) {
                    const abandonedMatch: Match = {
                        ...currentMatch,
                        status: 'ABANDONED',
                        abandonedAt,
                    };

                    const exists = matches.some(match => match.id === currentMatch.id);
                    nextMatches = exists
                        ? matches.map(match => (match.id === currentMatch.id ? abandonedMatch : match))
                        : [...matches, abandonedMatch];
                }

                set({
                    matches: nextMatches,
                    currentMatch: undefined,
                    currentLegState: undefined,
                    currentLegId: undefined,
                    currentLegWins: {},
                });
            },

            deleteMatch: matchId => {
                const { currentMatch } = get();
                const deletingActiveMatch = currentMatch?.id === matchId;

                set(state => ({
                    matches: state.matches.filter(match => match.id !== matchId),
                    ...(deletingActiveMatch
                        ? {
                            currentMatch: undefined,
                            currentLegState: undefined,
                            currentLegId: undefined,
                            currentLegWins: {},
                        }
                        : {}),
                }));
            },

            addDart: (segment, multiplier) => {
                const { currentLegState, currentMatch, currentLegId } = get();
                if (!currentLegState || !currentMatch || !currentLegId) return;

                // block impossible triple bull
                if (segment === 25 && multiplier === 3) return;

                // ignore if turn is already locked/full
                if (currentLegState.turnDarts.length >= 3) return;
                if (currentLegState.turnStatus !== 'IN_PROGRESS') return;

                // IMPORTANT:
                // applyDart returns a plain X01LegState in your current engine
                const updated = applyDart(
                    currentLegState,
                    createDartThrow(segment, multiplier)
                );

                // CASE 1: checkout -> commit immediately
                if (updated.turnStatus === 'CHECKOUT') {
                    const { legState: committedState, committedVisit } = commitTurn(updated);

                    let fixedState = committedState;
                    if (committedVisit) {
                        const fixedVisit = { ...committedVisit, legId: currentLegId };
                        fixedState = {
                            ...committedState,
                            visits: [...committedState.visits.slice(0, -1), fixedVisit],
                        };
                    }

                    set({ currentLegState: fixedState });
                    return;
                }

                // CASE 2: bust -> commit immediately
                if (updated.turnStatus === 'BUST') {
                    const { legState: committedState, committedVisit } = commitTurn(updated);

                    let fixedState = committedState;
                    if (committedVisit) {
                        const fixedVisit = { ...committedVisit, legId: currentLegId };
                        fixedState = {
                            ...committedState,
                            visits: [...committedState.visits.slice(0, -1), fixedVisit],
                        };
                    }

                    set({ currentLegState: fixedState });
                    return;
                }

                // CASE 3: third dart entered -> commit immediately
                if (updated.turnDarts.length === 3) {
                    const { legState: committedState, committedVisit } = commitTurn(updated);

                    let fixedState = committedState;
                    if (committedVisit) {
                        const fixedVisit = { ...committedVisit, legId: currentLegId };
                        fixedState = {
                            ...committedState,
                            visits: [...committedState.visits.slice(0, -1), fixedVisit],
                        };
                    }

                    set({ currentLegState: fixedState });
                    return;
                }

                // Otherwise keep partial turn editable
                set({ currentLegState: updated });
            },

            undoDart: () => {
                const { currentLegState } = get();
                if (!currentLegState) return;

                if (currentLegState.turnDarts.length > 0) {
                    set({ currentLegState: undoLastDart(currentLegState) });
                    return;
                }

                if (!currentLegState.visits || currentLegState.visits.length === 0) return;

                const lastVisit: any = currentLegState.visits[currentLegState.visits.length - 1];
                const remainingBefore = inferRemainingBefore(lastVisit);

                const restoredTurnDarts =
                    Array.isArray(lastVisit?.segments) && Array.isArray(lastVisit?.multipliers)
                        ? (lastVisit.scores ?? []).map((s: number, i: number) => ({
                            segment: lastVisit.segments[i] ?? 0,
                            multiplier: (lastVisit.multipliers[i] ?? 1) as 1 | 2 | 3,
                            score: s ?? 0,
                        }))
                        : (lastVisit.scores ?? []).map((s: number) => inferDartFromScore(s ?? 0));

                const restoredRemaining = lastVisit.isBust ? remainingBefore : lastVisit.remainingAfter;

                const newLegState: X01LegState = {
                    ...currentLegState,
                    visits: currentLegState.visits.slice(0, -1),
                    currentPlayerId: lastVisit.playerId,
                    winnerPlayerId: undefined,
                    turnStartRemaining: remainingBefore,
                    turnDarts: restoredTurnDarts,
                    scoresByPlayer: {
                        ...currentLegState.scoresByPlayer,
                        [lastVisit.playerId]: restoredRemaining,
                    },
                };

                set({ currentLegState: newLegState });
            },

            endTurn: () => {
                const { currentLegState, currentLegId } = get();
                if (!currentLegState || !currentLegId) return;

                const { legState: updatedLegState, committedVisit } = engineEndTurn(currentLegState);

                let newLegState: X01LegState = updatedLegState;
                if (committedVisit) {
                    const fixedVisit = { ...committedVisit, legId: currentLegId };
                    newLegState = {
                        ...updatedLegState,
                        visits: [...updatedLegState.visits.slice(0, -1), fixedVisit],
                    };
                }

                set({ currentLegState: newLegState });
            },

            finishLegIfNeeded: () => {
                const { currentLegState, currentMatch, currentLegId, matches } = get();
                if (!currentLegState || !currentMatch || !currentLegId) return { matchFinished: false };
                if (!currentLegState.winnerPlayerId) return { matchFinished: false };

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
                    if (leg.winnerPlayerId) legWins[leg.winnerPlayerId] = (legWins[leg.winnerPlayerId] ?? 0) + 1;
                }

                const updatedMatch: Match = {
                    ...currentMatch,
                    status: 'IN_PROGRESS',
                    abandonedAt: undefined,
                    legs: updatedLegs,
                    legWinsByPlayer: legWins,
                };
                const otherMatches = matches.filter(m => m.id !== currentMatch.id);

                const bestOf = updatedMatch.bestOfLegs ?? 1;
                const legsToWin = Math.floor(bestOf / 2) + 1;
                const matchFinished = updatedMatch.playerIds.some(pid => (legWins[pid] ?? 0) >= legsToWin);

                if (matchFinished) {
                    const finishedMatch: Match = {
                        ...updatedMatch,
                        status: 'COMPLETED',
                        finishedAt: new Date().toISOString(),
                        abandonedAt: undefined,
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

                const legsPlayed = updatedMatch.legs.length;
                const baseOrder = updatedMatch.playerIds;
                const startIndex = legsPlayed % baseOrder.length;
                const rotatedOrder = [...baseOrder.slice(startIndex), ...baseOrder.slice(0, startIndex)];

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

            startAroundTheClock: (playerIds, maxTarget = 20) => {
                const states: Record<string, AroundTheClockState> = {};
                for (const pid of playerIds) states[pid] = createInitialAroundTheClockState(maxTarget);

                set({
                    aroundTheClockStatesByPlayer: states,
                    aroundTheClockPlayerIds: playerIds,
                    aroundTheClockCurrentPlayerIndex: 0,
                    aroundTheClockDartInTurn: 0,
                    aroundTheClockStartedAt: new Date().toISOString(),
                    aroundTheClockWinnerPlayerId: undefined,
                });
            },

            registerAroundTheClockDart: hit => {
                const {
                    aroundTheClockStatesByPlayer,
                    aroundTheClockPlayerIds,
                    aroundTheClockCurrentPlayerIndex,
                    aroundTheClockDartInTurn,
                    aroundTheClockWinnerPlayerId,
                    aroundTheClockSessions,
                } = get();

                if (aroundTheClockWinnerPlayerId) return;
                if (aroundTheClockPlayerIds.length === 0) return;

                const currentPlayerId = aroundTheClockPlayerIds[aroundTheClockCurrentPlayerIndex];
                const currentState = aroundTheClockStatesByPlayer[currentPlayerId];
                if (!currentState) return;

                const updatedPlayerState = applyAroundTheClockDart(currentState, hit);
                const nextStates = { ...aroundTheClockStatesByPlayer, [currentPlayerId]: updatedPlayerState };

                if (updatedPlayerState.isFinished) {
                    const totalDarts = Object.values(nextStates).reduce((sum, s) => sum + (s?.dartsThrown ?? 0), 0);
                    const bestStreakOverall = Math.max(...Object.values(nextStates).map(s => s?.bestStreak ?? 0), 0);
                    const finishedAt = new Date().toISOString();
                    const createdAt = get().aroundTheClockStartedAt ?? finishedAt;

                    const session: AroundTheClockSession = {
                        id: uuid(),
                        playerId: currentPlayerId,
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

                const nextDartInTurn = aroundTheClockDartInTurn + 1;
                if (nextDartInTurn >= DARTS_PER_TURN) {
                    const nextIndex = (aroundTheClockCurrentPlayerIndex + 1) % aroundTheClockPlayerIds.length;
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
        }),
        {
            name: 'darts-tracker-store-v1',
            version: 3,
            storage: createJSONStorage(() => AsyncStorage),
            migrate: (persistedState, version) => {
                let state = persistedState as Partial<GameState>;

                if (version < 2) {
                    state = {
                        ...state,
                        currentMatch: state.currentMatch ?? undefined,
                        currentLegState: state.currentLegState ?? undefined,
                        currentLegId: state.currentLegId ?? undefined,
                        currentLegWins: state.currentLegWins ?? {},
                        aroundTheClockStatesByPlayer: state.aroundTheClockStatesByPlayer ?? {},
                        aroundTheClockPlayerIds: state.aroundTheClockPlayerIds ?? [],
                        aroundTheClockCurrentPlayerIndex: state.aroundTheClockCurrentPlayerIndex ?? 0,
                        aroundTheClockDartInTurn: state.aroundTheClockDartInTurn ?? 0,
                        aroundTheClockStartedAt: state.aroundTheClockStartedAt ?? undefined,
                        aroundTheClockWinnerPlayerId: state.aroundTheClockWinnerPlayerId ?? undefined,
                    };
                }

                if (version < 3) {
                    const canResumeCurrentMatch = Boolean(
                        state.currentMatch && state.currentLegState && state.currentLegId
                    );
                    const activeMatchId = canResumeCurrentMatch ? state.currentMatch?.id : undefined;

                    let migratedMatches = (state.matches ?? []).map(match => ({
                        ...match,
                        status: match.finishedAt
                            ? 'COMPLETED' as const
                            : match.id === activeMatchId
                                ? 'IN_PROGRESS' as const
                                : 'ABANDONED' as const,
                    }));

                    let migratedCurrentMatch = canResumeCurrentMatch && state.currentMatch
                        ? { ...state.currentMatch, status: 'IN_PROGRESS' as const }
                        : undefined;

                    if (
                        migratedCurrentMatch &&
                        !migratedMatches.some(match => match.id === migratedCurrentMatch?.id)
                    ) {
                        migratedMatches = [...migratedMatches, migratedCurrentMatch];
                    }

                    state = {
                        ...state,
                        matches: migratedMatches,
                        currentMatch: migratedCurrentMatch,
                        currentLegState: canResumeCurrentMatch ? state.currentLegState : undefined,
                        currentLegId: canResumeCurrentMatch ? state.currentLegId : undefined,
                        currentLegWins: canResumeCurrentMatch ? (state.currentLegWins ?? {}) : {},
                    };
                }

                return state as GameState;
            },
            partialize: state => ({
                players: state.players,
                matches: state.matches,
                currentMatch: state.currentMatch,
                currentLegState: state.currentLegState,
                currentLegId: state.currentLegId,
                currentLegWins: state.currentLegWins,
                aroundTheClockStatesByPlayer: state.aroundTheClockStatesByPlayer,
                aroundTheClockSessions: state.aroundTheClockSessions,
                aroundTheClockPlayerIds: state.aroundTheClockPlayerIds,
                aroundTheClockCurrentPlayerIndex: state.aroundTheClockCurrentPlayerIndex,
                aroundTheClockDartInTurn: state.aroundTheClockDartInTurn,
                aroundTheClockStartedAt: state.aroundTheClockStartedAt,
                aroundTheClockWinnerPlayerId: state.aroundTheClockWinnerPlayerId,
            }),
        }
    )
);
