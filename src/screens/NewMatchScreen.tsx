// src/screens/NewMatchScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMatch'>;

export default function NewMatchScreen({ navigation }: Props) {
    const addPlayer = useGameStore(s => s.addPlayer);
    const startMatch = useGameStore(s => s.startMatch);
    const startAroundTheClock = useGameStore(s => s.startAroundTheClock);

    // Default is X01, so we start with 2 player slots
    const [playerNames, setPlayerNames] = useState<string[]>(['', '']);

    // X01 settings
    const [startScore, setStartScore] = useState('501');
    const [formatType, setFormatType] = useState<'single' | 'bestOf'>('single');
    const [bestOfLegs, setBestOfLegs] = useState('3');

    // Game mode selection
    const [gameMode, setGameMode] = useState<'X01' | 'AROUND_THE_CLOCK'>('X01');

    // Helper to change mode and adjust player inputs (default counts per mode)
    const handleSetGameMode = (mode: 'X01' | 'AROUND_THE_CLOCK') => {
        setGameMode(mode);

        setPlayerNames(prev => {
            // keep whatever the user already typed in slot 1
            const first = (prev[0] ?? '');

            if (mode === 'AROUND_THE_CLOCK') {
                // Default to EXACTLY 1 player input for practice
                return [first];
            }

            // mode === 'X01'
            // Default to AT LEAST 2 player inputs, keeping what user typed
            const second = (prev[1] ?? '');
            let next = [first, second];

            // If they previously had more (from x01), keep them (up to 4)
            // If they came from ATC (1 slot), this ensures we have 2 slots.
            if (prev.length > 2) {
                next = [...next, ...prev.slice(2, 4)];
            }

            return next;
        });
    };


    const handleChangePlayerName = (index: number, text: string) => {
        setPlayerNames(prev => {
            const next = [...prev];
            next[index] = text;
            return next;
        });
    };

    const handleAddPlayer = () => {
        setPlayerNames(prev => {
            if (prev.length >= 4) return prev; // cap at 4
            return [...prev, ''];
        });
    };

    const handleRemovePlayer = () => {
        setPlayerNames(prev => {
            if (prev.length <= 1) return prev; // min 1 player overall
            const next = [...prev];
            next.pop();
            return next;
        });
    };

    const handleStart = () => {
        const validNames = playerNames.map(n => n.trim()).filter(n => n.length > 0);

        if (validNames.length < 1) {
            Alert.alert('Add at least one player', 'Please enter at least one player name.');
            return;
        }

        if (gameMode === 'X01') {
            // For X01 we *prefer* 2+ players, but we allow 1 (solo practice)
            const playerIds = validNames.map(name => addPlayer(name).id);

            const numericStartScore = Number(startScore) || 501;

            let legs: number;
            if (formatType === 'single') {
                legs = 1;
            } else {
                const parsed = Number(bestOfLegs);
                legs = Number.isNaN(parsed) || parsed < 1 ? 3 : Math.floor(parsed);
            }

            startMatch({
                playerIds,
                startScore: numericStartScore,
                bestOfLegs: legs,
            });

            navigation.navigate('Scoreboard');
        } else {
            // AROUND_THE_CLOCK: use all entered names as session players
            const playerIds = validNames.map(name => addPlayer(name).id);
            startAroundTheClock(playerIds);
            navigation.navigate('AroundTheClock');
        }
    };

    const canAddPlayer = playerNames.length < 4;
    const canRemovePlayer = playerNames.length > 1; // global min 1 player

    return (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>New Game</Text>

            {/* Game mode */}
            <Text style={{ marginTop: 8, fontWeight: '500' }}>Game mode</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Button title="X01" onPress={() => handleSetGameMode('X01')} />
                <Button
                    title="Around the Clock"
                    onPress={() => handleSetGameMode('AROUND_THE_CLOCK')}
                />
            </View>

            {/* Player names */}
            <Text style={{ marginTop: 8, fontWeight: '500' }}>Players (1–4)</Text>
            {playerNames.map((name, index) => (
                <TextInput
                    key={index}
                    placeholder={`Player ${index + 1} name`}
                    value={name}
                    onChangeText={text => handleChangePlayerName(index, text)}
                    style={{
                        borderWidth: 1,
                        borderRadius: 8,
                        padding: 8,
                        marginBottom: 8,
                    }}
                />
            ))}

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Button
                    title="Add player"
                    onPress={handleAddPlayer}
                    disabled={!canAddPlayer}
                />
                <Button
                    title="Remove player"
                    onPress={handleRemovePlayer}
                    disabled={!canRemovePlayer}
                />
            </View>

            {/* X01-only settings */}
            {gameMode === 'X01' && (
                <>
                    <Text style={{ marginTop: 16, fontWeight: '500' }}>Start score</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <Button title="301" onPress={() => setStartScore('301')} />
                        <Button title="501" onPress={() => setStartScore('501')} />
                        <Button title="701" onPress={() => setStartScore('701')} />
                    </View>
                    <TextInput
                        value={startScore}
                        onChangeText={setStartScore}
                        keyboardType="numeric"
                        style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}
                    />

                    <Text style={{ marginTop: 16, fontWeight: '500' }}>Match format</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <Button title="Single leg" onPress={() => setFormatType('single')} />
                        <Button title="Best of N legs" onPress={() => setFormatType('bestOf')} />
                    </View>

                    {formatType === 'bestOf' && (
                        <View>
                            <Text>Best of how many legs?</Text>
                            <TextInput
                                value={bestOfLegs}
                                onChangeText={setBestOfLegs}
                                keyboardType="numeric"
                                style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}
                            />
                        </View>
                    )}
                </>
            )}

            <Button title="Start" onPress={handleStart} />
        </View>
    );
}
