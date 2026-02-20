// src/screens/AroundTheClockScreen.tsx
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getAverageDartsPerNumber } from '../engine/aroundTheClock';
import AppButton from "../components/AppButton";

type Props = NativeStackScreenProps<RootStackParamList, 'AroundTheClock'>;

export default function AroundTheClockScreen({ navigation }: Props) {
    const playerIds = useGameStore(s => s.aroundTheClockPlayerIds);
    const statesByPlayer = useGameStore(s => s.aroundTheClockStatesByPlayer);
    const currentIndex = useGameStore(s => s.aroundTheClockCurrentPlayerIndex);
    const dartInTurn = useGameStore(s => s.aroundTheClockDartInTurn);
    const winnerPlayerId = useGameStore(s => s.aroundTheClockWinnerPlayerId);

    const registerAroundTheClockDart = useGameStore(s => s.registerAroundTheClockDart);
    const players = useGameStore(s => s.players);

    const getPlayerName = (id: string) =>
        players.find(p => p.id === id)?.name ?? id;

    // When finished, go to summary
    useEffect(() => {
        if (winnerPlayerId) {
            navigation.replace('AroundTheClockSummary');
        }
    }, [winnerPlayerId, navigation]);

    if (playerIds.length === 0) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text>No active practice session.</Text>
                <AppButton label="Back to New Game" onPress={() => navigation.navigate('NewMatch')} />
            </View>
        );
    }

    const currentPlayerId = playerIds[currentIndex];
    const currentState = statesByPlayer[currentPlayerId];

    if (!currentState) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Loading practice...</Text>
            </View>
        );
    }

    const avgDarts = getAverageDartsPerNumber(currentState).toFixed(2);

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Around the Clock</Text>

            <Text style={{ fontWeight: '600' }}>
                Current player: {getPlayerName(currentPlayerId)} (Dart {dartInTurn + 1}/3)
            </Text>

            <Text>
                Your target: {currentState.currentTarget} / {currentState.maxTarget}
            </Text>
            <Text>Your darts thrown: {currentState.dartsThrown}</Text>
            <Text>Your best streak: {currentState.bestStreak}</Text>
            <Text>Your avg darts per number: {avgDarts}</Text>

            <View style={{ marginTop: 8, gap: 8 }}>
                <AppButton label="Hit" onPress={() => registerAroundTheClockDart(true)} />
                <AppButton label="Miss" onPress={() => registerAroundTheClockDart(false)} />
            </View>

            <View style={{ marginTop: 16 }}>
                <Text style={{ fontWeight: '600' }}>Progress</Text>
                {playerIds.map(pid => {
                    const s = statesByPlayer[pid];
                    return (
                        <Text key={pid}>
                            {getPlayerName(pid)}: {s ? `${s.currentTarget}/${s.maxTarget}` : '—'}
                        </Text>
                    );
                })}
            </View>
        </View>
    );
}
