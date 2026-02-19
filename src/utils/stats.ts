import { Match } from '../types/domain';

export function getMatchWinnerId(match: Match): string | undefined {
    if (!match.legs.length) return undefined;

    if (match.legWinsByPlayer) {
        let bestId: string | undefined;
        let bestWins = -1;
        for (const [pid, wins] of Object.entries(match.legWinsByPlayer)) {
            if (wins > bestWins) {
                bestWins = wins;
                bestId = pid;
            }
        }
        return bestId;
    }

    // fallback: winner of last leg
    return match.legs[match.legs.length - 1].winnerPlayerId;
}

export function getPlayerMatchAverage(match: Match, playerId: string): number {
    const visits = match.legs.flatMap(l => l.visits).filter(v => v.playerId === playerId);
    if (visits.length === 0) return 0;
    const total = visits.reduce((s, v) => s + v.totalScore, 0);
    return (total / visits.length); // visits are treated as 3 darts
}

// Checkout opportunities: remaining BEFORE visit <= 170
export function getPlayerCheckoutRate(match: Match, playerId: string): { successes: number; opportunities: number; pct: number } {
    const visits = match.legs.flatMap(l => l.visits).filter(v => v.playerId === playerId);
    let opp = 0;
    let success = 0;

    for (const v of visits) {
        const remainingBefore = v.isBust ? v.remainingAfter : (v.remainingAfter + v.totalScore);
        if (remainingBefore <= 170) {
            opp += 1;
            if (v.isCheckout) success += 1;
        }
    }

    return { successes: success, opportunities: opp, pct: opp === 0 ? 0 : (success / opp) * 100 };
}
