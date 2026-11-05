import { useMemo as useThemeMemo } from 'react';
import { useAppTheme } from '../theme/useAppTheme';
import { ThemeTokens } from '../theme/themes';
import Text from '../theme/ThemedText';
import ThemedCard from '../theme/ThemedCard';
import React from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from "../components/AppButton";
import { getFlagEmoji, getCountryName } from '../utils/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'Players'>;


export default function PlayersScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
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
        <View style={{ flex: 1, backgroundColor: theme.background, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.foreground }}>Players</Text>

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

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
    card: {
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 12,
        gap: 8,
        backgroundColor: theme.surface,
    },
    name: {
        fontSize: 16,
        fontWeight: '800',
        color: theme.foreground,
    },
    meta: {
        color: theme.muted,
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
        borderColor: theme.border,
        borderRadius: 999,
        backgroundColor: theme.surface,
    },
    buttonText: {
        color: theme.foreground,
        fontWeight: '700',
    },
    blueButton: {
        borderColor: theme.accent,
        backgroundColor: theme.accent,
    },
    blueButtonText: {
        color: theme.onAccent,
        fontWeight: '800',
    },
});
