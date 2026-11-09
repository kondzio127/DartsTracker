import type { Match } from '../types/domain';
import type { DetailedDartInput, ValidationError } from '../types/scoring';
import { validateDetailedDartInput } from '../engine/scoringValidation';
import { applyDart, commitTurn, createDartThrow, createInitialLegState, X01LegState } from '../engine/x01';

export interface X01ApplicationState {
    matches: Match[];
    currentMatch?: Match;
    currentLegState?: X01LegState;
    currentLegId?: string;
    currentLegWins: Record<string, number>;
}

/** Values supplied by the caller keep operations deterministic and storage independent. */
export interface X01OperationMetadata {
    visitId: string;
    nextLegId: string;
    now: string;
}

export interface X01OperationResult {
    state: X01ApplicationState;
    outcome: 'unchanged' | 'stale-leg' | 'invalid-input' | 'dart-recorded' | 'visit-completed' | 'leg-completed' | 'match-completed';
    matchFinished: boolean;
    matchId?: string;
    error?: ValidationError;
}

const unchanged = (state: X01ApplicationState): X01OperationResult =>
    ({ state, outcome: 'unchanged', matchFinished: false });

/** Also used when restoring a legacy save with a committed winning visit. */
export function completeX01LegIfNeeded(state: X01ApplicationState, metadata: X01OperationMetadata): X01OperationResult {
    const { currentMatch: match, currentLegState: leg, currentLegId } = state;
    if (!match || !leg?.winnerPlayerId || !currentLegId || match.status !== 'IN_PROGRESS') return unchanged(state);

    // A previously archived leg must never be counted twice, including on recovery.
    const legs = match.legs.some(item => item.id === currentLegId) ? match.legs : [...match.legs, {
        id: currentLegId, matchId: match.id, sequence: match.legs.length + 1,
        startingPlayerId: leg.playerOrder[0], winnerPlayerId: leg.winnerPlayerId, visits: leg.visits,
    }];
    const wins: Record<string, number> = Object.fromEntries(match.playerIds.map(id => [id, 0]));
    for (const item of legs) if (item.winnerPlayerId) wins[item.winnerPlayerId] = (wins[item.winnerPlayerId] ?? 0) + 1;
    const finished = match.playerIds.some(id => wins[id] >= Math.floor((match.bestOfLegs ?? 1) / 2) + 1);
    const updatedMatch: Match = { ...match, legs, legWinsByPlayer: wins, abandonedAt: undefined,
        status: finished ? 'COMPLETED' : 'IN_PROGRESS', ...(finished ? { finishedAt: metadata.now } : {}) };
    const index = legs.length % match.playerIds.length;
    const order = [...match.playerIds.slice(index), ...match.playerIds.slice(0, index)];
    return {
        state: {
            matches: [...state.matches.filter(item => item.id !== match.id), updatedMatch],
            currentMatch: finished ? undefined : updatedMatch,
            currentLegState: finished ? undefined : createInitialLegState(order, match.startScore),
            currentLegId: finished ? undefined : metadata.nextLegId,
            currentLegWins: finished ? {} : wins,
        },
        outcome: finished ? 'match-completed' : 'leg-completed', matchFinished: finished, matchId: match.id,
    };
}

function commitVisit(state: X01ApplicationState, metadata: X01OperationMetadata): X01OperationResult {
    const committed = commitTurn(state.currentLegState!, { id: metadata.visitId, createdAt: metadata.now });
    if (!committed.committedVisit) return unchanged(state);
    const leg = { ...committed.legState, visits: [...committed.legState.visits.slice(0, -1),
        { ...committed.committedVisit, legId: state.currentLegId! }] };
    const next = { ...state, currentLegState: leg };
    return leg.winnerPlayerId ? completeX01LegIfNeeded(next, metadata)
        : { state: next, outcome: 'visit-completed', matchFinished: false };
}

function guard(state: X01ApplicationState, expectedLegId: string): X01OperationResult | undefined {
    if (state.currentLegId !== expectedLegId) return { ...unchanged(state), outcome: 'stale-leg' };
    if (!state.currentLegState || !state.currentMatch || state.currentMatch.status !== 'IN_PROGRESS'
        || state.currentLegState.winnerPlayerId) return unchanged(state);
}

export function recordX01Dart(state: X01ApplicationState, expectedLegId: string,
    input: DetailedDartInput, metadata: X01OperationMetadata): X01OperationResult {
    const blocked = guard(state, expectedLegId);
    if (blocked) return blocked;
    const validated = validateDetailedDartInput(input);
    if (!validated.valid) return { ...unchanged(state), outcome: 'invalid-input', error: validated.error };
    const landing = validated.value.landing;
    const dart = landing.kind === 'miss' ? createDartThrow(0, 1)
        : createDartThrow(landing.kind === 'bull' ? 25 : landing.segment, landing.multiplier);
    const leg = applyDart(state.currentLegState!, dart);
    if (leg === state.currentLegState) return unchanged(state);
    const next = { ...state, currentLegState: leg };
    return leg.turnStatus !== 'IN_PROGRESS' || leg.turnDarts.length === 3 ? commitVisit(next, metadata)
        : { state: next, outcome: 'dart-recorded', matchFinished: false };
}

export function endX01Turn(state: X01ApplicationState, expectedLegId: string,
    metadata: X01OperationMetadata): X01OperationResult {
    return guard(state, expectedLegId) ?? commitVisit(state, metadata);
}
