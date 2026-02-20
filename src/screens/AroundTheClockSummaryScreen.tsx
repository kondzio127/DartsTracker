// src/screens/AroundTheClockSummaryScreen.tsx
import React, { useCallback, useLayoutEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getAverageDartsPerNumber } from '../engine/aroundTheClock';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'AroundTheClockSummary'>;

export default function AroundTheClockSummaryScreen({ navigation }: Props) {
    const playerIds = useGameStore(s => s.aroundTheClockPlayerIds);
    const statesByPlayer = useGameStore(s => s.aroundTheClockStatesByPlayer);
    const winnerPlayerId = useGameStore(s => s.aroundTheClockWinnerPlayerId);

    const startAroundTheClock = useGameStore(s => s.startAroundTheClock);
    const resetAroundTheClock = useGameStore(s => s.resetAroundTheClock);
    const players = useGameStore(s => s.players);

    const getPlayerName = (id: string) => players.find(p => p.id === id)?.name ?? id;

    const handleDone = useCallback(() => {
        resetAroundTheClock();
        navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
        });
    }, [resetAroundTheClock, navigation]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: () => null,
            headerRight: () => (
                <Pressable onPress={handleDone} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontWeight: '600' }}>Done</Text>
                </Pressable>
            ),
            gestureEnabled: false,
        });
    }, [navigation, handleDone]);

    if (playerIds.length === 0) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <Text>No session found.</Text>
                <AppButton label="Done" onPress={() => navigation.navigate('Home')} />
            </View>
        );
    }

    const firstState = statesByPlayer[playerIds[0]];
    const maxTarget = firstState?.maxTarget ?? 20;
    const winnerName = winnerPlayerId ? getPlayerName(winnerPlayerId) : '—';

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Practice Summary</Text>
            <Text style={{ fontWeight: '500' }}>Game mode: Around the Clock</Text>
            <Text>Numbers: 1 → {maxTarget}</Text>
            <Text style={{ marginTop: 8, fontSize: 16, fontWeight: '700' }}>Winner: {winnerName}</Text>

            <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: '700', marginBottom: 8 }}>Per-player stats</Text>

                {playerIds.map(pid => {
                    const s = statesByPlayer[pid];
                    if (!s) return null;

                    const avg = getAverageDartsPerNumber(s).toFixed(2);
                    const finishedText = s.isFinished ? 'Finished' : 'Not finished';

                    return (
                        <View key={pid} style={{ borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                            <Text style={{ fontWeight: '700' }}>{getPlayerName(pid)}</Text>
                            <Text>{finishedText}</Text>
                            <Text>Reached: {Math.min(s.currentTarget, s.maxTarget)} / {s.maxTarget}</Text>
                            <Text>Darts thrown: {s.dartsThrown}</Text>
                            <Text>Best streak: {s.bestStreak}</Text>
                            <Text>Avg darts per number: {avg}</Text>
                        </View>
                    );
                })}
            </View>

            <View style={{ marginTop: 12, gap: 8 }}>
                <AppButton
                    label="Play again (same players)"
                    onPress={() => {
                        startAroundTheClock(playerIds, maxTarget);
                        navigation.replace('AroundTheClock');
                    }}
                />
                <AppButton label="Done" onPress={handleDone} />
            </View>
        </ScrollView>
    );
}
