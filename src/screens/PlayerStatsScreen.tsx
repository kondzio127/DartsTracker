// src/screens/PlayerStatsScreen.tsx

import React, { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import {
    getPlayerStatsByWindow,
    PlayerAggregatedStats,
    StatsWindowKey,
    DoubleTargetStat,
} from '../utils/stats';
import { getFlagEmoji, getCountryName } from '../utils/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerStats'>;

const TEXT = '#111111';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const BLUE = '#0A84FF';
const BG = '#F8FAFC';
const CARD = '#FFFFFF';

const WINDOW_LABELS: Record<StatsWindowKey, string> = {
    lastSession: 'Session',
    last7d: '7d',
    last30d: '30d',
    allTime: 'All',
};

function fmtAvg(value: number): string {
    return value.toFixed(1);
}

function fmtPct(value: number): string {
    return `${value.toFixed(1)}%`;
}

function fmtDelta(a: number, b: number, suffix = ''): string {
    const diff = a - b;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}${suffix}`;
}

function Pill(props: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    const { label, selected, onPress } = props;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.pill,
                selected && styles.pillSelected,
                pressed && { opacity: 0.9 },
            ]}
        >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
        </Pressable>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <Text style={styles.sectionTitle}>{children}</Text>;
}

function MetricRow(props: {
    label: string;
    value: string;
}) {
    const { label, value } = props;

    return (
        <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
        </View>
    );
}

function HighlightChip(props: { label: string; value: string | number }) {
    const { label, value } = props;

    return (
        <View style={styles.highlightChip}>
            <Text style={styles.highlightChipValue}>{value}</Text>
            <Text style={styles.highlightChipLabel}>{label}</Text>
        </View>
    );
}

function SummaryCard({ stats }: { stats: PlayerAggregatedStats }) {
    return (
        <View style={styles.card}>
            <SectionTitle>Summary</SectionTitle>

            <View style={styles.summaryGrid}>
                <View style={styles.bigStatCard}>
                    <Text style={styles.bigStatValue}>{fmtAvg(stats.averages.overall3Dart)}</Text>
                    <Text style={styles.bigStatLabel}>3-dart avg</Text>
                </View>

                <View style={styles.bigStatCard}>
                    <Text style={styles.bigStatValue}>{fmtAvg(stats.averages.first9)}</Text>
                    <Text style={styles.bigStatLabel}>First 9 avg</Text>
                </View>
            </View>

            <View style={styles.highlightRow}>
                <HighlightChip label="Matches" value={stats.matchesPlayed} />
                <HighlightChip label="Legs won" value={stats.legsWon} />
                <HighlightChip label="180s" value={stats.highlights.count180s} />
                <HighlightChip label="140+" value={stats.highlights.count140Plus} />
            </View>
        </View>
    );
}

function WinRateCard({ stats }: { stats: PlayerAggregatedStats }) {
    return (
        <View style={styles.card}>
            <SectionTitle>Leg win %</SectionTitle>

            <MetricRow
                label="Started"
                value={`${fmtPct(stats.legWinByStarting.startedPct)} (${stats.legWinByStarting.legsStartedWon}/${stats.legWinByStarting.legsStarted})`}
            />
            <MetricRow
                label="Didn’t start"
                value={`${fmtPct(stats.legWinByStarting.notStartedPct)} (${stats.legWinByStarting.legsNotStartedWon}/${stats.legWinByStarting.legsNotStarted})`}
            />
        </View>
    );
}

function CheckoutCard({ stats }: { stats: PlayerAggregatedStats }) {
    return (
        <View style={styles.card}>
            <SectionTitle>Checkouts</SectionTitle>

            <MetricRow
                label="Overall"
                value={`${fmtPct(stats.checkouts.overall.pct)} (${stats.checkouts.overall.hits}/${stats.checkouts.overall.attempts})`}
            />
            <MetricRow
                label="40–80"
                value={`${fmtPct(stats.checkouts.from40to80.pct)} (${stats.checkouts.from40to80.hits}/${stats.checkouts.from40to80.attempts})`}
            />
            <MetricRow
                label="81–120"
                value={`${fmtPct(stats.checkouts.from81to120.pct)} (${stats.checkouts.from81to120.hits}/${stats.checkouts.from81to120.attempts})`}
            />
            <MetricRow
                label="121–170"
                value={`${fmtPct(stats.checkouts.from121to170.pct)} (${stats.checkouts.from121to170.hits}/${stats.checkouts.from121to170.attempts})`}
            />
        </View>
    );
}

function DoublesCard({ rows }: { rows: DoubleTargetStat[] }) {
    return (
        <View style={styles.card}>
            <SectionTitle>Doubles</SectionTitle>

            {rows.length === 0 ? (
                <Text style={styles.emptyText}>No recorded double data yet.</Text>
            ) : (
                <View style={{ gap: 10 }}>
                    {rows.slice(0, 8).map((row) => (
                        <MetricRow
                            key={row.label}
                            label={row.label}
                            value={`${fmtPct(row.pct)} (${row.hits}/${row.attempts})`}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

function HighlightsCard({ stats }: { stats: PlayerAggregatedStats }) {
    const bestLeg = stats.highlights.bestLeg;

    return (
        <View style={styles.card}>
            <SectionTitle>Highlights</SectionTitle>

            <MetricRow
                label="Best leg"
                value={
                    bestLeg
                        ? `${bestLeg.dartsThrown} darts • ${fmtAvg(bestLeg.avg3Dart)} avg`
                        : '—'
                }
            />
            <MetricRow label="100+" value={`${stats.highlights.count100Plus}`} />
            <MetricRow label="140+" value={`${stats.highlights.count140Plus}`} />
            <MetricRow label="180s" value={`${stats.highlights.count180s}`} />
        </View>
    );
}

function CompareCard(props: {
    leftLabel: string;
    rightLabel: string;
    left: PlayerAggregatedStats;
    right: PlayerAggregatedStats;
}) {
    const { leftLabel, rightLabel, left, right } = props;

    return (
        <View style={styles.card}>
            <SectionTitle>Compare</SectionTitle>

            <Text style={styles.compareSub}>
                {leftLabel} vs {rightLabel}
            </Text>

            <View style={styles.compareTable}>
                <View style={styles.compareHeader}>
                    <Text style={[styles.compareMetric, styles.compareHeaderText]}>Metric</Text>
                    <Text style={[styles.compareCol, styles.compareHeaderText]}>{leftLabel}</Text>
                    <Text style={[styles.compareCol, styles.compareHeaderText]}>{rightLabel}</Text>
                    <Text style={[styles.compareCol, styles.compareHeaderText]}>Δ</Text>
                </View>

                <View style={styles.compareRow}>
                    <Text style={styles.compareMetric}>3-dart avg</Text>
                    <Text style={styles.compareCol}>{fmtAvg(left.averages.overall3Dart)}</Text>
                    <Text style={styles.compareCol}>{fmtAvg(right.averages.overall3Dart)}</Text>
                    <Text style={styles.compareCol}>{fmtDelta(left.averages.overall3Dart, right.averages.overall3Dart)}</Text>
                </View>

                <View style={styles.compareRow}>
                    <Text style={styles.compareMetric}>First 9</Text>
                    <Text style={styles.compareCol}>{fmtAvg(left.averages.first9)}</Text>
                    <Text style={styles.compareCol}>{fmtAvg(right.averages.first9)}</Text>
                    <Text style={styles.compareCol}>{fmtDelta(left.averages.first9, right.averages.first9)}</Text>
                </View>

                <View style={styles.compareRow}>
                    <Text style={styles.compareMetric}>Checkout %</Text>
                    <Text style={styles.compareCol}>{fmtPct(left.checkouts.overall.pct)}</Text>
                    <Text style={styles.compareCol}>{fmtPct(right.checkouts.overall.pct)}</Text>
                    <Text style={styles.compareCol}>{fmtDelta(left.checkouts.overall.pct, right.checkouts.overall.pct, '%')}</Text>
                </View>

                <View style={styles.compareRow}>
                    <Text style={styles.compareMetric}>Started win %</Text>
                    <Text style={styles.compareCol}>{fmtPct(left.legWinByStarting.startedPct)}</Text>
                    <Text style={styles.compareCol}>{fmtPct(right.legWinByStarting.startedPct)}</Text>
                    <Text style={styles.compareCol}>{fmtDelta(left.legWinByStarting.startedPct, right.legWinByStarting.startedPct, '%')}</Text>
                </View>

                <View style={styles.compareRow}>
                    <Text style={styles.compareMetric}>Not-started win %</Text>
                    <Text style={styles.compareCol}>{fmtPct(left.legWinByStarting.notStartedPct)}</Text>
                    <Text style={styles.compareCol}>{fmtPct(right.legWinByStarting.notStartedPct)}</Text>
                    <Text style={styles.compareCol}>{fmtDelta(left.legWinByStarting.notStartedPct, right.legWinByStarting.notStartedPct, '%')}</Text>
                </View>

                <View style={styles.compareRow}>
                    <Text style={styles.compareMetric}>180s</Text>
                    <Text style={styles.compareCol}>{left.highlights.count180s}</Text>
                    <Text style={styles.compareCol}>{right.highlights.count180s}</Text>
                    <Text style={styles.compareCol}>{left.highlights.count180s - right.highlights.count180s}</Text>
                </View>
            </View>
        </View>
    );
}

export default function PlayerStatsScreen({ route, navigation }: Props) {
    const { playerId } = route.params;

    const matches = useGameStore((s) => s.matches);
    const players = useGameStore((s) => s.players);

    const player = players.find((p) => p.id === playerId);

    const [selectedWindow, setSelectedWindow] = useState<StatsWindowKey>('allTime');
    const [compareMode, setCompareMode] = useState(false);
    const [compareWindow, setCompareWindow] = useState<StatsWindowKey>('last30d');

    if (!player) {
        return (
            <View style={styles.center}>
                <Text style={{ color: TEXT }}>Player not found.</Text>
            </View>
        );
    }

    const statsByWindow = getPlayerStatsByWindow(matches, players, playerId);

    const primaryStats = statsByWindow[selectedWindow];
    const secondaryStats = statsByWindow[compareWindow];

    const emoji = player.flag ? getFlagEmoji(player.flag) : '';
    const country = player.flag ? getCountryName(player.flag) : undefined;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.heroCard}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.heroTitle}>
                        {emoji ? `${emoji} ` : ''}
                        {player.name}
                        {player.nickname ? ` (${player.nickname})` : ''}
                    </Text>
                    <Text style={styles.heroSub}>{country ? country : 'No country selected'}</Text>
                </View>

                <Pressable
                    onPress={() => navigation.navigate('Players')}
                    style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.88 }]}
                >
                    <Text style={styles.backButtonText}>Players</Text>
                </Pressable>
            </View>

            <View style={styles.card}>
                <SectionTitle>Time Window</SectionTitle>

                <View style={styles.pillRow}>
                    {(['lastSession', 'last7d', 'last30d', 'allTime'] as StatsWindowKey[]).map((windowKey) => (
                        <Pill
                            key={windowKey}
                            label={WINDOW_LABELS[windowKey]}
                            selected={selectedWindow === windowKey}
                            onPress={() => {
                                setSelectedWindow(windowKey);
                                if (compareMode && compareWindow === windowKey) {
                                    setCompareWindow(windowKey === 'allTime' ? 'last30d' : 'allTime');
                                }
                            }}
                        />
                    ))}
                </View>

                <Pressable
                    onPress={() => setCompareMode((prev) => !prev)}
                    style={({ pressed }) => [
                        styles.compareButton,
                        compareMode && styles.compareButtonActive,
                        pressed && { opacity: 0.88 },
                    ]}
                >
                    <Text style={[styles.compareButtonText, compareMode && styles.compareButtonTextActive]}>
                        {compareMode ? 'Hide Compare' : 'Compare'}
                    </Text>
                </Pressable>

                {compareMode && (
                    <>
                        <Text style={styles.compareHelper}>Compare against</Text>
                        <View style={styles.pillRow}>
                            {(['lastSession', 'last7d', 'last30d', 'allTime'] as StatsWindowKey[]).map((windowKey) => (
                                <Pill
                                    key={windowKey}
                                    label={WINDOW_LABELS[windowKey]}
                                    selected={compareWindow === windowKey}
                                    onPress={() => setCompareWindow(windowKey)}
                                />
                            ))}
                        </View>
                    </>
                )}
            </View>

            <SummaryCard stats={primaryStats} />
            <WinRateCard stats={primaryStats} />
            <CheckoutCard stats={primaryStats} />
            <DoublesCard rows={primaryStats.doubles.byTarget} />
            <HighlightsCard stats={primaryStats} />

            {compareMode && (
                <CompareCard
                    leftLabel={WINDOW_LABELS[selectedWindow]}
                    rightLabel={WINDOW_LABELS[compareWindow]}
                    left={primaryStats}
                    right={secondaryStats}
                />
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        gap: 14,
        backgroundColor: BG,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BG,
    },

    heroCard: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 18,
        padding: 16,
        backgroundColor: CARD,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heroTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: TEXT,
    },
    heroSub: {
        marginTop: 2,
        fontSize: 13,
        color: MUTED,
    },
    backButton: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: CARD,
    },
    backButtonText: {
        color: TEXT,
        fontWeight: '800',
        fontSize: 12,
    },

    card: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 18,
        padding: 16,
        backgroundColor: CARD,
        gap: 12,
    },

    sectionTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: TEXT,
    },

    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pill: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: CARD,
    },
    pillSelected: {
        backgroundColor: BLUE,
        borderColor: BLUE,
    },
    pillText: {
        color: TEXT,
        fontWeight: '800',
        fontSize: 12,
    },
    pillTextSelected: {
        color: '#fff',
    },

    compareButton: {
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: CARD,
    },
    compareButtonActive: {
        borderColor: BLUE,
        backgroundColor: BLUE,
    },
    compareButtonText: {
        color: TEXT,
        fontWeight: '900',
        fontSize: 13,
    },
    compareButtonTextActive: {
        color: '#fff',
    },
    compareHelper: {
        fontSize: 12,
        color: MUTED,
        fontWeight: '700',
    },

    summaryGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    bigStatCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 14,
        backgroundColor: '#F8FAFC',
    },
    bigStatValue: {
        fontSize: 30,
        fontWeight: '900',
        color: TEXT,
    },
    bigStatLabel: {
        marginTop: 2,
        fontSize: 13,
        color: MUTED,
        fontWeight: '700',
    },
    highlightRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    highlightChip: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: CARD,
        minWidth: 80,
    },
    highlightChipValue: {
        fontSize: 18,
        fontWeight: '900',
        color: TEXT,
    },
    highlightChipLabel: {
        marginTop: 2,
        fontSize: 11,
        color: MUTED,
        fontWeight: '700',
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    metricLabel: {
        flex: 1,
        fontSize: 14,
        color: TEXT,
        fontWeight: '700',
    },
    metricValue: {
        fontSize: 14,
        color: TEXT,
        fontWeight: '800',
        textAlign: 'right',
    },

    emptyText: {
        color: MUTED,
        fontSize: 13,
    },

    compareSub: {
        color: MUTED,
        fontSize: 13,
        fontWeight: '700',
    },
    compareTable: {
        gap: 8,
    },
    compareHeader: {
        flexDirection: 'row',
        gap: 8,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },
    compareRow: {
        flexDirection: 'row',
        gap: 8,
    },
    compareMetric: {
        flex: 1.6,
        fontSize: 13,
        fontWeight: '700',
        color: TEXT,
    },
    compareCol: {
        flex: 1,
        fontSize: 13,
        fontWeight: '800',
        color: TEXT,
        textAlign: 'right',
    },
    compareHeaderText: {
        color: MUTED,
        fontSize: 12,
        fontWeight: '900',
    },
});