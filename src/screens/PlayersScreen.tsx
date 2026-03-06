import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from "../components/AppButton";
import { getFlagEmoji, getCountryName } from '../utils/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'Players'>;

const TEXT = '#111111';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const BLUE = '#0A84FF';

export default function PlayersScreen({ navigation }: Props) {
    const players = useGameStore(s => s.players);
    const togglePlayerHidden = useGameStore(s => s.togglePlayerHidden);

    const visiblePlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

    const flagLine = (code?: string) => {
        if (!code) return '—';
        const emoji = getFlagEmoji(code);
        const name = getCountryName(code) ?? code;
        return `${emoji} ${name} (${code})`;
    };

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>Players</Text>

            <AppButton label="Add player" onPress={() => navigation.navigate('PlayerForm')} />

            <FlatList
                data={visiblePlayers}
                keyExtractor={(p) => p.id}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => navigation.navigate('PlayerStats', { playerId: item.id })}
                        style={({ pressed }) => [
                            styles.card,
                            pressed && { opacity: 0.92 },
                        ]}
                    >
                        <Text style={styles.name}>
                            {item.flag ? `${getFlagEmoji(item.flag)} ` : ''}
                            {item.name} {item.nickname ? `(${item.nickname})` : ''}
                        </Text>

                        <Text style={styles.meta}>
                            Flag: {flagLine(item.flag)} | Status: {item.isHidden ? 'Hidden' : 'Active'}
                        </Text>

                        <View style={styles.actions}>
                            <Pressable
                                onPress={() => navigation.navigate('PlayerStats', { playerId: item.id })}
                                style={({ pressed }) => [styles.button, styles.blueButton, pressed && { opacity: 0.9 }]}
                            >
                                <Text style={styles.blueButtonText}>Stats</Text>
                            </Pressable>

                            <Pressable
                                onPress={() => navigation.navigate('PlayerForm', { playerId: item.id })}
                                style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]}
                            >
                                <Text style={styles.buttonText}>Edit</Text>
                            </Pressable>

                            <Pressable
                                onPress={() => togglePlayerHidden(item.id)}
                                style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]}
                            >
                                <Text style={styles.buttonText}>{item.isHidden ? 'Unhide' : 'Hide'}</Text>
                            </Pressable>
                        </View>
                    </Pressable>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        padding: 12,
        gap: 8,
        backgroundColor: '#fff',
    },
    name: {
        fontSize: 16,
        fontWeight: '800',
        color: TEXT,
    },
    meta: {
        opacity: 0.8,
        color: MUTED,
    },
    actions: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 999,
        backgroundColor: '#fff',
    },
    buttonText: {
        color: TEXT,
        fontWeight: '700',
    },
    blueButton: {
        borderColor: BLUE,
        backgroundColor: BLUE,
    },
    blueButtonText: {
        color: '#fff',
        fontWeight: '800',
    },
});