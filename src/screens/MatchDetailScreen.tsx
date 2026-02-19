import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getMatchWinnerId, getPlayerMatchAverage, getPlayerCheckoutRate } from '../utils/stats';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchDetail'>;

export default function MatchDetailScreen({ route, navigation }: Props) {
    const { matchId } = route.params;

    const matches = useGameStore(s => s.matches);
    const players = useGameStore(s => s.players);


    const match = matches.find(m => m.id === matchId);

    const playerName = (id: string) => players.find(p => p.id === id)?.name ?? 'Unknown';

    if (!match) {
        return (
            <View style={{ flex: 1, padding: 16 }}>
                <Text>Match not found.</Text>
            </View>
        );
    }

    const winnerId = getMatchWinnerId(match);
    const winner = winnerId ? playerName(winnerId) : '—';

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Match Detail</Text>

            <Text>Date: {new Date(match.createdAt).toLocaleString()}</Text>
            <Text>Mode: {match.mode}</Text>
            <Text>Start score: {match.startScore}</Text>
            <Text>Best of legs: {match.bestOfLegs ?? 1}</Text>
            <Text>Winner: {winner}</Text>

            <Text style={{ marginTop: 10, fontWeight: '700' }}>Player stats</Text>
            {match.playerIds.map(pid => {
                const avg = getPlayerMatchAverage(match, pid).toFixed(1);
                const co = getPlayerCheckoutRate(match, pid);
                return (
                    <View key={pid} style={{ borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 }}>
                        <Text style={{ fontWeight: '700' }}>{playerName(pid)}</Text>
                        <Text>Avg (per visit): {avg}</Text>
                        <Text>Checkout: {co.successes}/{co.opportunities} ({co.pct.toFixed(1)}%)</Text>
                        <Text>Legs won: {match.legWinsByPlayer?.[pid] ?? 0}</Text>
                    </View>
                );
            })}

            <Text style={{ marginTop: 10, fontWeight: '700' }}>Legs</Text>
            <FlatList
                data={match.legs}
                keyExtractor={(l) => l.id}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => navigation.navigate('LegDetail', { matchId: match.id, legId: item.id })}
                        style={{ borderWidth: 1, borderRadius: 10, padding: 10 }}
                    >
                        <Text style={{ fontWeight: '700' }}>Leg {item.sequence}</Text>
                        <Text>Started: {playerName(item.startingPlayerId)}</Text>
                        <Text>Winner: {item.winnerPlayerId ? playerName(item.winnerPlayerId) : '—'}</Text>
                        <Text>Visits: {item.visits.length}</Text>
                        <Text style={{ marginTop: 6, opacity: 0.7 }}>Tap for details</Text>
                    </Pressable>
                )}
            />
        </View>
    );
}
