import React, { useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { Visit } from '../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'LegDetail'>;

function computeLegPlayerStats(visits: Visit[], playerId: string) {
    const pv = visits.filter(v => v.playerId === playerId);

    const totalScored = pv.reduce((s, v) => s + v.totalScore, 0);
    const dartsThrown = pv.reduce((s, v) => s + (v.scores?.length ?? 0), 0);

    const avg3Dart = dartsThrown === 0 ? 0 : (totalScored / dartsThrown) * 3;

    const busts = pv.filter(v => v.isBust).length;
    const checkouts = pv.filter(v => v.isCheckout).length;

    const c180 = pv.filter(v => v.totalScore === 180).length;
    const c140 = pv.filter(v => v.totalScore >= 140 && v.totalScore < 180).length;
    const c100 = pv.filter(v => v.totalScore >= 100 && v.totalScore < 140).length;

    return { visits: pv.length, dartsThrown, totalScored, avg3Dart, busts, checkouts, c180, c140, c100 };
}

export default function LegDetailScreen({ route }: Props) {
    const { matchId, legId } = route.params;

    const matches = useGameStore(s => s.matches);
    const players = useGameStore(s => s.players);

    const match = matches.find(m => m.id === matchId);
    const leg = match?.legs.find(l => l.id === legId);

    const playerName = (id: string) => players.find(p => p.id === id)?.name ?? 'Unknown';

    const playerSummaries = useMemo(() => {
        if (!match || !leg) return [];
        return match.playerIds.map(pid => ({
            playerId: pid,
            name: playerName(pid),
            stats: computeLegPlayerStats(leg.visits, pid),
        }));
    }, [match, leg, players]);

    if (!match || !leg) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
                <Text>Leg not found.</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Leg {leg.sequence}</Text>

            <Text>Match start score: {match.startScore}</Text>
            <Text>Started: {playerName(leg.startingPlayerId)}</Text>
            <Text>Winner: {leg.winnerPlayerId ? playerName(leg.winnerPlayerId) : '—'}</Text>

            <Text style={{ marginTop: 8, fontWeight: '700' }}>Per-player (this leg)</Text>
            {playerSummaries.map(s => (
                <View key={s.playerId} style={{ borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 }}>
                    <Text style={{ fontWeight: '700' }}>{s.name}</Text>
                    <Text>Avg: {s.stats.avg3Dart.toFixed(1)} | Visits: {s.stats.visits}</Text>
                    <Text>Busts: {s.stats.busts} | Checkouts: {s.stats.checkouts}</Text>
                    <Text>180: {s.stats.c180} | 140+: {s.stats.c140} | 100+: {s.stats.c100}</Text>
                </View>
            ))}

            <Text style={{ marginTop: 8, fontWeight: '700' }}>Timeline</Text>
            <FlatList
                data={leg.visits}
                keyExtractor={(v) => v.id}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item, index }) => (
                    <View style={{ borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 }}>
                        <Text style={{ fontWeight: '700' }}>
                            #{index + 1} — {playerName(item.playerId)}
                        </Text>

                        <Text>
                            Score: {item.totalScore}
                            {item.isBust ? '  (BUST)' : ''}
                            {item.isCheckout ? '  (CHECKOUT)' : ''}
                        </Text>

                        <Text>Remaining after: {item.remainingAfter}</Text>

                        {/* Optional: show dart breakdown */}
                        <Text style={{ opacity: 0.75 }}>
                            Darts: {item.scores?.join(', ') ?? '—'}
                        </Text>
                    </View>
                )}
            />
        </View>
    );
}
