// src/screens/ScoreboardScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Alert, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getLegAverage } from '../engine/x01';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

export default function ScoreboardScreen({ navigation }: Props) {
    const currentMatch = useGameStore(s => s.currentMatch);
    const currentLegState = useGameStore(s => s.currentLegState);
    const players = useGameStore(s => s.players);
    const addVisit = useGameStore(s => s.addVisit);
    const finishLegIfNeeded = useGameStore(s => s.finishLegIfNeeded);
    const abandonMatch = useGameStore(s => s.abandonMatch);

    const [inputScore, setInputScore] = useState('');

    const isActive = Boolean(currentMatch && currentLegState);

    // Allows programmatic navigation (e.g. match finished -> summary) without the exit prompt.
    const allowRemoveRef = useRef(false);

    const confirmExit = useCallback(() => {
        Alert.alert(
            'Exit match?',
            'You will lose the current in-progress match.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Exit',
                    style: 'destructive',
                    onPress: () => {
                        allowRemoveRef.current = true;
                        abandonMatch();
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    },
                },
            ]
        );
    }, [abandonMatch, navigation]);

    // Header: no back arrow; explicit Exit button.
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
            gestureEnabled: false, // helps on iOS (if supported by your navigator)
        });
    }, [navigation, isActive, confirmExit]);

    // Block swipe-back / hardware back / header back while active
    useEffect(() => {
        if (!isActive) return;

        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (allowRemoveRef.current) return;
            e.preventDefault();
            confirmExit();
        });

        return unsub;
    }, [navigation, isActive, confirmExit]);

    // When a leg gets a winner, either start next leg or go to summary
    useEffect(() => {
        if (!currentLegState?.winnerPlayerId || !currentMatch) return;

        const { matchFinished, matchId } = finishLegIfNeeded();

        if (matchFinished && matchId) {
            allowRemoveRef.current = true;
            navigation.replace('MatchSummary', { matchId });
        }
    }, [currentLegState?.winnerPlayerId, currentMatch, finishLegIfNeeded, navigation]);

    if (!currentMatch || !currentLegState) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <Text>No active match.</Text>
                <AppButton label="Back to Home" onPress={() => navigation.navigate('Home')} />
            </View>
        );
    }

    const findPlayerName = (id: string) => players.find(p => p.id === id)?.name ?? 'Player';

    const handleSubmit = () => {
        const score = Number(inputScore);
        if (Number.isNaN(score) || score < 0 || score > 180) {
            Alert.alert('Invalid score', 'Enter a number between 0 and 180');
            return;
        }

        addVisit([score, 0, 0]); // total for 3 darts (MVP)
        setInputScore('');
    };

    return (
        <View style={{ flex: 1, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8 }}>Scoreboard</Text>

            {currentMatch.playerIds.map(pid => (
                <View key={pid} style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 }}>
                    <Text>
                        {findPlayerName(pid)} {pid === currentLegState.currentPlayerId ? '⟵' : ''}
                    </Text>
                    <Text>{currentLegState.scoresByPlayer[pid]}</Text>
                    <Text>Avg: {getLegAverage(currentLegState, pid).toFixed(1)}</Text>
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
                    style={{ borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}
                />
                <AppButton label="Submit" onPress={handleSubmit} />

                {__DEV__ && (
                    <View style={{ marginTop: 12 }}>
                        <AppButton
                            label="DEV: Minimise (go Home, keep match)"
                            variant="secondary"
                            onPress={() => {
                                // allow leaving without triggering the Exit confirmation
                                allowRemoveRef.current = true;
                                navigation.navigate('Home');

                                // reset flag immediately so future attempts still prompt
                                setTimeout(() => {
                                    allowRemoveRef.current = false;
                                }, 0);
                            }}
                        />
                    </View>
                )}

            </View>
        </View>
    );
}
