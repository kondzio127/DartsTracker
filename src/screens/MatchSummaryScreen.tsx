// src/screens/MatchSummaryScreen.tsx
import React from 'react';
import { View, Text, Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchSummary'>;

export default function MatchSummaryScreen({ route, navigation }: Props) {
    const { matchId } = route.params;

    const matches = useGameStore(state => state.matches);
    const players = useGameStore(state => state.players);

    const match = matches.find(m => m.id === matchId);

    if (!match || match.legs.length === 0) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Match not found or no legs recorded.</Text>
        <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
        </View>
    );
    }

    const leg = match.legs[0]; // single-leg for now
    const winnerPlayerId = leg.winnerPlayerId;
    const winnerName =
        players.find(p => p.id === winnerPlayerId)?.name ?? 'Unknown';

    return (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
    <Text style={{ fontSize: 20, fontWeight: '600' }}>Match Summary</Text>

    <Text>Date: {new Date(match.createdAt).toLocaleString()}</Text>
    <Text>Start score: {match.startScore}</Text>

    <Text style={{ marginTop: 16, fontWeight: '500' }}>Players:</Text>
    {match.playerIds.map(pid => (
        <Text key={pid}>
            - {players.find(p => p.id === pid)?.name ?? pid}
            </Text>
    ))}

    <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '600' }}>
    Winner: {winnerName}
    </Text>

    <View style={{ marginTop: 24, gap: 8 }}>
    <Button title="Play again (dummy for now)" onPress={() => navigation.navigate('Home')} />
    <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
    </View>
    </View>
);
}
