// src/screens/AroundTheClockScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getAverageDartsPerNumber } from '../engine/aroundTheClock';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'AroundTheClock'>;

export default function AroundTheClockScreen({ navigation }: Props) {
    const playerIds = useGameStore(s => s.aroundTheClockPlayerIds);
    const statesByPlayer = useGameStore(s => s.aroundTheClockStatesByPlayer);
    const currentIndex = useGameStore(s => s.aroundTheClockCurrentPlayerIndex);
    const dartInTurn = useGameStore(s => s.aroundTheClockDartInTurn);
    const winnerPlayerId = useGameStore(s => s.aroundTheClockWinnerPlayerId);

    const registerAroundTheClockDart = useGameStore(s => s.registerAroundTheClockDart);
    const abandonPractice = useGameStore(s => s.abandonPractice);
    const players = useGameStore(s => s.players);

    const getPlayerName = (id: string) => players.find(p => p.id === id)?.name ?? id;

    const isActive = playerIds.length > 0 && !winnerPlayerId;
    const allowRemoveRef = useRef(false);

    const confirmExit = useCallback(() => {
        Alert.alert(
            'Exit session?',
            'You will lose the current in-progress session.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Exit',
                    style: 'destructive',
                    onPress: () => {
                        allowRemoveRef.current = true;
                        abandonPractice();
                        navigation.navigate('Home');
                    },
                },
            ]
        );
    }, [abandonPractice, navigation]);

    useLayoutEffect(() => {
        if (!isActive) {
            navigation.setOptions({ headerRight: () => null });
            return;
        }

        navigation.setOptions({
            headerLeft: () => null,
            headerRight: () => (
                <Pressable onPress={confirmExit} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontWeight: '600' }}>Exit</Text>
                </Pressable>
            ),
            gestureEnabled: false,
        });
    }, [navigation, isActive, confirmExit]);

    useEffect(() => {
        if (!isActive) return;

        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (allowRemoveRef.current) return;
            e.preventDefault();
            confirmExit();
        });

        return unsub;
    }, [navigation, isActive, confirmExit]);

    // When finished, go to summary
    useEffect(() => {
        if (winnerPlayerId) {
            allowRemoveRef.current = true;
            navigation.replace('AroundTheClockSummary');
        }
    }, [winnerPlayerId, navigation]);

    if (playerIds.length === 0) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <Text>No active session.</Text>
                <AppButton label="Back to Home" onPress={() => navigation.navigate('Home')} />
            </View>
        );
    }

    const currentPlayerId = playerIds[currentIndex];
    const currentState = statesByPlayer[currentPlayerId];

    if (!currentState) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Loading session...</Text>
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

            <Text>Target: {currentState.currentTarget} / {currentState.maxTarget}</Text>
            <Text>Darts thrown: {currentState.dartsThrown}</Text>
            <Text>Best streak: {currentState.bestStreak}</Text>
            <Text>Avg darts per number: {avgDarts}</Text>

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
