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

// ---------- Undo helpers (works for both new + old saved matches) ----------
function inferRemainingBefore(v: any): number {
    if (typeof v?.remainingBefore === 'number') return v.remainingBefore;
    const total = typeof v?.totalScore === 'number' ? v.totalScore : 0;
    const after = typeof v?.remainingAfter === 'number' ? v.remainingAfter : 0;
    return v?.isBust ? after : after + total;
}

interface GameState {
    players: Player[];
    matches: Match[];

    updatePlayer: (playerId: string, updates: Partial<Omit<Player, 'id' | 'createdAt'>>) => void;
    togglePlayerHidden: (playerId: string) => void;

    currentMatch?: Match;
    currentLegState?: X01LegState;
    currentLegId?: string;

    currentLegWins: Record<string, number>;

    addPlayer: (name: string, nickname?: string, flag?: string) => Player;

    startMatch: (config: { playerIds: string[]; startScore: number; bestOfLegs?: number }) => void;
    abandonMatch: () => void;

    addDart: (segment: number, multiplier: DartMultiplier) => void;
    undoDart: () => void;
    endTurn: () => void;

    finishLegIfNeeded: () => { matchFinished: boolean; matchId?: string };

    aroundTheClockStatesByPlayer: Record<string, AroundTheClockState>;
    aroundTheClockSessions: AroundTheClockSession[];
    aroundTheClockPlayerIds: string[];
    aroundTheClockCurrentPlayerIndex: number;
    aroundTheClockDartInTurn: number;
    aroundTheClockStartedAt?: string;
    aroundTheClockWinnerPlayerId?: string;

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

            startMatch: ({ playerIds, startScore, bestOfLegs }) => {
                const { matches } = get();

                const matchId = uuid();
                const legId = uuid();
                const normalizedBestOfLegs = bestOfLegs ?? 1;

                const initialLegWins: Record<string, number> = {};
                playerIds.forEach(pid => (initialLegWins[pid] = 0));

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

            abandonMatch: () => {
                set({
                    currentMatch: undefined,
                    currentLegState: undefined,
                    currentLegId: undefined,
                    currentLegWins: {},
                });
            },

            // Adds a dart to the current turn ONLY (does not advance player)
            addDart: (segment, multiplier) => {
                const { currentLegState, currentMatch, currentLegId } = get();
                if (!currentLegState || !currentMatch || !currentLegId) return;

                // Prevent triple bull at the store level too (defensive)
                if (segment === 25 && multiplier === 3) return;

                // Hard cap: 3 darts max until Next pressed
                if (currentLegState.turnDarts.length >= 3) return;

                const dart = createDartThrow(segment, multiplier);
                const updated = applyDart(currentLegState, dart);

                // If checkout happens, auto-commit immediately so the leg/match can finish without pressing Next.
                if (updated.turnStatus === 'CHECKOUT') {
                    const { legState: committedState, committedVisit } = commitTurn(updated);

                    // Fix legId in the committed visit (engine uses a temp id)
                    let fixedState = committedState;
                    if (committedVisit) {
                        const fixed = { ...committedVisit, legId: currentLegId };
                        fixedState = {
                            ...committedState,
                            visits: [...committedState.visits.slice(0, -1), fixed],
                        };
                    }

                    set({ currentLegState: fixedState });
                    return;
                }

                set({ currentLegState: updated });
            },

            // Smart undo:
            // - mid-turn -> removes last dart
            // - next player's turn (no darts yet) -> pulls back previous committed visit into editable darts
            undoDart: () => {
                const { currentLegState } = get();
                if (!currentLegState) return;

                // Undo within current turn
                if (currentLegState.turnDarts.length > 0) {
                    set({ currentLegState: undoLastDart(currentLegState) });
                    return;
                }

                // Pull back last committed turn
                if (!currentLegState.visits || currentLegState.visits.length === 0) return;

                const lastVisit: any = currentLegState.visits[currentLegState.visits.length - 1];
                const remainingBefore = inferRemainingBefore(lastVisit);

                // Build dart throws from visit meta if present; else fallback to scores
                const dartsFromVisit = Array.isArray(lastVisit?.segments) && Array.isArray(lastVisit?.multipliers)
                    ? (lastVisit.scores ?? []).map((s: number, i: number) =>
                        createDartThrow(lastVisit.segments[i] ?? 0, (lastVisit.multipliers[i] ?? 1) as 1 | 2 | 3)
                    )
                    : (lastVisit.scores ?? []).map((s: number) => {
                        // fallback (best-effort)
                        if (s === 50) return createDartThrow(25, 2);
                        if (s === 25) return createDartThrow(25, 1);
                        if (s === 0) return createDartThrow(0, 1);
                        if (s % 3 === 0 && s / 3 >= 1 && s / 3 <= 20) return createDartThrow(s / 3, 3);
                        if (s % 2 === 0 && s / 2 >= 1 && s / 2 <= 20) return createDartThrow(s / 2, 2);
                        if (s >= 1 && s <= 20) return createDartThrow(s, 1);
                        return createDartThrow(0, 1);
                    });

                // Reset state to start of that turn, then re-apply darts to compute live remaining + status
                let tmp: X01LegState = {
                    ...currentLegState,
                    visits: currentLegState.visits.slice(0, -1),
                    currentPlayerId: lastVisit.playerId,
                    winnerPlayerId: undefined,
                    turnStartRemaining: remainingBefore,
                    turnDarts: [],
                    turnStatus: 'IN_PROGRESS',
                    scoresByPlayer: { ...currentLegState.scoresByPlayer, [lastVisit.playerId]: remainingBefore },
                };

                for (const d of dartsFromVisit) {
                    tmp = applyDart(tmp, d);
                }

                set({ currentLegState: tmp });
            },

            // Next button: pads missing darts (as misses) and commits the turn + advances player
            endTurn: () => {
                const { currentLegState, currentLegId } = get();
                if (!currentLegState || !currentLegId) return;

                const { legState: updatedLegState, committedVisit } = engineEndTurn(currentLegState);

                // fix legId in the committed visit
                let newLegState: X01LegState = updatedLegState;
                if (committedVisit) {
                    const fixed = { ...committedVisit, legId: currentLegId };
                    newLegState = {
                        ...updatedLegState,
                        visits: [...updatedLegState.visits.slice(0, -1), fixed],
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
                currentMatch.playerIds.forEach(pid => (legWins[pid] = 0));
                for (const leg of updatedLegs) {
                    if (leg.winnerPlayerId) legWins[leg.winnerPlayerId] = (legWins[leg.winnerPlayerId] ?? 0) + 1;
                }

                const updatedMatch: Match = { ...currentMatch, legs: updatedLegs, legWinsByPlayer: legWins };
                const otherMatches = matches.filter(m => m.id !== currentMatch.id);

                const bestOf = updatedMatch.bestOfLegs ?? 1;
                const legsToWin = Math.floor(bestOf / 2) + 1;

                const matchFinished = updatedMatch.playerIds.some(pid => (legWins[pid] ?? 0) >= legsToWin);

                if (matchFinished) {
                    const finishedMatch: Match = { ...updatedMatch, finishedAt: new Date().toISOString() };
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

            // ---------- AROUND THE CLOCK ----------
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

            registerAroundTheClockDart: (hit) => {
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
                    set({ aroundTheClockStatesByPlayer: nextStates, aroundTheClockCurrentPlayerIndex: nextIndex, aroundTheClockDartInTurn: 0 });
                } else {
                    set({ aroundTheClockStatesByPlayer: nextStates, aroundTheClockDartInTurn: nextDartInTurn });
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
                set(state => ({ players: state.players.map(p => (p.id === playerId ? { ...p, ...updates } : p)) }));
            },

            togglePlayerHidden: (playerId) => {
                set(state => ({ players: state.players.map(p => (p.id === playerId ? { ...p, isHidden: !p.isHidden } : p)) }));
            },
        }),
        {
            name: 'darts-tracker-store-v1',
            version: 1,
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                players: state.players,
                matches: state.matches,
                aroundTheClockSessions: state.aroundTheClockSessions,
            }),
        }
    )
);
