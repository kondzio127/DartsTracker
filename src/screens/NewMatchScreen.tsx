// src/screens/NewMatchScreen.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from "../components/AppButton";
import { getFlagEmoji, getCountryName } from '../utils/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMatch'>;

type GameModeUI = 'X01' | 'AROUND_THE_CLOCK';
type FormatType = 'single' | 'bestOf';

export default function NewMatchScreen({ navigation }: Props) {
    const players = useGameStore(s => s.players);
    const startMatch = useGameStore(s => s.startMatch);
    const startAroundTheClock = useGameStore(s => s.startAroundTheClock);

    const activePlayers = useMemo(
        () =>
            [...players]
                .filter(p => !p.isHidden)
                .sort((a, b) => a.name.localeCompare(b.name)),
        [players]
    );

    const [gameMode, setGameMode] = useState<GameModeUI | null>(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

    const [startScore, setStartScore] = useState<number>(501);
    const [formatType, setFormatType] = useState<FormatType>('single');
    const [bestOfLegs, setBestOfLegs] = useState<number>(3);

    const [maxTarget, setMaxTarget] = useState<number>(20);

    const maxSelectablePlayers = 4;

    const toggleSelect = (playerId: string) => {
        setSelectedPlayerIds(prev => {
            if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
            if (prev.length >= maxSelectablePlayers) return prev;
            return [...prev, playerId];
        });
    };

    const canStart =
        gameMode !== null &&
        selectedPlayerIds.length >= 1 &&
        selectedPlayerIds.length <= maxSelectablePlayers;

    const normalizeBestOfLegs = (n: number) => {
        if (n < 1) return 1;
        return n % 2 === 0 ? n + 1 : n;
    };

    const onStart = () => {
        if (!gameMode) {
            Alert.alert('Select game mode', 'Please choose X01 or Around the Clock first.');
            return;
        }
        if (!canStart) {
            Alert.alert('Select players', 'Pick at least 1 player (up to 4).');
            return;
        }

        if (gameMode === 'X01') {
            const legs = formatType === 'single' ? 1 : normalizeBestOfLegs(bestOfLegs);

            startMatch({
                playerIds: selectedPlayerIds,
                startScore: startScore || 501,
                bestOfLegs: legs,
            });

            navigation.navigate('Scoreboard');
            return;
        }

        const mt = maxTarget >= 1 ? maxTarget : 20;
        startAroundTheClock(selectedPlayerIds, mt);
        navigation.navigate('AroundTheClock');
    };

    const clearSelection = () => setSelectedPlayerIds([]);

    const playerLabel = (id: string) => {
        const p = players.find(x => x.id === id);
        if (!p) return id;
        const emoji = p.flag ? getFlagEmoji(p.flag) : '';
        return `${emoji ? emoji + ' ' : ''}${p.name}${p.nickname ? ` (${p.nickname})` : ''}`;
    };

    const flagLine = (code?: string) => {
        if (!code) return '—';
        const emoji = getFlagEmoji(code);
        const name = getCountryName(code) ?? code;
        return `${emoji} ${name}`;
    };

    return (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>New Game</Text>

            <Text style={{ fontWeight: '600' }}>Game mode</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <AppButton
                    label={gameMode === 'X01' ? '✅ X01' : 'X01'}
                    onPress={() => {
                        setGameMode('X01');
                        clearSelection();
                    }}
                />
                <AppButton
                    label={gameMode === 'AROUND_THE_CLOCK' ? '✅ Around the Clock' : 'Around the Clock'}
                    onPress={() => {
                        setGameMode('AROUND_THE_CLOCK');
                        clearSelection();
                    }}
                />
            </View>

            {gameMode === null && (
                <Text style={{ opacity: 0.7, marginTop: 6 }}>
                    Choose a game mode to enable Start.
                </Text>
            )}

            <View style={{ marginTop: 8 }}>
                <Text style={{ fontWeight: '600' }}>
                    Select players (up to {maxSelectablePlayers})
                </Text>

                {activePlayers.length === 0 ? (
                    <View style={{ gap: 8, marginTop: 8 }}>
                        <Text>No players yet.</Text>
                        <AppButton label="Add a player" onPress={() => navigation.navigate('Players')} />
                    </View>
                ) : (
                    <View style={{ gap: 8, marginTop: 8 }}>
                        {activePlayers.map(p => {
                            const selected = selectedPlayerIds.includes(p.id);
                            const emoji = p.flag ? getFlagEmoji(p.flag) : '';
                            return (
                                <Pressable
                                    key={p.id}
                                    onPress={() => toggleSelect(p.id)}
                                    style={{
                                        borderWidth: 1,
                                        borderRadius: 10,
                                        padding: 12,
                                        opacity: selected ? 1 : 0.75,
                                    }}
                                >
                                    <Text style={{ fontWeight: '700' }}>
                                        {selected ? '✅ ' : ''}
                                        {emoji ? `${emoji} ` : ''}
                                        {p.name}{p.nickname ? ` (${p.nickname})` : ''}
                                    </Text>
                                    <Text style={{ opacity: 0.8 }}>
                                        {p.flag ? `Flag: ${flagLine(p.flag)}` : 'Flag: —'}
                                    </Text>
                                </Pressable>
                            );
                        })}

                        <AppButton label="+ Add new player" onPress={() => navigation.navigate('Players')} />

                        {selectedPlayerIds.length > 0 && (
                            <View style={{ marginTop: 6 }}>
                                <Text style={{ opacity: 0.8 }}>
                                    Selected: {selectedPlayerIds.map(playerLabel).join(', ')}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>

            {gameMode === 'X01' && (
                <View style={{ marginTop: 16, gap: 12 }}>
                    <Text style={{ fontWeight: '600' }}>Start score</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <AppButton label="301" onPress={() => setStartScore(301)} />
                        <AppButton label="501" onPress={() => setStartScore(501)} />
                        <AppButton label="701" onPress={() => setStartScore(701)} />
                    </View>

                    <Text style={{ opacity: 0.8 }}>Custom start score</Text>
                    <TextInput
                        value={String(startScore)}
                        onChangeText={(t) => setStartScore(Number(t.replace(/[^0-9]/g, '')) || 0)}
                        keyboardType="numeric"
                        style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
                    />

                    <Text style={{ fontWeight: '600' }}>Match format</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <AppButton label="Single leg" onPress={() => setFormatType('single')} />
                        <AppButton label="Best of N legs" onPress={() => setFormatType('bestOf')} />
                    </View>

                    {formatType === 'bestOf' && (
                        <View style={{ gap: 8 }}>
                            <Text style={{ opacity: 0.8 }}>Best of (odd number recommended)</Text>
                            <TextInput
                                value={String(bestOfLegs)}
                                onChangeText={(t) => setBestOfLegs(Number(t.replace(/[^0-9]/g, '')) || 1)}
                                keyboardType="numeric"
                                style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
                            />
                            <Text style={{ opacity: 0.8 }}>
                                Will use: {normalizeBestOfLegs(bestOfLegs)} (first to{' '}
                                {Math.floor(normalizeBestOfLegs(bestOfLegs) / 2) + 1})
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {gameMode === 'AROUND_THE_CLOCK' && (
                <View style={{ marginTop: 16, gap: 8 }}>
                    <Text style={{ fontWeight: '600' }}>Around the Clock settings</Text>
                    <Text style={{ opacity: 0.8 }}>Max target (usually 20)</Text>
                    <TextInput
                        value={String(maxTarget)}
                        onChangeText={(t) => setMaxTarget(Number(t.replace(/[^0-9]/g, '')) || 20)}
                        keyboardType="numeric"
                        style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
                    />
                </View>
            )}

            <View style={{ marginTop: 20, gap: 8 }}>
                <AppButton label="Start" onPress={onStart} disabled={!canStart} />
                <AppButton label="Back to Home" onPress={() => navigation.navigate('Home')} />
            </View>
        </ScrollView>
    );
}
