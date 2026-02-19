// src/screens/MatchSummaryScreen.tsx
import React from 'react';
import { View, Text, Button, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchSummary'>;

export default function MatchSummaryScreen({ route, navigation }: Props) {
    const { matchId } = route.params;

    const matches = useGameStore(state => state.matches);
    const players = useGameStore(state => state.players);

    const match = matches.find(m => m.id === matchId);

    const getPlayerName = (playerId?: string) =>
        players.find(p => p.id === playerId)?.name ?? (playerId ?? 'Unknown');

    if (!match) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Match not found.</Text>
                <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
            </View>
        );
    }

    const legWins = match.legWinsByPlayer ?? {};
    const bestOfLegs = match.bestOfLegs ?? 1;
    const legsToWin = Math.floor(bestOfLegs / 2) + 1;

    // Determine match winner by leg wins (works for single-leg too)
    let winnerPlayerId: string | undefined;
    let maxWins = -1;
    for (const pid of match.playerIds) {
        const wins = legWins[pid] ?? 0;
        if (wins > maxWins) {
            maxWins = wins;
            winnerPlayerId = pid;
        }
    }
    const winnerName = getPlayerName(winnerPlayerId);

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Match Summary</Text>

            <Text>Date: {new Date(match.createdAt).toLocaleString()}</Text>
            <Text>Game mode: {match.mode}</Text>
            <Text>Start score: {match.startScore}</Text>

            <Text>
                Format: Best of {bestOfLegs} legs (first to {legsToWin})
            </Text>
            <Text>Legs played: {match.legs.length}</Text>

            <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: '600' }}>Players & leg wins:</Text>
                {match.playerIds.map(pid => (
                    <Text key={pid}>
                        - {getPlayerName(pid)} – legs won: {legWins[pid] ?? 0}
                    </Text>
                ))}
            </View>

            <View style={{ marginTop: 16 }}>
                <Text style={{ fontWeight: '600' }}>Legs:</Text>
                {match.legs.length === 0 && <Text>No legs recorded.</Text>}
                {match.legs.map(leg => (
                    <View key={leg.id} style={{ marginVertical: 4 }}>
                        <Text>
                            Leg {leg.sequence}:{' '}
                            Starter: {getPlayerName(leg.startingPlayerId)} | Winner:{' '}
                            {getPlayerName(leg.winnerPlayerId)}
                        </Text>
                    </View>
                ))}
            </View>

            <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '700' }}>
                Winner: {winnerName}
            </Text>

            <View style={{ marginTop: 24, gap: 8 }}>
                <Button
                    title="Back to Home"
                    onPress={() => navigation.navigate('Home')}
                />
            </View>
        </ScrollView>
    );
}

