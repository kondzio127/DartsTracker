import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, Alert, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getLegAverage, getCheckoutAdvice, X01LegState } from '../engine/x01';
import { DartMultiplier, Player } from '../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

const BLUE = '#0A84FF';
const RED = '#FF3B30';
const GREEN = '#34C759';
const BG = '#FFFFFF';
const TEXT = '#111111';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const KEY_BG = '#F2F2F7';

const numberRows: number[][] = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20],
];

function formatDart(d: { segment: number; multiplier: DartMultiplier; score: number }): string {
    if (d.segment === 0) return 'MISS';
    if (d.segment === 25) return d.multiplier === 2 ? 'BULL' : '25';
    if (d.multiplier === 1) return `${d.segment}`;
    if (d.multiplier === 2) return `D${d.segment}`;
    return `T${d.segment}`;
}

function scoreFor(segment: number, m: DartMultiplier): number {
    if (segment === 0) return 0;
    if (segment === 25) return m === 2 ? 50 : 25;
    return segment * m;
}

function multiplierColor(m: DartMultiplier): string {
    if (m === 2) return BLUE;
    if (m === 3) return RED;
    return TEXT;
}

function MiniButton(props: { label: string; onPress: () => void; onLongPress?: () => void; disabled?: boolean; variant?: 'primary' | 'outline' }) {
    const { label, onPress, onLongPress, disabled, variant = 'outline' } = props;
    const bg = variant === 'primary' ? BLUE : '#FFFFFF';
    const fg = variant === 'primary' ? '#FFFFFF' : TEXT;
    const border = variant === 'primary' ? BLUE : BORDER;

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={350}
            disabled={disabled}
            style={({ pressed }) => [
                styles.miniBtn,
                { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : 1 },
                pressed && !disabled ? { opacity: 0.85 } : null,
            ]}
        >
            <Text style={[styles.miniBtnText, { color: fg }]}>{label}</Text>
        </Pressable>
    );
}

export default function ScoreboardScreen({ navigation }: Props) {
    const currentMatch = useGameStore((s: { currentMatch?: ReturnType<typeof useGameStore.getState>['currentMatch'] }) => s.currentMatch) as ReturnType<typeof useGameStore.getState>['currentMatch'];
    const currentLegState = useGameStore((s: { currentLegState?: X01LegState }) => s.currentLegState) as X01LegState | undefined;
    const players = useGameStore((s: { players: Player[] }) => s.players) as Player[];

    const addDart = useGameStore((s: ReturnType<typeof useGameStore.getState>) => s.addDart);
    const undoDart = useGameStore((s: ReturnType<typeof useGameStore.getState>) => s.undoDart);
    const endTurn = useGameStore((s: ReturnType<typeof useGameStore.getState>) => s.endTurn);
    const finishLegIfNeeded = useGameStore((s: ReturnType<typeof useGameStore.getState>) => s.finishLegIfNeeded);
    const abandonMatch = useGameStore((s: ReturnType<typeof useGameStore.getState>) => s.abandonMatch);

    const [multiplier, setMultiplier] = useState<DartMultiplier>(1);

    const currentPlayerId = currentLegState?.currentPlayerId;
    const nameOf = (id: string) => players.find((p: Player) => p.id === id)?.name ?? 'Player';

    const dartsThrown = currentLegState?.turnDarts.length ?? 0;
    const dartsLeft = 3 - dartsThrown;

    const turnTotal = useMemo(() => {
        if (!currentLegState) return 0;
        return currentLegState.turnDarts.reduce((sum: number, d) => sum + d.score, 0);
    }, [currentLegState?.turnDarts]);

    const remaining = currentLegState?.scoresByPlayer?.[currentPlayerId ?? ''] ?? 0;
    const turnLocked = (currentLegState?.turnDarts.length ?? 0) >= 3;
    const canUndo = (currentLegState?.turnDarts.length ?? 0) > 0 || (currentLegState?.visits.length ?? 0) > 0;
    const showEndEarly = !!currentLegState && currentLegState.turnDarts.length > 0 && currentLegState.turnDarts.length < 3;

    const checkoutAdvice = useMemo(() => {
        if (!currentLegState || !currentPlayerId) return null;
        if (dartsLeft <= 0) return null;
        if (remaining > 230) return null;
        return getCheckoutAdvice(remaining, dartsLeft);
    }, [currentLegState, currentPlayerId, dartsLeft, remaining]);

    const openTipDetails = () => {
        if (!checkoutAdvice) return;
        if (checkoutAdvice.kind === 'checkout') {
            Alert.alert('Checkout', `Remaining: ${remaining}\nDarts left: ${dartsLeft}\n\nRoute:\n${checkoutAdvice.route.join(' → ')}`);
            return;
        }
        const setup = checkoutAdvice.setup;
        if (setup) {
            Alert.alert('Setup', `${checkoutAdvice.message}\n\nAim: ${setup.aim}\nLeaves: ${setup.leaves}${setup.nextOut?.length ? `\n\nNext out:\n${setup.nextOut.join(' → ')}` : ''}`);
            return;
        }
        Alert.alert('Setup', `${checkoutAdvice.message}\n\nRemaining: ${remaining}\nDarts left: ${dartsLeft}`);
    };

    const confirmExit = useCallback(() => {
        Alert.alert('Exit match?', 'You will lose the current in-progress match.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', style: 'destructive', onPress: () => { abandonMatch(); navigation.navigate('Home'); } },
        ]);
    }, [abandonMatch, navigation]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: () => (
                <Pressable onPress={confirmExit} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontWeight: '800', color: TEXT }}>Exit</Text>
                </Pressable>
            ),
        });
    }, [navigation, confirmExit]);

    useEffect(() => {
        if (!currentLegState?.winnerPlayerId || !currentMatch) return;
        const { matchFinished, matchId } = finishLegIfNeeded();
        if (matchFinished && matchId) navigation.replace('MatchSummary', { matchId });
    }, [currentLegState?.winnerPlayerId, currentMatch, finishLegIfNeeded, navigation]);

    if (!currentMatch || !currentLegState || !currentPlayerId) {
        return (
            <View style={styles.center}>
                <Text style={{ color: TEXT }}>No active match.</Text>
                <MiniButton label="Back" onPress={() => navigation.navigate('Home')} variant="primary" />
            </View>
        );
    }

    const pushNumber = (segment: number) => {
        if (segment === 25 && multiplier === 3) {
            Alert.alert('Not possible', 'There is no Triple Bull. Use 25 or Bull.');
            return;
        }
        if (turnLocked) return;
        addDart(segment, multiplier);
        setMultiplier(1);
    };

    const pushMiss = () => pushNumber(0);
    const push25 = () => { if (!turnLocked) { addDart(25, 1); setMultiplier(1); } };
    const pushBull = () => { if (!turnLocked) { addDart(25, 2); setMultiplier(1); } };

    const undoWholeTurn = () => {
        const st = useGameStore.getState().currentLegState;
        if (!st) return;
        if (st.turnDarts.length === 0) useGameStore.getState().undoDart();
        for (let i = 0; i < 3; i++) {
            const now = useGameStore.getState().currentLegState;
            if (!now || now.turnDarts.length === 0) break;
            useGameStore.getState().undoDart();
        }
    };

    const accent = multiplierColor(multiplier);

    return (
        <View style={styles.screen}>
            <View style={styles.topRow}>
                <View style={{ gap: 2 }}>
                    <Text style={styles.title}>Scoreboard</Text>
                    <Text style={styles.subtitle}>Throwing: <Text style={styles.bold}>{nameOf(currentPlayerId)}</Text></Text>
                </View>
                <View style={styles.turnBox}>
                    <Text style={styles.turnLabel}>Turn</Text>
                    <Text style={styles.turnValue}>{turnTotal}</Text>
                </View>
            </View>

            <View style={styles.card}>
                {currentMatch.playerIds.map((pid: string, idx: number) => {
                    const isTurn = pid === currentLegState.currentPlayerId;
                    const avg = getLegAverage(currentLegState, pid).toFixed(1);
                    return (
                        <View key={pid}>
                            <View style={styles.playerLine}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.playerName, isTurn && { color: BLUE }]} numberOfLines={1}>{nameOf(pid)}</Text>
                                    <Text style={styles.playerMeta}>Avg {avg}</Text>
                                </View>
                                <Text style={[styles.remaining, isTurn && { color: BLUE }]}>{currentLegState.scoresByPlayer[pid]}</Text>
                            </View>
                            {idx !== currentMatch.playerIds.length - 1 && <View style={styles.sep} />}
                        </View>
                    );
                })}
            </View>

            <View style={styles.card}>
                <View style={styles.turnArea}>
                    <View style={styles.turnSlots}>
                        {[0, 1, 2].map((i: number) => {
                            const d = currentLegState.turnDarts[i];
                            return (
                                <View key={i} style={[styles.turnSlot, d ? { borderColor: BLUE } : null]}>
                                    <Text style={styles.turnSlotTop}>{d ? formatDart(d) : '—'}</Text>
                                    <Text style={styles.turnSlotBottom}>{d ? `${d.score}` : ''}</Text>
                                </View>
                            );
                        })}
                    </View>
                    <View style={styles.actionsRow}>
                        <MiniButton label="Undo" onPress={undoDart} onLongPress={undoWholeTurn} disabled={!canUndo} variant="outline" />
                        {showEndEarly && <MiniButton label="End" onPress={endTurn} variant="primary" />}
                    </View>
                </View>

                {checkoutAdvice && (
                    <Pressable onPress={openTipDetails} style={({ pressed }) => [styles.tipBar, pressed && { opacity: 0.88 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                            <Text style={styles.tipTitle}>{checkoutAdvice.kind === 'checkout' ? 'Checkout' : 'Setup'}</Text>
                            <Text style={styles.tipTap}>Tap</Text>
                        </View>
                        <Text style={styles.tipLine} numberOfLines={1}>
                            {checkoutAdvice.kind === 'checkout'
                                ? checkoutAdvice.route.join(' → ')
                                : checkoutAdvice.setup
                                    ? `Aim ${checkoutAdvice.setup.aim} → leave ${checkoutAdvice.setup.leaves}`
                                    : checkoutAdvice.message}
                        </Text>
                        <Text style={styles.tipLine2} numberOfLines={1}>Rem {remaining} • {dartsLeft} dart{dartsLeft === 1 ? '' : 's'} left</Text>
                    </Pressable>
                )}
            </View>

            <View style={styles.multRow}>
                {([1, 2, 3] as DartMultiplier[]).map((m: DartMultiplier) => {
                    const selected = multiplier === m;
                    const col = multiplierColor(m);
                    const label = m === 1 ? 'S' : m === 2 ? 'D' : 'T';
                    return (
                        <Pressable
                            key={m}
                            onPress={() => setMultiplier(m)}
                            style={({ pressed }) => [styles.multBtn, { borderColor: col }, selected && { backgroundColor: col, borderColor: col }, pressed && { opacity: 0.9 }]}
                        >
                            <Text style={[styles.multText, selected && { color: '#fff' }]}>{label}</Text>
                            <Text style={[styles.multSub, selected && { color: '#fff' }]}>{m === 1 ? 'Single' : m === 2 ? 'Double' : 'Triple'}</Text>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.pad}>
                {numberRows.map((row: number[], idx: number) => (
                    <View key={idx} style={styles.padRow}>
                        {row.map((n: number) => (
                            <Pressable
                                key={n}
                                onPress={() => pushNumber(n)}
                                style={({ pressed }) => [styles.key, { borderColor: multiplier === 1 ? BORDER : accent, opacity: turnLocked ? 0.45 : 1 }, pressed && !turnLocked ? { opacity: 0.85 } : null]}
                                disabled={turnLocked}
                            >
                                <Text style={styles.keyTop}>{n}</Text>
                                <Text style={styles.keyBottom}>{scoreFor(n, multiplier)}</Text>
                            </Pressable>
                        ))}
                    </View>
                ))}

                <View style={styles.padRow}>
                    <Pressable onPress={pushMiss} style={({ pressed }) => [styles.key, styles.keyMiss, pressed && !turnLocked ? { opacity: 0.85 } : null, { opacity: turnLocked ? 0.45 : 1 }]} disabled={turnLocked}>
                        <Text style={[styles.keyTop, { color: '#fff' }]}>MISS</Text>
                        <Text style={[styles.keyBottom, { color: '#fff' }]}>0</Text>
                    </Pressable>
                    <Pressable onPress={push25} style={({ pressed }) => [styles.key, styles.key25, pressed && !turnLocked ? { opacity: 0.85 } : null, { opacity: turnLocked ? 0.45 : 1 }]} disabled={turnLocked}>
                        <Text style={[styles.keyTop, { color: '#fff' }]}>25</Text>
                        <Text style={[styles.keyBottom, { color: '#fff' }]}>25</Text>
                    </Pressable>
                    <Pressable onPress={pushBull} style={({ pressed }) => [styles.key, styles.keyBull, pressed && !turnLocked ? { opacity: 0.85 } : null, { opacity: turnLocked ? 0.45 : 1 }]} disabled={turnLocked}>
                        <Text style={[styles.keyTop, { color: '#fff' }]}>BULL</Text>
                        <Text style={[styles.keyBottom, { color: '#fff' }]}>50</Text>
                    </Pressable>
                </View>
            </View>

            <Text style={styles.footerHint}>Turns auto-end after 3 darts or bust. Hold Undo = clear turn.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG, padding: 12, gap: 8 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    title: { fontSize: 20, fontWeight: '900', color: TEXT },
    subtitle: { fontSize: 13, color: MUTED },
    bold: { fontWeight: '900', color: TEXT },
    turnBox: { alignItems: 'flex-end' },
    turnLabel: { fontSize: 12, color: MUTED, fontWeight: '800' },
    turnValue: { fontSize: 22, fontWeight: '900', color: TEXT },
    card: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 10, backgroundColor: '#fff' },
    sep: { height: 1, backgroundColor: BORDER, marginVertical: 8 },
    playerLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    playerName: { fontSize: 15, fontWeight: '900', color: TEXT },
    playerMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
    remaining: { fontSize: 20, fontWeight: '900', color: TEXT },
    turnArea: { gap: 10 },
    turnSlots: { flexDirection: 'row', gap: 8 },
    turnSlot: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
    turnSlotTop: { fontSize: 14, fontWeight: '900', color: TEXT },
    turnSlotBottom: { fontSize: 12, fontWeight: '800', color: MUTED, marginTop: 2 },
    actionsRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
    miniBtn: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minWidth: 88 },
    miniBtnText: { fontSize: 13, fontWeight: '900' },
    tipBar: { marginTop: 10, borderWidth: 1, borderColor: '#BBD7FF', backgroundColor: '#F3F8FF', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
    tipTitle: { fontSize: 12, fontWeight: '900', color: BLUE },
    tipTap: { fontSize: 11, fontWeight: '800', color: MUTED },
    tipLine: { fontSize: 13, fontWeight: '900', color: TEXT },
    tipLine2: { fontSize: 12, fontWeight: '700', color: MUTED },
    multRow: { flexDirection: 'row', gap: 10 },
    multBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    multText: { fontSize: 16, fontWeight: '900', color: TEXT },
    multSub: { marginTop: 2, fontSize: 11, fontWeight: '800', color: MUTED },
    pad: { flex: 1, gap: 8, marginTop: 2 },
    padRow: { flexDirection: 'row', gap: 8, flex: 1 },
    key: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 14, backgroundColor: KEY_BG, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
    keyTop: { fontSize: 16, fontWeight: '900', color: TEXT },
    keyBottom: { marginTop: 2, fontSize: 12, fontWeight: '800', color: MUTED },
    keyMiss: { backgroundColor: '#8E8E93', borderColor: '#8E8E93' },
    key25: { backgroundColor: GREEN, borderColor: GREEN },
    keyBull: { backgroundColor: RED, borderColor: RED },
    footerHint: { textAlign: 'center', fontSize: 11, color: MUTED },
});
