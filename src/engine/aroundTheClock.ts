// src/engine/aroundTheClock.ts

export interface AroundTheClockState {
    currentTarget: number;                    // current number to hit (1..maxTarget)
    maxTarget: number;                        // usually 20
    dartsThrown: number;
    hitsByNumber: Record<number, number>;     // how many times each number was hit
    currentStreak: number;                    // consecutive hits
    bestStreak: number;                       // best streak of consecutive hits
    isFinished: boolean;
}

export function createInitialAroundTheClockState(
    maxTarget: number = 20
): AroundTheClockState {
    const hitsByNumber: Record<number, number> = {};
    for (let i = 1; i <= maxTarget; i++) {
        hitsByNumber[i] = 0;
    }

    return {
        currentTarget: 1,
        maxTarget,
        dartsThrown: 0,
        hitsByNumber,
        currentStreak: 0,
        bestStreak: 0,
        isFinished: false,
    };
}

export function applyAroundTheClockDart(
    state: AroundTheClockState,
    hit: boolean
): AroundTheClockState {
    if (state.isFinished) {
        return state;
    }

    const newState: AroundTheClockState = {
        ...state,
        hitsByNumber: { ...state.hitsByNumber },
    };

    newState.dartsThrown += 1;

    if (hit) {
        newState.hitsByNumber[state.currentTarget] += 1;
        newState.currentStreak += 1;
        if (newState.currentStreak > newState.bestStreak) {
            newState.bestStreak = newState.currentStreak;
        }

        // Move to next target if we hit the current one
        if (state.currentTarget >= state.maxTarget) {
            newState.isFinished = true;
        } else {
            newState.currentTarget = state.currentTarget + 1;
        }
    } else {
        // Miss breaks streak
        newState.currentStreak = 0;
    }

    return newState;
}

export function getAverageDartsPerNumber(state: AroundTheClockState): number {
    if (state.maxTarget <= 0) return 0;
    if (!state.isFinished) {
        const numbersCompleted = state.currentTarget - 1;
        const denom = numbersCompleted > 0 ? numbersCompleted : 1;
        return state.dartsThrown / denom;
    }
    return state.dartsThrown / state.maxTarget;
}
