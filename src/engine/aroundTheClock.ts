// src/engine/aroundTheClock.ts

export interface AroundTheClockState {
    currentTarget: number;
    maxTarget: number;
    dartsThrown: number;
    hitsByNumber: Record<number, number>;
    currentStreak: number;
    bestStreak: number;
    isFinished: boolean;
}

export function createInitialAroundTheClockState(
    maxTarget: number = 20
): AroundTheClockState {
    const normalizedMaxTarget = Math.max(1, Math.floor(maxTarget));
    const hitsByNumber: Record<number, number> = {};

    for (let target = 1; target <= normalizedMaxTarget; target += 1) {
        hitsByNumber[target] = 0;
    }

    return {
        currentTarget: 1,
        maxTarget: normalizedMaxTarget,
        dartsThrown: 0,
        hitsByNumber,
        currentStreak: 0,
        bestStreak: 0,
        isFinished: false,
    };
}

export function cloneAroundTheClockState(
    state: AroundTheClockState
): AroundTheClockState {
    return {
        ...state,
        hitsByNumber: { ...state.hitsByNumber },
    };
}

export function applyAroundTheClockDart(
    state: AroundTheClockState,
    hit: boolean
): AroundTheClockState {
    if (state.isFinished) return state;

    const nextState = cloneAroundTheClockState(state);
    nextState.dartsThrown += 1;

    if (!hit) {
        nextState.currentStreak = 0;
        return nextState;
    }

    nextState.hitsByNumber[state.currentTarget] =
        (nextState.hitsByNumber[state.currentTarget] ?? 0) + 1;
    nextState.currentStreak += 1;
    nextState.bestStreak = Math.max(nextState.bestStreak, nextState.currentStreak);

    if (state.currentTarget >= state.maxTarget) {
        nextState.isFinished = true;
    } else {
        nextState.currentTarget = state.currentTarget + 1;
    }

    return nextState;
}

export function getCompletedTargetCount(state: AroundTheClockState): number {
    if (state.isFinished) return state.maxTarget;
    return Math.max(0, Math.min(state.maxTarget, state.currentTarget - 1));
}

export function getAverageDartsPerNumber(state: AroundTheClockState): number {
    const completedTargets = getCompletedTargetCount(state);
    if (completedTargets === 0) return 0;
    return state.dartsThrown / completedTargets;
}
