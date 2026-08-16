// src/screens/AroundTheClockDetailScreen.tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'AroundTheClockDetail'>;

export default function AroundTheClockDetailScreen({ route, navigation }: Props) {
    const { sessionId } = route.params;
    const session = useGameStore(s =>
        s.aroundTheClockSessions.find(item => item.id === sessionId)
    );
    const players = useGameStore(s => s.players);

    const playerName = (playerId: string) =>
        players.find(player => player.id === playerId)?.name ?? 'Unknown player';

    if (!session) {
        return (
            <View style={styles.centered}>
                <Text>Practice session not found.</Text>
                <AppButton label="Back to History" onPress={() => navigation.navigate('History')} />
            </View>
        );
    }

    const winnerName = session.winnerPlayerId
        ? playerName(session.winnerPlayerId)
        : '—';
    const durationSeconds = Math.max(
        0,
        Math.round(
            (new Date(session.finishedAt).getTime() - new Date(session.createdAt).getTime()) / 1000
        )
    );

    return (
        <ScrollView contentContainerStyle={styles.screen}>
            <View style={styles.hero}>
                <Text style={styles.mode}>Around the Clock</Text>
                <Text style={styles.winner}>{winnerName}</Text>
                <Text style={styles.heroMeta}>Winner · 1–{session.maxTarget}</Text>
            </View>

            <View style={styles.metaCard}>
                <MetaRow label="Started" value={new Date(session.createdAt).toLocaleString()} />
                <MetaRow label="Finished" value={new Date(session.finishedAt).toLocaleString()} />
                <MetaRow label="Duration" value={formatDuration(durationSeconds)} />
                <MetaRow label="Players" value={String(session.playerIds.length)} />
            </View>

            <Text style={styles.sectionTitle}>Player results</Text>

            {session.playerIds.map(playerId => {
                const result = session.results.find(item => item.playerId === playerId);
                if (!result) return null;

                const average = result.targetReached > 0
                    ? (result.dartsThrown / result.targetReached).toFixed(2)
                    : '0.00';
                const targets = Array.from(
                    { length: session.maxTarget },
                    (_, index) => index + 1
                );

                return (
                    <View key={playerId} style={styles.resultCard}>
                        <View style={styles.resultHeader}>
                            <View style={styles.resultCopy}>
                                <Text style={styles.playerName}>{playerName(playerId)}</Text>
                                <Text style={result.completed ? styles.finished : styles.notFinished}>
                                    {result.completed ? 'Finished' : 'Not finished'}
                                </Text>
                            </View>
                            <Text style={styles.reached}>
                                {result.targetReached}/{session.maxTarget}
                            </Text>
                        </View>

                        <View style={styles.statRow}>
                            <DetailStat label="Darts" value={String(result.dartsThrown)} />
                            <DetailStat label="Best streak" value={String(result.bestStreak)} />
                            <DetailStat label="Avg / number" value={average} />
                        </View>

                        <Text style={styles.gridLabel}>Targets reached</Text>
                        <View style={styles.grid}>
                            {targets.map(target => {
                                const reached = target <= result.targetReached;
                                const hitCount = result.hitsByNumber[target] ?? 0;

                                return (
                                    <View
                                        key={target}
                                        style={[styles.tile, reached && styles.tileReached]}
                                    >
                                        <Text style={[styles.tileNumber, reached && styles.tileNumberReached]}>
                                            {target}
                                        </Text>
                                        {hitCount > 1 && (
                                            <Text style={styles.hitCount}>×{hitCount}</Text>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                );
            })}
        </ScrollView>
    );
}

function MetaRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{label}</Text>
            <Text style={styles.metaValue}>{value}</Text>
        </View>
    );
}

function DetailStat({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    );
}

function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

const styles = StyleSheet.create({
    screen: { flexGrow: 1, padding: 16, gap: 14, backgroundColor: '#F5F5F7' },
    centered: {
        flex: 1,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    hero: { borderRadius: 20, padding: 20, alignItems: 'center', backgroundColor: '#111' },
    mode: { color: '#C7C8CB', fontWeight: '700' },
    winner: { marginTop: 5, color: '#FFF', fontSize: 30, fontWeight: '900' },
    heroMeta: { marginTop: 3, color: '#E7E7E7' },
    metaCard: { borderRadius: 15, padding: 14, gap: 9, backgroundColor: '#FFF' },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start' },
    metaLabel: { width: 76, color: '#666', fontWeight: '700' },
    metaValue: { flex: 1, textAlign: 'right', fontWeight: '700' },
    sectionTitle: { fontSize: 17, fontWeight: '900' },
    resultCard: { borderRadius: 16, padding: 14, gap: 12, backgroundColor: '#FFF' },
    resultHeader: { flexDirection: 'row', alignItems: 'center' },
    resultCopy: { flex: 1 },
    playerName: { fontSize: 17, fontWeight: '900' },
    finished: { marginTop: 2, color: '#16794A', fontWeight: '800' },
    notFinished: { marginTop: 2, color: '#666', fontWeight: '700' },
    reached: { fontSize: 22, fontWeight: '900' },
    statRow: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, borderRadius: 11, padding: 9, backgroundColor: '#F3F3F5' },
    statLabel: { fontSize: 10, color: '#666', fontWeight: '700' },
    statValue: { marginTop: 3, fontSize: 16, fontWeight: '900' },
    gridLabel: { marginTop: 2, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    tile: {
        width: '22%',
        aspectRatio: 1.25,
        borderWidth: 1,
        borderColor: '#D8DADF',
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F7F7F8',
    },
    tileReached: { borderColor: '#1D7A4A', backgroundColor: '#1D7A4A' },
    tileNumber: { color: '#555', fontWeight: '900' },
    tileNumberReached: { color: '#FFF' },
    hitCount: { marginTop: 1, color: '#FFF', fontSize: 9, fontWeight: '800' },
});
