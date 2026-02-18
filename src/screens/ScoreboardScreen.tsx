// src/screens/ScoreboardScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getLegAverage } from '../engine/x01';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

export default function ScoreboardScreen({ navigation }: Props) {
    const currentMatch = useGameStore(state => state.currentMatch);
    const currentLegState = useGameStore(state => state.currentLegState);
    const players = useGameStore(state => state.players);
    const addVisit = useGameStore(state => state.addVisit);
    const finishLegIfNeeded = useGameStore(state => state.finishLegIfNeeded);


    const [inputScore, setInputScore] = useState('');

    // When someone wins the leg, finalise and go to summary
    useEffect(() => {
        if (currentLegState?.winnerPlayerId && currentMatch) {
            finishLegIfNeeded();
            navigation.replace('MatchSummary', { matchId: currentMatch.id });
        }
    }, [currentLegState?.winnerPlayerId]);

    if (!currentMatch || !currentLegState) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No active match.</Text>
        <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
        </View>
    );
    }

    const findPlayerName = (id: string) =>
        players.find(p => p.id === id)?.name ?? 'Player';

    const handleSubmit = () => {
        const score = Number(inputScore);
        if (Number.isNaN(score) || score < 0 || score > 180) {
            Alert.alert('Invalid score', 'Enter a number between 0 and 180');
            return;
        }

        addVisit([score]); // treat input as total for 3 darts for now
        setInputScore('');
    };

    return (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
    <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8 }}>Scoreboard</Text>

    {currentMatch.playerIds.map(pid => (
        <View
            key={pid}
        style={{
        flexDirection: 'row',
            justifyContent: 'space-between',
            marginVertical: 4,
    }}
    >
        <Text>
            {findPlayerName(pid)}{' '}
        {pid === currentLegState.currentPlayerId ? '⟵' : ''}
        </Text>
        <Text>{currentLegState.scoresByPlayer[pid]}</Text>
        <Text>
        Avg:{' '}
        {getLegAverage(currentLegState, pid).toFixed(1)}
        </Text>
        </View>
    ))}

    <View style={{ marginTop: 24 }}>
    <Text style={{ marginBottom: 8 }}>
    Enter score for {findPlayerName(currentLegState.currentPlayerId)}
    </Text>
    <TextInput
    value={inputScore}
    onChangeText={setInputScore}
    keyboardType="numeric"
    style={{
        borderWidth: 1,
            borderRadius: 8,
            padding: 8,
            marginBottom: 8,
    }}
    />
    <Button title="Submit" onPress={handleSubmit} />
    </View>
    </View>
);
}
