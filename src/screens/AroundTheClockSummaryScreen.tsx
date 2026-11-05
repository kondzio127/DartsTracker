import { useMemo as useThemeMemo } from 'react';
import { useAppTheme } from '../theme/useAppTheme';
import { ThemeTokens } from '../theme/themes';
import Text from '../theme/ThemedText';
import ThemedCard from '../theme/ThemedCard';
// src/screens/AroundTheClockSummaryScreen.tsx
import React, { useCallback, useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import {
    getAverageDartsPerNumber,
    getCompletedTargetCount,
} from '../engine/aroundTheClock';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'AroundTheClockSummary'>;

export default function AroundTheClockSummaryScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    const playerIds = useGameStore(s => s.aroundTheClockPlayerIds);
    const statesByPlayer = useGameStore(s => s.aroundTheClockStatesByPlayer);
    const winnerPlayerId = useGameStore(s => s.aroundTheClockWinnerPlayerId);
    const canUndo = useGameStore(s => s.aroundTheClockUndoStack.length > 0);

    const startAroundTheClock = useGameStore(s => s.startAroundTheClock);
    const undoAroundTheClockDart = useGameStore(s => s.undoAroundTheClockDart);
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

    const handleUndoWinningDart = useCallback(() => {
        undoAroundTheClockDart();
        navigation.replace('AroundTheClock');
    }, [undoAroundTheClockDart, navigation]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: () => null,
            headerRight: () => (
                <Pressable onPress={handleDone} style={styles.headerAction}>
                    <Text style={styles.headerActionText}>Done</Text>
                </Pressable>
            ),
            gestureEnabled: false,
        });
    }, [navigation, handleDone, styles]);

    if (playerIds.length === 0) {
        return (
            <View style={styles.centered}>
                <Text>No session found.</Text>
                <AppButton label="Done" onPress={handleDone} />
            </View>
        );
    }

    const firstState = statesByPlayer[playerIds[0]];
    const maxTarget = firstState?.maxTarget ?? 20;
    const winnerName = winnerPlayerId ? getPlayerName(winnerPlayerId) : '—';

    return (
        <ScrollView contentContainerStyle={styles.screen}>
            <View style={styles.hero}>
                <Text style={styles.eyebrow}>Around the Clock complete</Text>
                <Text style={styles.winner}>{winnerName}</Text>
                <Text style={styles.heroMeta}>Winner · Numbers 1–{maxTarget}</Text>
            </View>

            <Text style={styles.sectionTitle}>Per-player results</Text>

            {playerIds.map(playerId => {
                const state = statesByPlayer[playerId];
                if (!state) return null;

                const targetReached = getCompletedTargetCount(state);
                const average = getAverageDartsPerNumber(state).toFixed(2);

                return (
                    <ThemedCard key={playerId} style={styles.resultCard}>
                        <View style={styles.resultHeader}>
                            <View style={styles.resultCopy}>
                                <Text style={styles.playerName}>{getPlayerName(playerId)}</Text>
                                <Text style={state.isFinished ? styles.finished : styles.notFinished}>
                                    {state.isFinished ? 'Finished' : 'Not finished'}
                                </Text>
                            </View>
                            <Text style={styles.reached}>{targetReached}/{state.maxTarget}</Text>
                        </View>

                        <View style={styles.statRow}>
                            <SummaryStat label="Darts" value={String(state.dartsThrown)} />
                            <SummaryStat label="Best streak" value={String(state.bestStreak)} />
                            <SummaryStat label="Avg / number" value={average} />
                        </View>
                    </ThemedCard>
                );
            })}

            <View style={styles.actions}>
                {canUndo && (
                    <AppButton
                        label="Undo winning dart"
                        variant="secondary"
                        onPress={handleUndoWinningDart}
                    />
                )}
                <AppButton
                    label="Play again (same players)"
                    onPress={() => {
                        startAroundTheClock(playerIds, maxTarget);
                        navigation.replace('AroundTheClock');
                    }}
                />
                <AppButton label="Done" variant="ghost" onPress={handleDone} />
            </View>
        </ScrollView>
    );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    return (
        <View style={styles.stat}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    );
}

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
    screen: { flexGrow: 1, padding: 16, gap: 14, backgroundColor: theme.background },
    centered: {
        backgroundColor: theme.background,
        flex: 1,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    headerAction: { paddingHorizontal: 12, paddingVertical: 6 },
    headerActionText: { fontWeight: '700' },
    hero: { borderRadius: 20, padding: 20, alignItems: 'center', backgroundColor: theme.surfaceRaised },
    eyebrow: { color: theme.muted, fontWeight: '700' },
    winner: { marginTop: 5, color: theme.foreground, fontSize: 32, fontWeight: '900' },
    heroMeta: { marginTop: 3, color: theme.muted },
    sectionTitle: { marginTop: 4, fontSize: 17, fontWeight: '800' },
    resultCard: { borderRadius: 16, padding: 14, gap: 12, backgroundColor: theme.surface },
    resultHeader: { flexDirection: 'row', alignItems: 'center' },
    resultCopy: { flex: 1 },
    playerName: { fontSize: 17, fontWeight: '900' },
    finished: { marginTop: 2, color: theme.success, fontWeight: '800' },
    notFinished: { marginTop: 2, color: theme.muted, fontWeight: '700' },
    reached: { fontSize: 23, fontWeight: '900' },
    statRow: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, borderRadius: 12, padding: 10, backgroundColor: theme.surfaceRaised },
    statLabel: { fontSize: 10, color: theme.muted, fontWeight: '700' },
    statValue: { marginTop: 3, fontSize: 17, fontWeight: '900' },
    actions: { marginTop: 4, gap: 8 },
});
