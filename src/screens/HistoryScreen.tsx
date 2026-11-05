import { useAppAlert } from '../theme/useAppAlert';
import { useMemo as useThemeMemo } from 'react';
import { useAppTheme } from '../theme/useAppTheme';
import { ThemeTokens } from '../theme/themes';
import Text from '../theme/ThemedText';
import ThemedCard from '../theme/ThemedCard';
import React, { useMemo, useState } from 'react';
import { View, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { MatchStatus } from '../types/domain';
import { getMatchWinnerId } from '../utils/stats';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

type ModeFilter = 'ALL' | 'X01' | 'PRACTICE';
type StatusFilter = MatchStatus | 'ALL';
type PlayerFilter = 'ALL' | string;

type HistoryItem =
    | { kind: 'match'; id: string; date: string }
    | { kind: 'practice'; id: string; date: string };

const STATUS_LABELS: Record<StatusFilter, string> = {
    COMPLETED: 'Completed',
    IN_PROGRESS: 'In progress',
    ABANDONED: 'Abandoned',
    ALL: 'All statuses',
};

export default function HistoryScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    const showAlert = useAppAlert();
    const matches = useGameStore(s => s.matches);
    const players = useGameStore(s => s.players);
    const aroundTheClockSessions = useGameStore(s => s.aroundTheClockSessions);
    const currentMatch = useGameStore(s => s.currentMatch);
    const currentLegState = useGameStore(s => s.currentLegState);
    const currentLegId = useGameStore(s => s.currentLegId);
    const startMatch = useGameStore(s => s.startMatch);
    const deleteMatch = useGameStore(s => s.deleteMatch);

    const activePlayers = useMemo(
        () => players.filter(p => !p.isHidden).sort((a, b) => a.name.localeCompare(b.name)),
        [players]
    );

    const [mode, setMode] = useState<ModeFilter>('ALL');
    const [status, setStatus] = useState<StatusFilter>('COMPLETED');
    const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('ALL');

    const playerName = (id: string) => players.find(p => p.id === id)?.name ?? 'Unknown';

    const items = useMemo(() => {
        const list: HistoryItem[] = [];

        if (mode === 'ALL' || mode === 'X01') {
            for (const match of matches) {
                if (status !== 'ALL' && match.status !== status) continue;

                list.push({
                    kind: 'match',
                    id: match.id,
                    date: match.finishedAt ?? match.abandonedAt ?? match.createdAt,
                });
            }
        }

        // Completed practice sessions belong in the completed/all views only.
        if (
            (mode === 'ALL' || mode === 'PRACTICE') &&
            (status === 'COMPLETED' || status === 'ALL')
        ) {
            for (const session of aroundTheClockSessions) {
                list.push({ kind: 'practice', id: session.id, date: session.finishedAt });
            }
        }

        const filtered = list.filter(item => {
            if (playerFilter === 'ALL') return true;

            if (item.kind === 'match') {
                const match = matches.find(m => m.id === item.id);
                return match?.playerIds.includes(playerFilter) ?? false;
            }

            const session = aroundTheClockSessions.find(s => s.id === item.id);
            return session?.playerIds.includes(playerFilter) ?? false;
        });

        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return filtered;
    }, [mode, status, playerFilter, matches, aroundTheClockSessions]);

    const restartMatch = (matchId: string) => {
        const match = matches.find(m => m.id === matchId);
        if (!match) return;

        startMatch({
            playerIds: match.playerIds,
            startScore: match.startScore,
            bestOfLegs: match.bestOfLegs,
        });
        navigation.navigate('Scoreboard');
    };

    const confirmDelete = (matchId: string) => {
        showAlert(
            'Delete match?',
            'This removes the match permanently from history.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteMatch(matchId),
                },
            ]
        );
    };

    return (
        <View style={styles.screen}>
            <Text style={styles.title}>History</Text>

            <Text style={styles.filterLabel}>Game type</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.chipRow}
            >
                {(['ALL', 'X01', 'PRACTICE'] as ModeFilter[]).map(value => (
                    <FilterChip
                        key={value}
                        label={value === 'ALL' ? 'All' : value === 'PRACTICE' ? 'Practice' : 'X01'}
                        selected={mode === value}
                        onPress={() => setMode(value)}
                    />
                ))}
            </ScrollView>

            <Text style={styles.filterLabel}>Status</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.chipRow}
            >
                {(['COMPLETED', 'IN_PROGRESS', 'ABANDONED', 'ALL'] as StatusFilter[]).map(value => (
                    <FilterChip
                        key={value}
                        label={STATUS_LABELS[value]}
                        selected={status === value}
                        onPress={() => setStatus(value)}
                    />
                ))}
            </ScrollView>

            <Text style={styles.filterLabel}>Player</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.chipRow}
            >
                <FilterChip
                    label="All players"
                    selected={playerFilter === 'ALL'}
                    onPress={() => setPlayerFilter('ALL')}
                />

                {activePlayers.map(player => (
                    <FilterChip
                        key={player.id}
                        label={player.name}
                        selected={playerFilter === player.id}
                        onPress={() => setPlayerFilter(player.id)}
                    />
                ))}
            </ScrollView>

            <FlatList
                style={styles.list}
                data={items}
                keyExtractor={item => `${item.kind}:${item.id}`}
                contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>No sessions match these filters.</Text>
                }
                renderItem={({ item }) => {
                    if (item.kind === 'practice') {
                        const session = aroundTheClockSessions.find(s => s.id === item.id);
                        if (!session) return null;

                        const winnerName = session.winnerPlayerId
                            ? playerName(session.winnerPlayerId)
                            : '—';
                        const totalDarts = session.results.reduce(
                            (sum, result) => sum + result.dartsThrown,
                            0
                        );
                        const playersText = session.playerIds.map(playerName).join(', ') || '—';

                        return (
                            <ThemedCard style={styles.card}>
                                <Text style={styles.cardDate}>
                                    {new Date(session.finishedAt).toLocaleString()}
                                </Text>
                                <Text style={styles.statusCompleted}>Completed practice</Text>
                                <Text>Around the Clock · 1–{session.maxTarget}</Text>
                                <Text>Players: {playersText}</Text>
                                <Text>Winner: {winnerName}</Text>
                                <Text>Total darts: {totalDarts}</Text>

                                <View style={styles.actionRow}>
                                    <ActionButton
                                        label="View details"
                                        onPress={() => navigation.navigate(
                                            'AroundTheClockDetail',
                                            { sessionId: session.id }
                                        )}
                                    />
                                </View>
                            </ThemedCard>
                        );
                    }

                    const match = matches.find(m => m.id === item.id);
                    if (!match) return null;

                    const playersText = match.playerIds.map(playerName).join(' vs ');
                    const winnerId = getMatchWinnerId(match);
                    const canResume =
                        match.status === 'IN_PROGRESS' &&
                        currentMatch?.id === match.id &&
                        Boolean(currentLegState && currentLegId);

                    return (
                        <ThemedCard style={styles.card}>
                            <Text style={styles.cardDate}>
                                {new Date(item.date).toLocaleString()}
                            </Text>
                            <StatusText status={match.status} />
                            <Text>Mode: X01 ({match.startScore})</Text>
                            <Text>Players: {playersText}</Text>
                            <Text>Format: Best of {match.bestOfLegs ?? 1} legs</Text>
                            <Text>Legs recorded: {match.legs.length}</Text>

                            {match.status === 'COMPLETED' && (
                                <Text>Winner: {winnerId ? playerName(winnerId) : '—'}</Text>
                            )}

                            {match.status === 'IN_PROGRESS' && !canResume && (
                                <Text style={styles.warningText}>
                                    Resume data is unavailable for this entry.
                                </Text>
                            )}

                            <View style={styles.actionRow}>
                                {match.status === 'COMPLETED' && (
                                    <ActionButton
                                        label="View details"
                                        onPress={() => navigation.navigate('MatchDetail', { matchId: match.id })}
                                    />
                                )}

                                {match.status === 'IN_PROGRESS' && canResume && (
                                    <ActionButton
                                        label="Resume"
                                        primary
                                        onPress={() => navigation.navigate('Scoreboard')}
                                    />
                                )}

                                {match.status === 'ABANDONED' && (
                                    <>
                                        {match.legs.length > 0 && (
                                            <ActionButton
                                                label="View details"
                                                onPress={() => navigation.navigate('MatchDetail', { matchId: match.id })}
                                            />
                                        )}
                                        <ActionButton
                                            label="Restart"
                                            primary
                                            onPress={() => restartMatch(match.id)}
                                        />
                                        <ActionButton
                                            label="Delete"
                                            destructive
                                            onPress={() => confirmDelete(match.id)}
                                        />
                                    </>
                                )}
                            </View>
                        </ThemedCard>
                    );
                }}
            />
        </View>
    );
}

function FilterChip(props: { label: string; selected: boolean; onPress: () => void }) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    return (
        <Pressable
            onPress={props.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: props.selected }}
            style={({ pressed }) => [
                styles.chip,
                props.selected && styles.chipSelected,
                pressed && { opacity: 0.85 },
            ]}
        >
            <Text numberOfLines={1} style={[styles.chipText, props.selected && styles.chipTextSelected]}>
                {props.label}
            </Text>
        </Pressable>
    );
}

function StatusText({ status }: { status: MatchStatus }) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    const style =
        status === 'COMPLETED'
            ? styles.statusCompleted
            : status === 'IN_PROGRESS'
                ? styles.statusInProgress
                : styles.statusAbandoned;

    return <Text style={style}>{STATUS_LABELS[status]}</Text>;
}

function ActionButton(props: {
    label: string;
    onPress: () => void;
    primary?: boolean;
    destructive?: boolean;
}) {
    const theme = useAppTheme();
    const styles = useThemeMemo(() => createStyles(theme), [theme]);
    return (
        <Pressable
            onPress={props.onPress}
            style={({ pressed }) => [
                styles.actionButton,
                props.primary && styles.actionPrimary,
                props.destructive && styles.actionDestructive,
                pressed && { opacity: 0.85 },
            ]}
        >
            <Text
                style={[
                    styles.actionText,
                    props.primary && styles.actionTextFilled,
                    props.destructive && { color: theme.onDanger },
                ]}
            >
                {props.label}
            </Text>
        </Pressable>
    );
}

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
    screen: { flex: 1, padding: 16, gap: 8 },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    filterLabel: { fontSize: 12, fontWeight: '700', color: theme.muted, marginTop: 4 },
    // Horizontal filter viewports must not consume the list's vertical space.
    filterScroll: { flexGrow: 0, flexShrink: 0 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    list: { flex: 1 },
    chip: { borderColor: theme.border,
        alignSelf: 'center',
        flexShrink: 0,
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.surface,
    },
    chipSelected: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipText: { fontWeight: '700' },
    chipTextSelected: { color: theme.onAccent },
    card: { borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4, backgroundColor: theme.surface },
    cardDate: { fontWeight: '700' },
    statusCompleted: { color: theme.success, fontWeight: '800' },
    statusInProgress: { color: theme.accent, fontWeight: '800' },
    statusAbandoned: { color: theme.warning, fontWeight: '800' },
    warningText: { marginTop: 4, color: theme.muted },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    actionButton: { borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.surface,
    },
    actionPrimary: { backgroundColor: theme.accent, borderColor: theme.accent },
    actionDestructive: { backgroundColor: theme.danger, borderColor: theme.danger },
    actionText: { fontWeight: '800' },
    actionTextFilled: { color: theme.onAccent },
    emptyList: { flexGrow: 1, justifyContent: 'center' },
    emptyText: { textAlign: 'center', color: theme.muted },
});
