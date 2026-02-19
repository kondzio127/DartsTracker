// src/screens/NewMatchScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMatch'>;

export default function NewMatchScreen({ navigation }: Props) {
    const addPlayer = useGameStore(s => s.addPlayer);
    const startMatch = useGameStore(s => s.startMatch);

    const [playerNames, setPlayerNames] = useState<string[]>(['', '']);
    const [startScore, setStartScore] = useState('501');

    // 'single' = 1 leg, 'bestOf' = best of N
    const [formatType, setFormatType] = useState<'single' | 'bestOf'>('single');
    const [bestOfLegs, setBestOfLegs] = useState('3');

    const handleStart = () => {
        const validNames = playerNames.map(n => n.trim()).filter(n => n.length > 0);
        if (validNames.length < 1) {
            // In a real app, show an alert. For now just return.
            return;
        }

        // Create players for now (later we’ll switch to selecting existing profiles)
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
    };

    return (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>New Match</Text>

            {/* Player names */}
            {playerNames.map((name, index) => (
                <TextInput
                    key={index}
                    placeholder={`Player ${index + 1} name`}
                    value={name}
                    onChangeText={text => {
                        const updated = [...playerNames];
                        updated[index] = text;
                        setPlayerNames(updated);
                    }}
                    style={{
                        borderWidth: 1,
                        borderRadius: 8,
                        padding: 8,
                    }}
                />
            ))}

            <Button
                title="Add another player"
                onPress={() => setPlayerNames([...playerNames, ''])}
            />

            {/* Start score */}
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

            {/* Match format */}
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

            <Button title="Start match" onPress={handleStart} />
        </View>
    );
}
