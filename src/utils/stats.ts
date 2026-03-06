// src/utils/stats.ts

import { Match, Player, Visit } from '../types/domain';

/* =========================================================
   Small existing helpers
   ========================================================= */

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

/**
 * 3-dart average for one match only.
 */
export function getPlayerMatchAverage(match: Match, playerId: string): number {
    const visits = match.legs.flatMap(l => l.visits).filter(v => v.playerId === playerId);
    if (visits.length === 0) return 0;

    const total = visits.reduce((s, v) => s + (v.totalScore ?? 0), 0);
    const darts = visits.reduce((s, v) => s + (Array.isArray(v.scores) ? v.scores.length : 3), 0);

    if (darts === 0) return 0;
    return (total / darts) * 3;
}

/**
 * Simple checkout rate for one match only.
 */
export function getPlayerCheckoutRate(match: Match, playerId: string): {
    successes: number;
    opportunities: number;
    pct: number;
} {
    const visits = match.legs.flatMap(l => l.visits).filter(v => v.playerId === playerId);

    let opp = 0;
    let success = 0;

    for (const v of visits) {
        const remainingBefore =
            typeof v.remainingBefore === 'number'
                ? v.remainingBefore
                : v.isBust
                    ? v.remainingAfter
                    : v.remainingAfter + v.totalScore;

        if (remainingBefore <= 170 && remainingBefore > 1) {
            opp += 1;
            if (v.isCheckout) success += 1;
        }
    }

    return {
        successes: success,
        opportunities: opp,
        pct: opp === 0 ? 0 : (success / opp) * 100,
    };
}

/* =========================================================
   Phase 4 stats engine
   ========================================================= */

export type StatsWindowKey = 'lastSession' | 'last7d' | 'last30d' | 'allTime';

export interface BasicRate {
    attempts: number;
    hits: number;
    pct: number;
}

export interface StartedSplit {
    legsStarted: number;
    legsStartedWon: number;
    startedPct: number;
    legsNotStarted: number;
    legsNotStartedWon: number;
    notStartedPct: number;
}

export interface CheckoutSegments {
    overall: BasicRate;
    from40to80: BasicRate;
    from81to120: BasicRate;
    from121to170: BasicRate;
}

export interface DoubleTargetStat extends BasicRate {
    label: string; // e.g. D20
}

export interface BestLegStat {
    legId: string;
    matchId: string;
    dartsThrown: number;
    avg3Dart: number;
    score: number;
}

export interface PlayerAggregatedStats {
    playerId: string;
    playerName?: string;

    matchesPlayed: number;
    legsPlayed: number;
    legsWon: number;

    averages: {
        overall3Dart: number;
        first9: number;
    };

    legWinByStarting: StartedSplit;

    checkouts: CheckoutSegments;

    doubles: {
        overall: BasicRate;
        byTarget: DoubleTargetStat[];
    };

    highlights: {
        bestLeg?: BestLegStat;
        count100Plus: number;
        count140Plus: number;
        count180s: number;
    };
}

export type PlayerStatsByWindow = Record<StatsWindowKey, PlayerAggregatedStats>;

function pct(hits: number, attempts: number): number {
    return attempts === 0 ? 0 : (hits / attempts) * 100;
}

function safeRemainingBefore(v: Visit): number {
    if (typeof v.remainingBefore === 'number') return v.remainingBefore;
    return v.isBust ? v.remainingAfter : v.remainingAfter + v.totalScore;
}

function visitDartCount(v: Visit): number {
    return Array.isArray(v.scores) && v.scores.length > 0 ? v.scores.length : 3;
}

function makeRate(attempts = 0, hits = 0): BasicRate {
    return { attempts, hits, pct: pct(hits, attempts) };
}

function windowStartDate(window: StatsWindowKey, allMatches: Match[], playerId: string): Date | null {
    const playerMatches = allMatches
        .filter(m => m.playerIds.includes(playerId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (window === 'allTime') return null;

    if (window === 'lastSession') {
        if (playerMatches.length === 0) return null;
        return new Date(playerMatches[0].createdAt);
    }

    const now = Date.now();
    if (window === 'last7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
    if (window === 'last30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);

    return null;
}

function filterMatchesForWindow(matches: Match[], playerId: string, window: StatsWindowKey): Match[] {
    const playerMatches = matches.filter(m => m.playerIds.includes(playerId));

    if (window === 'allTime') return playerMatches;

    if (window === 'lastSession') {
        if (playerMatches.length === 0) return [];
        const latest = [...playerMatches].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        return [latest];
    }

    const start = windowStartDate(window, matches, playerId);
    if (!start) return playerMatches;

    return playerMatches.filter(
        m => new Date(m.createdAt).getTime() >= start.getTime()
    );
}

function computeBestLeg(matchId: string, legId: string, visits: Visit[], playerId: string): BestLegStat | undefined {
    const pv = visits.filter(v => v.playerId === playerId);
    if (pv.length === 0) return undefined;

    const total = pv.reduce((s, v) => s + v.totalScore, 0);
    const darts = pv.reduce((s, v) => s + visitDartCount(v), 0);
    if (darts === 0) return undefined;

    return {
        legId,
        matchId,
        dartsThrown: darts,
        avg3Dart: (total / darts) * 3,
        score: total,
    };
}

function compareBestLeg(a?: BestLegStat, b?: BestLegStat): BestLegStat | undefined {
    if (!a) return b;
    if (!b) return a;

    // Prefer fewer darts; if tied, prefer higher average
    if (b.dartsThrown < a.dartsThrown) return b;
    if (b.dartsThrown > a.dartsThrown) return a;

    if (b.avg3Dart > a.avg3Dart) return b;
    return a;
}

/**
 * Core aggregation for one player across a list of matches.
 */
export function aggregatePlayerStats(
    matches: Match[],
    players: Player[],
    playerId: string
): PlayerAggregatedStats {
    const playerName = players.find(p => p.id === playerId)?.name;

    const relevantMatches = matches.filter(m => m.playerIds.includes(playerId));

    let matchesPlayed = relevantMatches.length;
    let legsPlayed = 0;
    let legsWon = 0;

    let totalScored = 0;
    let totalDarts = 0;

    let first9Scored = 0;
    let first9Darts = 0;

    let legsStarted = 0;
    let legsStartedWon = 0;
    let legsNotStarted = 0;
    let legsNotStartedWon = 0;

    let checkoutOppOverall = 0;
    let checkoutHitOverall = 0;

    let opp40to80 = 0;
    let hit40to80 = 0;
    let opp81to120 = 0;
    let hit81to120 = 0;
    let opp121to170 = 0;
    let hit121to170 = 0;

    let doublesAttemptedOverall = 0;
    let doublesHitOverall = 0;
    const doublesByTargetMap = new Map<string, { attempts: number; hits: number }>();

    let count100Plus = 0;
    let count140Plus = 0;
    let count180s = 0;

    let bestLeg: BestLegStat | undefined = undefined;

    for (const match of relevantMatches) {
        for (const leg of match.legs) {
            const playerVisits = leg.visits.filter(v => v.playerId === playerId);
            if (playerVisits.length === 0) continue;

            legsPlayed += 1;
            if (leg.winnerPlayerId === playerId) legsWon += 1;

            const started = leg.startingPlayerId === playerId;
            if (started) {
                legsStarted += 1;
                if (leg.winnerPlayerId === playerId) legsStartedWon += 1;
            } else {
                legsNotStarted += 1;
                if (leg.winnerPlayerId === playerId) legsNotStartedWon += 1;
            }

            // Full average
            for (const v of playerVisits) {
                totalScored += v.totalScore ?? 0;
                totalDarts += visitDartCount(v);

                if (v.totalScore >= 100) count100Plus += 1;
                if (v.totalScore >= 140) count140Plus += 1;
                if (v.totalScore === 180) count180s += 1;

                const remainingBefore = safeRemainingBefore(v);

                // Checkout opportunities
                if (remainingBefore <= 170 && remainingBefore > 1) {
                    checkoutOppOverall += 1;
                    if (v.isCheckout) checkoutHitOverall += 1;

                    if (remainingBefore >= 40 && remainingBefore <= 80) {
                        opp40to80 += 1;
                        if (v.isCheckout) hit40to80 += 1;
                    } else if (remainingBefore >= 81 && remainingBefore <= 120) {
                        opp81to120 += 1;
                        if (v.isCheckout) hit81to120 += 1;
                    } else if (remainingBefore >= 121 && remainingBefore <= 170) {
                        opp121to170 += 1;
                        if (v.isCheckout) hit121to170 += 1;
                    }
                }

                // Double hit rate
                // Requires segments + multipliers from per-dart storage.
                if (Array.isArray(v.segments) && Array.isArray(v.multipliers)) {
                    for (let i = 0; i < Math.min(v.segments.length, v.multipliers.length); i++) {
                        const seg = v.segments[i];
                        const mult = v.multipliers[i];

                        if (mult !== 2) continue; // only doubles counted here

                        const label = seg === 25 ? 'BULL' : `D${seg}`;
                        doublesAttemptedOverall += 1;

                        // If multiplier is 2 and the dart was recorded, treat it as a hit of that double target
                        doublesHitOverall += 1;

                        const prev = doublesByTargetMap.get(label) ?? { attempts: 0, hits: 0 };
                        prev.attempts += 1;
                        prev.hits += 1;
                        doublesByTargetMap.set(label, prev);
                    }
                }
            }

            // First 9 darts = first 3 visits in each leg
            const firstThreeVisits = playerVisits.slice(0, 3);
            for (const v of firstThreeVisits) {
                first9Scored += v.totalScore ?? 0;
                first9Darts += visitDartCount(v);
            }

            // Best leg
            bestLeg = compareBestLeg(bestLeg, computeBestLeg(match.id, leg.id, leg.visits, playerId));
        }
    }

    const doublesByTarget: DoubleTargetStat[] = [...doublesByTargetMap.entries()]
        .map(([label, v]) => ({
            label,
            attempts: v.attempts,
            hits: v.hits,
            pct: pct(v.hits, v.attempts),
        }))
        .sort((a, b) => {
            // sort by attempts desc, then label
            if (b.attempts !== a.attempts) return b.attempts - a.attempts;
            return a.label.localeCompare(b.label);
        });

    return {
        playerId,
        playerName,

        matchesPlayed,
        legsPlayed,
        legsWon,

        averages: {
            overall3Dart: totalDarts === 0 ? 0 : (totalScored / totalDarts) * 3,
            first9: first9Darts === 0 ? 0 : (first9Scored / first9Darts) * 3,
        },

        legWinByStarting: {
            legsStarted,
            legsStartedWon,
            startedPct: pct(legsStartedWon, legsStarted),
            legsNotStarted,
            legsNotStartedWon,
            notStartedPct: pct(legsNotStartedWon, legsNotStarted),
        },

        checkouts: {
            overall: makeRate(checkoutOppOverall, checkoutHitOverall),
            from40to80: makeRate(opp40to80, hit40to80),
            from81to120: makeRate(opp81to120, hit81to120),
            from121to170: makeRate(opp121to170, hit121to170),
        },

        doubles: {
            overall: makeRate(doublesAttemptedOverall, doublesHitOverall),
            byTarget: doublesByTarget,
        },

        highlights: {
            bestLeg,
            count100Plus,
            count140Plus,
            count180s,
        },
    };
}

/**
 * One function to get all windows for one player.
 * This is what your PlayerStatsScreen should call.
 */
export function getPlayerStatsByWindow(
    matches: Match[],
    players: Player[],
    playerId: string
): PlayerStatsByWindow {
    const windows: StatsWindowKey[] = ['lastSession', 'last7d', 'last30d', 'allTime'];

    const result = {} as PlayerStatsByWindow;

    for (const window of windows) {
        const filtered = filterMatchesForWindow(matches, playerId, window);
        result[window] = aggregatePlayerStats(filtered, players, playerId);
    }

    return result;
}