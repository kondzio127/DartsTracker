// src/store/gameStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
    Player,
    Match,
    AroundTheClockSession,
    AroundTheClockPlayerResult,
    DartMultiplier,
} from '../types/domain';
import {
    X01LegState,
    createInitialLegState,
    undoLastDart,
} from '../engine/x01';
import {
    AroundTheClockState,
    createInitialAroundTheClockState,
    applyAroundTheClockDart,
    cloneAroundTheClockState,
    getCompletedTargetCount,
} from '../engine/aroundTheClock';

import { completeX01LegIfNeeded, endX01Turn, recordX01Dart, X01OperationResult } from '../application/x01Operations';
import type { BoardNumber, DetailedDartInput } from '../types/scoring';

const uuid = () => Math.random().toString(36).slice(2);
const DARTS_PER_TURN = 3;
const operationMetadata = () => ({ visitId: uuid(), nextLegId: uuid(), now: new Date().toISOString() });

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

interface AroundTheClockUndoSnapshot {
    statesByPlayer: Record<string, AroundTheClockState>;
    currentPlayerIndex: number;
    dartInTurn: number;
    winnerPlayerId?: string;
    sessionsLength: number;
}

function cloneAroundTheClockStates(
    states: Record<string, AroundTheClockState>
): Record<string, AroundTheClockState> {
    const cloned: Record<string, AroundTheClockState> = {};

    for (const [playerId, state] of Object.entries(states)) {
        cloned[playerId] = cloneAroundTheClockState(state);
    }

    return cloned;
}

function buildAroundTheClockResults(
    playerIds: string[],
    states: Record<string, AroundTheClockState>
): AroundTheClockPlayerResult[] {
    return playerIds.flatMap(playerId => {
        const state = states[playerId];
        if (!state) return [];

        return [{
            playerId,
            completed: state.isFinished,
            targetReached: getCompletedTargetCount(state),
            dartsThrown: state.dartsThrown,
            bestStreak: state.bestStreak,
            hitsByNumber: { ...state.hitsByNumber },
        }];
    });
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
    aroundTheClockUndoStack: AroundTheClockUndoSnapshot[];

    addPlayer: (name: string, nickname?: string, flag?: string) => Player;
    updatePlayer: (playerId: string, updates: Partial<Omit<Player, 'id' | 'createdAt'>>) => void;
    togglePlayerHidden: (playerId: string) => void;

    startMatch: (config: { playerIds: string[]; startScore: number; bestOfLegs?: number }) => void;
    abandonMatch: () => void;
    deleteMatch: (matchId: string) => void;

    addDart: (segment: number, multiplier: DartMultiplier, expectedLegId?: string) => X01OperationResult;
    undoDart: () => void;
    endTurn: (expectedLegId: string) => X01OperationResult;

    finishLegIfNeeded: () => { matchFinished: boolean; matchId?: string };

    startAroundTheClock: (playerIds: string[], maxTarget?: number) => void;
    registerAroundTheClockDart: (hit: boolean) => void;
    undoAroundTheClockDart: () => void;
    resetAroundTheClock: () => void;
}

export type GameHydrationStatus =
    | { status: 'loading' | 'ready' }
    | { status: 'error'; error: unknown };
let gameHydrationStatus: GameHydrationStatus = { status: 'loading' };
const hydrationStatusListeners = new Set<() => void>();
export const getGameHydrationStatus = (): GameHydrationStatus => gameHydrationStatus;
export function subscribeGameHydrationStatus(listener: () => void): () => void {
    hydrationStatusListeners.add(listener);
    return () => { hydrationStatusListeners.delete(listener); };
}
function publishHydrationStatus(status: GameHydrationStatus) {
    gameHydrationStatus = status;
    hydrationStatusListeners.forEach(listener => listener());
}

export type RecoveryPersistenceStatus =
    | { status: 'idle' | 'pending' | 'saved' }
    | { status: 'failed'; error: unknown };

let recoveryPersistenceStatus: RecoveryPersistenceStatus = { status: 'idle' };
/** hasHydrated stays false until recovery is saved. Retry failures with persist.rehydrate(). */
export const getX01RecoveryPersistenceStatus = (): RecoveryPersistenceStatus => recoveryPersistenceStatus;

// Serialize reads and writes, including recovery, so overlapping hydration cannot
// read the same legacy checkout while its replacement is still being saved.
let storageQueue: Promise<unknown> = Promise.resolve();
let storageBusy = 0;
function serializeStorage<T>(operation: () => Promise<T>): Promise<T> {
    storageBusy++;
    const result = storageQueue.then(operation).finally(() => { storageBusy--; });
    storageQueue = result.catch(() => undefined);
    return result;
}

// Keep the generated replacement after a failed write so retry uses the same IDs.
let recoveryRetry: { original: string; replacement: string } | undefined;
const recoveryStorage = {
    getItem: (key: string): Promise<string | null> => serializeStorage(async () => {
        const original = await AsyncStorage.getItem(key);
        if (!original) return original;
        let replacement: string;
        if (recoveryRetry?.original === original) {
            replacement = recoveryRetry.replacement;
        } else {
            const envelope = JSON.parse(original);
            const persisted = envelope.state as Partial<GameState>;
            const candidate = { ...persisted, matches: persisted.matches ?? [],
                currentLegWins: persisted.currentLegWins ?? {},
                currentMatch: persisted.currentMatch && envelope.version < 3
                    ? { ...persisted.currentMatch, status: 'IN_PROGRESS' as const } : persisted.currentMatch };
            const recovered = completeX01LegIfNeeded(candidate, operationMetadata());
            if (recovered.state === candidate) return original;
            replacement = JSON.stringify({ ...envelope, state: { ...persisted, ...recovered.state } });
            recoveryRetry = { original, replacement };
        }
        recoveryPersistenceStatus = { status: 'pending' };
        try {
            await AsyncStorage.setItem(key, replacement);
            recoveryPersistenceStatus = { status: 'saved' };
            recoveryRetry = undefined;
            return replacement;
        } catch (error) {
            recoveryPersistenceStatus = { status: 'failed', error };
            throw error; // Zustand handles the hydration rejection; hasHydrated remains false.
        }
    }),
    setItem: (key: string, value: string): Promise<void> =>
        storageBusy ? serializeStorage(() => AsyncStorage.setItem(key, value)) : AsyncStorage.setItem(key, value),
    removeItem: (key: string): Promise<void> => storageBusy
        ? serializeStorage(() => AsyncStorage.removeItem(key)) : AsyncStorage.removeItem(key),
};

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
            aroundTheClockUndoStack: [],

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

            addDart: (segment, multiplier, expectedLegId) => {
                const input = { kind: 'dart', source: 'keypad', landing: segment === 0
                    ? { kind: 'miss' }
                    : segment === 25 ? { kind: 'bull', multiplier }
                        : { kind: 'number', segment: segment as BoardNumber, multiplier } } as DetailedDartInput;
                const result = recordX01Dart(get(), expectedLegId ?? get().currentLegId ?? '', input, operationMetadata());
                if (result.state !== get()) set(result.state);
                return result;
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

            endTurn: expectedLegId => {
                const result = endX01Turn(get(), expectedLegId, operationMetadata());
                if (result.state !== get()) set(result.state);
                return result;
            },

            // Compatibility for callers recovering an old committed checkout.
            finishLegIfNeeded: () => {
                const result = completeX01LegIfNeeded(get(), operationMetadata());
                if (result.state !== get()) set(result.state);
                return { matchFinished: result.matchFinished, matchId: result.matchId };
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
                    aroundTheClockUndoStack: [],
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
                    aroundTheClockUndoStack,
                } = get();

                if (aroundTheClockWinnerPlayerId) return;
                if (aroundTheClockPlayerIds.length === 0) return;

                const currentPlayerId = aroundTheClockPlayerIds[aroundTheClockCurrentPlayerIndex];
                const currentState = aroundTheClockStatesByPlayer[currentPlayerId];
                if (!currentState) return;

                const snapshot: AroundTheClockUndoSnapshot = {
                    statesByPlayer: cloneAroundTheClockStates(aroundTheClockStatesByPlayer),
                    currentPlayerIndex: aroundTheClockCurrentPlayerIndex,
                    dartInTurn: aroundTheClockDartInTurn,
                    winnerPlayerId: aroundTheClockWinnerPlayerId,
                    sessionsLength: aroundTheClockSessions.length,
                };
                const nextUndoStack = [...aroundTheClockUndoStack, snapshot].slice(-500);

                const updatedPlayerState = applyAroundTheClockDart(currentState, hit);
                const nextStates = {
                    ...aroundTheClockStatesByPlayer,
                    [currentPlayerId]: updatedPlayerState,
                };

                if (updatedPlayerState.isFinished) {
                    const finishedAt = new Date().toISOString();
                    const createdAt = get().aroundTheClockStartedAt ?? finishedAt;
                    const session: AroundTheClockSession = {
                        id: uuid(),
                        playerIds: [...aroundTheClockPlayerIds],
                        winnerPlayerId: currentPlayerId,
                        createdAt,
                        finishedAt,
                        maxTarget: updatedPlayerState.maxTarget,
                        results: buildAroundTheClockResults(aroundTheClockPlayerIds, nextStates),
                    };

                    set({
                        aroundTheClockStatesByPlayer: nextStates,
                        aroundTheClockWinnerPlayerId: currentPlayerId,
                        aroundTheClockSessions: [...aroundTheClockSessions, session],
                        aroundTheClockUndoStack: nextUndoStack,
                    });
                    return;
                }

                const nextDartInTurn = aroundTheClockDartInTurn + 1;
                if (nextDartInTurn >= DARTS_PER_TURN) {
                    const nextIndex =
                        (aroundTheClockCurrentPlayerIndex + 1) % aroundTheClockPlayerIds.length;
                    set({
                        aroundTheClockStatesByPlayer: nextStates,
                        aroundTheClockCurrentPlayerIndex: nextIndex,
                        aroundTheClockDartInTurn: 0,
                        aroundTheClockUndoStack: nextUndoStack,
                    });
                } else {
                    set({
                        aroundTheClockStatesByPlayer: nextStates,
                        aroundTheClockDartInTurn: nextDartInTurn,
                        aroundTheClockUndoStack: nextUndoStack,
                    });
                }
            },

            undoAroundTheClockDart: () => {
                const {
                    aroundTheClockUndoStack,
                    aroundTheClockSessions,
                } = get();
                const snapshot = aroundTheClockUndoStack[aroundTheClockUndoStack.length - 1];
                if (!snapshot) return;

                set({
                    aroundTheClockStatesByPlayer: cloneAroundTheClockStates(snapshot.statesByPlayer),
                    aroundTheClockCurrentPlayerIndex: snapshot.currentPlayerIndex,
                    aroundTheClockDartInTurn: snapshot.dartInTurn,
                    aroundTheClockWinnerPlayerId: snapshot.winnerPlayerId,
                    aroundTheClockSessions: aroundTheClockSessions.slice(0, snapshot.sessionsLength),
                    aroundTheClockUndoStack: aroundTheClockUndoStack.slice(0, -1),
                });
            },

            resetAroundTheClock: () => {
                set({
                    aroundTheClockStatesByPlayer: {},
                    aroundTheClockPlayerIds: [],
                    aroundTheClockCurrentPlayerIndex: 0,
                    aroundTheClockDartInTurn: 0,
                    aroundTheClockStartedAt: undefined,
                    aroundTheClockWinnerPlayerId: undefined,
                    aroundTheClockUndoStack: [],
                });
            },
        }),
        {
            name: 'darts-tracker-store-v1',
            version: 4,
            storage: createJSONStorage(() => recoveryStorage),
            onRehydrateStorage: () => {
                publishHydrationStatus({ status: 'loading' });
                return (_state, error) => {
                    // Zustand catches hydration failures instead of rejecting rehydrate().
                    // Superseded attempts never reach this callback in 5.0.11.
                    if (_state === undefined || error !== undefined) {
                        publishHydrationStatus({ status: 'error', error: error ?? new Error('Game hydration failed') });
                    }
                };
            },
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


                if (version < 4) {
                    const migratedSessions = (state.aroundTheClockSessions ?? []).map(session => {
                        const legacySession = session as AroundTheClockSession & {
                            playerId?: string;
                            dartsThrown?: number;
                            bestStreak?: number;
                        };

                        if (
                            Array.isArray(legacySession.playerIds) &&
                            Array.isArray(legacySession.results)
                        ) {
                            return legacySession;
                        }

                        const legacyPlayerId = legacySession.playerId;
                        const maxTarget = legacySession.maxTarget ?? 20;

                        return {
                            id: legacySession.id,
                            playerIds: legacyPlayerId ? [legacyPlayerId] : [],
                            winnerPlayerId: legacyPlayerId,
                            createdAt: legacySession.createdAt,
                            finishedAt: legacySession.finishedAt,
                            maxTarget,
                            results: legacyPlayerId
                                ? [{
                                    playerId: legacyPlayerId,
                                    completed: true,
                                    targetReached: maxTarget,
                                    dartsThrown: legacySession.dartsThrown ?? 0,
                                    bestStreak: legacySession.bestStreak ?? 0,
                                    hitsByNumber: {},
                                }]
                                : [],
                        } satisfies AroundTheClockSession;
                    });

                    state = {
                        ...state,
                        aroundTheClockSessions: migratedSessions,
                        aroundTheClockUndoStack: [],
                    };
                }

                state = {
                    ...state,
                    aroundTheClockUndoStack: state.aroundTheClockUndoStack ?? [],
                };

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
                aroundTheClockUndoStack: state.aroundTheClockUndoStack,
            }),
        }
    )
);

// This event runs after hasHydrated becomes true, including automatic startup.
// recoveryStorage is async, so registration precedes startup completion.
useGameStore.persist.onFinishHydration(() => publishHydrationStatus({ status: 'ready' }));

/** Coalesce repeated UI retries; loading is published synchronously by rehydrate(). */
export async function retryGameHydration(): Promise<void> {
    if (gameHydrationStatus.status !== 'error') return;
    await useGameStore.persist.rehydrate();
}
