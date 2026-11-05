import { useAppAlert } from '../theme/useAppAlert';
import { useMemo as useThemeMemo } from 'react';
import { useAppTheme } from '../theme/useAppTheme';
import { ThemeTokens } from '../theme/themes';
import Text from '../theme/ThemedText';
import ThemedCard from '../theme/ThemedCard';
// src/screens/AroundTheClockScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import {
    getAverageDartsPerNumber,
    getCompletedTargetCount,
} from '../engine/aroundTheClock';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'AroundTheClock'>;

export default function AroundTheClockScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    const showAlert = useAppAlert();
    const playerIds = useGameStore(s => s.aroundTheClockPlayerIds);
    const statesByPlayer = useGameStore(s => s.aroundTheClockStatesByPlayer);
    const currentIndex = useGameStore(s => s.aroundTheClockCurrentPlayerIndex);
    const dartInTurn = useGameStore(s => s.aroundTheClockDartInTurn);
    const winnerPlayerId = useGameStore(s => s.aroundTheClockWinnerPlayerId);
    const canUndo = useGameStore(s => s.aroundTheClockUndoStack.length > 0);

    const registerAroundTheClockDart = useGameStore(s => s.registerAroundTheClockDart);
    const undoAroundTheClockDart = useGameStore(s => s.undoAroundTheClockDart);
    const resetAroundTheClock = useGameStore(s => s.resetAroundTheClock);
    const players = useGameStore(s => s.players);

    const getPlayerName = (id: string) => players.find(p => p.id === id)?.name ?? id;

    const isActive = playerIds.length > 0 && !winnerPlayerId;
    const allowRemoveRef = useRef(false);

    const confirmExit = useCallback(() => {
        showAlert(
            'Exit session?',
            'You will lose the current in-progress session.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Exit',
                    style: 'destructive',
                    onPress: () => {
                        allowRemoveRef.current = true;
                        resetAroundTheClock();
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    },
                },
            ]
        );
    }, [resetAroundTheClock, navigation, showAlert]);

    useLayoutEffect(() => {
        if (!isActive) {
            navigation.setOptions({ headerRight: () => null });
            return;
        }

        navigation.setOptions({
            headerLeft: () => null,
            headerRight: () => (
                <Pressable onPress={confirmExit} style={styles.headerAction}>
                    <Text style={styles.headerActionText}>Exit</Text>
                </Pressable>
            ),
            gestureEnabled: false,
        });
    }, [navigation, isActive, confirmExit, styles]);

    useEffect(() => {
        if (!isActive) return;

        const unsubscribe = navigation.addListener('beforeRemove', event => {
            if (allowRemoveRef.current) return;
            event.preventDefault();
            confirmExit();
        });

        return unsubscribe;
    }, [navigation, isActive, confirmExit, styles]);

    useEffect(() => {
        if (!winnerPlayerId) return;
        allowRemoveRef.current = true;
        navigation.replace('AroundTheClockSummary');
    }, [winnerPlayerId, navigation]);

    if (playerIds.length === 0) {
        return (
            <View style={styles.centered}>
                <Text>No active session.</Text>
                <AppButton label="Back to Home" onPress={() => navigation.navigate('Home')} />
            </View>
        );
    }

    const safeCurrentIndex = Math.min(currentIndex, playerIds.length - 1);
    const currentPlayerId = playerIds[safeCurrentIndex];
    const currentState = statesByPlayer[currentPlayerId];

    if (!currentState) {
        return (
            <View style={styles.centered}>
                <Text>Loading session...</Text>
            </View>
        );
    }

    const completedTargets = getCompletedTargetCount(currentState);
    const average = getAverageDartsPerNumber(currentState).toFixed(2);
    const targets = Array.from({ length: currentState.maxTarget }, (_, index) => index + 1);

    return (
        <ScrollView contentContainerStyle={styles.screen}>
            <View style={styles.headingRow}>
                <View style={styles.headingCopy}>
                    <Text style={styles.title}>Around the Clock</Text>
                    <Text style={styles.subtitle}>
                        Throwing: <Text style={styles.strong}>{getPlayerName(currentPlayerId)}</Text>
                    </Text>
                </View>
                <View style={styles.dartBadge}>
                    <Text style={styles.dartBadgeLabel}>Dart</Text>
                    <Text style={styles.dartBadgeValue}>{dartInTurn + 1}/3</Text>
                </View>
            </View>

            <View style={styles.targetCard}>
                <Text style={styles.targetLabel}>Current target</Text>
                <Text style={styles.targetValue}>{currentState.currentTarget}</Text>
                <Text style={styles.targetMeta}>
                    {completedTargets} of {currentState.maxTarget} completed
                </Text>
            </View>

            <View style={styles.gridCard}>
                <Text style={styles.sectionTitle}>Targets</Text>
                <View style={styles.targetGrid}>
                    {targets.map(target => {
                        const isCompleted = currentState.isFinished || target <= completedTargets;
                        const isCurrent = !currentState.isFinished && target === currentState.currentTarget;

                        return (
                            <View
                                key={target}
                                style={[
                                    styles.targetTile,
                                    isCompleted && styles.targetTileCompleted,
                                    isCurrent && styles.targetTileCurrent,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.targetTileText,
                                        isCompleted && styles.targetTileTextCompleted,
                                        isCurrent && styles.targetTileTextActive,
                                    ]}
                                >
                                    {target}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            </View>

            <View style={styles.statsRow}>
                <Stat label="Darts" value={String(currentState.dartsThrown)} />
                <Stat label="Best streak" value={String(currentState.bestStreak)} />
                <Stat label="Avg / number" value={average} />
            </View>

            <View style={styles.actions}>
                <AppButton label="Hit" onPress={() => registerAroundTheClockDart(true)} />
                <AppButton
                    label="Miss"
                    variant="secondary"
                    onPress={() => registerAroundTheClockDart(false)}
                />
                <AppButton
                    label="Undo last dart"
                    variant="ghost"
                    disabled={!canUndo}
                    onPress={undoAroundTheClockDart}
                />
            </View>

            <View style={styles.playersCard}>
                <Text style={styles.sectionTitle}>Player progress</Text>
                {playerIds.map((playerId, index) => {
                    const state = statesByPlayer[playerId];
                    if (!state) return null;

                    const completed = getCompletedTargetCount(state);
                    const isCurrent = index === safeCurrentIndex;

                    return (
                        <View
                            key={playerId}
                            style={[styles.playerRow, isCurrent && styles.playerRowCurrent]}
                        >
                            <View style={styles.playerCopy}>
                                <Text style={styles.playerName}>{getPlayerName(playerId)}</Text>
                                <Text style={styles.playerMeta}>
                                    {state.isFinished
                                        ? 'Finished'
                                        : `Target ${state.currentTarget} · ${state.dartsThrown} darts`}
                                </Text>
                            </View>
                            <Text style={[styles.playerProgress, isCurrent && styles.playerProgressCurrent]}>
                                {completed}/{state.maxTarget}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    return (
        <ThemedCard style={styles.statCard}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </ThemedCard>
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
    headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headingCopy: { flex: 1, gap: 3 },
    title: { fontSize: 24, fontWeight: '800' },
    subtitle: { color: theme.muted },
    strong: { color: theme.foreground, fontWeight: '800' },
    dartBadge: {
        minWidth: 66,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        alignItems: 'center',
        backgroundColor: theme.surfaceRaised,
    },
    dartBadgeLabel: { color: theme.muted, fontSize: 11, fontWeight: '700' },
    dartBadgeValue: { color: theme.foreground, fontSize: 18, fontWeight: '900' },
    targetCard: {
        borderRadius: 18,
        padding: 18,
        alignItems: 'center',
        backgroundColor: theme.accent,
    },
    targetLabel: { color: theme.onAccent, fontWeight: '700' },
    targetValue: { color: theme.onAccent, fontSize: 54, lineHeight: 60, fontWeight: '900' },
    targetMeta: { color: theme.onAccent, fontWeight: '700' },
    gridCard: { borderRadius: 16, padding: 14, gap: 12, backgroundColor: theme.surface },
    sectionTitle: { fontSize: 16, fontWeight: '800' },
    targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    targetTile: {
        width: '22%',
        aspectRatio: 1.35,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.surfaceRaised,
    },
    targetTileCompleted: { backgroundColor: theme.success, borderColor: theme.success },
    targetTileCurrent: { backgroundColor: theme.accent, borderColor: theme.accent },
    targetTileText: { fontWeight: '800', color: theme.muted },
    targetTileTextCompleted: { color: theme.onSuccess },
    targetTileTextActive: { color: theme.onAccent },
    statsRow: { flexDirection: 'row', gap: 8 },
    statCard: { flex: 1, borderRadius: 14, padding: 12, backgroundColor: theme.surface },
    statLabel: { fontSize: 11, color: theme.muted, fontWeight: '700' },
    statValue: { marginTop: 3, fontSize: 20, fontWeight: '900' },
    actions: { gap: 8 },
    playersCard: { borderRadius: 16, padding: 14, gap: 9, backgroundColor: theme.surface },
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 11,
    },
    playerRowCurrent: { borderColor: theme.accent, backgroundColor: theme.selectedSurface },
    playerCopy: { flex: 1 },
    playerName: { fontWeight: '800' },
    playerMeta: { marginTop: 2, color: theme.muted },
    playerProgress: { fontSize: 18, fontWeight: '900' },
    playerProgressCurrent: { color: theme.accent },
});
