// src/screens/ScoreboardScreen.tsx
//
// Changes requested:
// 1) Tips are NOT visible if no tips are available (no placeholder bar).
// 2) Auto-advance turns: when 3 darts are entered OR the turn busts,
//    the app automatically commits the turn and switches player.
//    (You still CAN keep an optional End Turn button for rare cases.)

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, Alert, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getLegAverage, getCheckoutAdvice } from '../engine/x01';
import { DartMultiplier } from '../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

const BLUE = '#0A84FF';
const RED = '#FF3B30';
const GREEN = '#34C759';

const BG = '#FFFFFF';
const TEXT = '#111111';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';
const KEY_BG = '#F2F2F7';

// Requested: keypad ordered 1 → 20
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
    if (m === 2) return BLUE; // Double = blue
    if (m === 3) return RED;  // Triple = red
    return TEXT;
}

function ActionButton(props: {
    label: string;
    onPress: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    tone?: 'primary' | 'neutral';
    hint?: string;
}) {
    const { label, onPress, onLongPress, disabled, tone = 'neutral', hint } = props;

    const bg = tone === 'primary' ? BLUE : '#FFFFFF';
    const fg = tone === 'primary' ? '#FFFFFF' : TEXT;
    const border = tone === 'primary' ? BLUE : BORDER;

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={350}
            disabled={disabled}
            style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 },
                pressed && !disabled ? { opacity: 0.85 } : null,
            ]}
        >
            <Text style={[styles.actionBtnText, { color: fg }]}>{label}</Text>
            {!!hint && <Text style={[styles.actionBtnHint, { color: fg, opacity: 0.8 }]}>{hint}</Text>}
        </Pressable>
    );
}

export default function ScoreboardScreen({ navigation }: Props) {
    const currentMatch = useGameStore(s => s.currentMatch);
    const currentLegState = useGameStore(s => s.currentLegState);
    const players = useGameStore(s => s.players);

    const addDart = useGameStore(s => s.addDart);
    const undoDart = useGameStore(s => s.undoDart);
    const endTurn = useGameStore(s => s.endTurn);
    const finishLegIfNeeded = useGameStore(s => s.finishLegIfNeeded);
    const abandonMatch = useGameStore(s => s.abandonMatch);

    const [multiplier, setMultiplier] = useState<DartMultiplier>(1);

    const currentPlayerId = currentLegState?.currentPlayerId;
    const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? 'Player';

    // Turn total = sum of the darts entered so far
    const turnTotal = useMemo(() => {
        if (!currentLegState) return 0;
        return currentLegState.turnDarts.reduce((sum, d) => sum + d.score, 0);
    }, [currentLegState?.turnDarts]);

    // Remaining score for current thrower
    const remaining = currentLegState?.scoresByPlayer?.[currentPlayerId ?? ''] ?? 0;

    // Darts left this turn
    const dartsThrown = currentLegState?.turnDarts.length ?? 0;
    const dartsLeft = 3 - dartsThrown;

    // Lock keypad if 3 darts entered or turn is no longer editable
    const turnLocked = useMemo(() => {
        if (!currentLegState) return false;
        return currentLegState.turnDarts.length >= 3 || currentLegState.turnStatus !== 'IN_PROGRESS';
    }, [currentLegState?.turnDarts.length, currentLegState?.turnStatus]);

    const canUndo =
        (currentLegState?.turnDarts.length ?? 0) > 0 || (currentLegState?.visits.length ?? 0) > 0;

    // --- Checkout advice (only computed when it matters) ---
    const checkoutAdvice = useMemo(() => {
        if (!currentLegState || !currentPlayerId) return null;
        if (currentLegState.turnStatus !== 'IN_PROGRESS') return null;
        if (dartsLeft <= 0) return null;

        // Reduce noise early in the leg (optional).
        // If you want more frequent tips, raise this number or remove it.
        if (remaining > 230) return null;

        return getCheckoutAdvice(remaining, dartsLeft);
    }, [currentLegState?.turnStatus, remaining, dartsLeft, currentPlayerId]);

    /**
     * ✅ AUTO TURN ADVANCE
     *
     * We automatically commit/rotate when:
     * - 3 darts are entered (normal turn end), OR
     * - the engine marks a BUST (turn ends immediately).
     *
     * Checkout is handled separately by your store (it commits immediately and ends the leg),
     * so we avoid ending the turn if winner exists.
     */
    useEffect(() => {
        if (!currentLegState) return;

        // If leg is won, don't auto-end-turn; your finish flow will run.
        if (currentLegState.winnerPlayerId) return;

        // If bust, the turn is over and should rotate immediately.
        if (currentLegState.turnStatus === 'BUST') {
            endTurn();
            return;
        }

        // If 3 darts entered, auto-submit the turn and rotate.
        if (currentLegState.turnStatus === 'IN_PROGRESS' && currentLegState.turnDarts.length === 3) {
            endTurn();
        }
    }, [currentLegState?.turnStatus, currentLegState?.turnDarts.length, currentLegState?.winnerPlayerId, endTurn]);

    // Exit confirmation (header left)
    const confirmExit = useCallback(() => {
        Alert.alert('Exit match?', 'You will lose the current in-progress match.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Exit',
                style: 'destructive',
                onPress: () => {
                    abandonMatch();
                    navigation.navigate('Home');
                },
            },
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

    // Finish flow: when winner is set -> finalize and go to summary
    useEffect(() => {
        if (!currentLegState?.winnerPlayerId || !currentMatch) return;
        const { matchFinished, matchId } = finishLegIfNeeded();
        if (matchFinished && matchId) navigation.replace('MatchSummary', { matchId });
    }, [currentLegState?.winnerPlayerId, currentMatch, finishLegIfNeeded, navigation]);

    // Fallback if store state is missing
    if (!currentMatch || !currentLegState || !currentPlayerId) {
        return (
            <View style={styles.center}>
                <Text style={{ color: TEXT }}>No active match.</Text>
                <ActionButton label="Back to Home" onPress={() => navigation.navigate('Home')} tone="primary" />
            </View>
        );
    }

    const pushNumber = (segment: number) => {
        // Prevent impossible “triple bull”
        if (segment === 25 && multiplier === 3) {
            Alert.alert('Not possible', 'There is no Triple Bull. Use 25 or Bull.');
            return;
        }

        // If the turn is locked, user must undo first.
        if (turnLocked) {
            Alert.alert('Turn locked', 'Undo to edit.');
            return;
        }

        addDart(segment, multiplier);

        // Reset to single after each dart for speed (DartCounter-style)
        setMultiplier(1);
    };

    const pushMiss = () => pushNumber(0);

    const push25 = () => {
        if (turnLocked) {
            Alert.alert('Turn locked', 'Undo to edit.');
            return;
        }
        addDart(25, 1);
        setMultiplier(1);
    };

    const pushBull = () => {
        if (turnLocked) {
            Alert.alert('Turn locked', 'Undo to edit.');
            return;
        }
        addDart(25, 2);
        setMultiplier(1);
    };

    // Hold Undo = clear current turn fast (or pull back previous then clear)
    const undoWholeTurn = () => {
        const store = useGameStore.getState();
        const st = store.currentLegState;
        if (!st) return;

        // If current turn empty, first pull back the previous committed visit
        if (st.turnDarts.length === 0) store.undoDart();

        // Then remove up to 3 darts from the restored/active turn
        for (let i = 0; i < 3; i++) {
            const now = useGameStore.getState().currentLegState;
            if (!now || now.turnDarts.length === 0) break;
            useGameStore.getState().undoDart();
        }
    };

    // Compact tip details: tap opens a full alert
    const openTipDetails = () => {
        if (!checkoutAdvice) return;

        if (checkoutAdvice.kind === 'checkout') {
            Alert.alert(
                'Checkout',
                `Remaining: ${remaining}\nDarts left: ${dartsLeft}\n\nRoute:\n${checkoutAdvice.route.join(' → ')}`
            );
            return;
        }

        const setup = checkoutAdvice.setup;
        if (setup) {
            Alert.alert(
                'Setup',
                `${checkoutAdvice.message}\n\nAim: ${setup.aim}\nLeaves: ${setup.leaves}${
                    setup.nextOut?.length ? `\n\nNext out:\n${setup.nextOut.join(' → ')}` : ''
                }`
            );
            return;
        }

        Alert.alert('Setup', `${checkoutAdvice.message}\n\nRemaining: ${remaining}\nDarts left: ${dartsLeft}`);
    };

    const accent = multiplierColor(multiplier);

    return (
        <View style={styles.screen}>
            {/* Header row */}
            <View style={styles.header}>
                <View style={{ gap: 2 }}>
                    <Text style={styles.title}>Scoreboard</Text>
                    <Text style={styles.subtitle}>
                        Throwing: <Text style={styles.bold}>{nameOf(currentPlayerId)}</Text>
                    </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.turnTotalLabel}>Turn</Text>
                    <Text style={styles.turnTotalValue}>{turnTotal}</Text>
                </View>
            </View>

            {/* Players card */}
            <View style={styles.playersCard}>
                {currentMatch.playerIds.map(pid => {
                    const isTurn = pid === currentLegState.currentPlayerId;
                    return (
                        <View key={pid} style={[styles.playerRow, isTurn && { borderColor: BLUE }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.playerName}>{nameOf(pid)}</Text>
                                <Text style={styles.playerMeta}>Avg: {getLegAverage(currentLegState, pid).toFixed(1)}</Text>
                            </View>
                            <Text style={[styles.remaining, isTurn && { color: BLUE }]}>{currentLegState.scoresByPlayer[pid]}</Text>
                        </View>
                    );
                })}
            </View>

            {/* Turn card */}
            <View style={styles.turnCard}>
                <View style={styles.turnSlots}>
                    {[0, 1, 2].map(i => {
                        const d = currentLegState.turnDarts[i];
                        return (
                            <View key={i} style={[styles.turnSlot, d ? { borderColor: BLUE } : null]}>
                                <Text style={styles.turnSlotTop}>{d ? formatDart(d) : '—'}</Text>
                                <Text style={styles.turnSlotBottom}>{d ? `${d.score}` : ''}</Text>
                            </View>
                        );
                    })}
                </View>

                {/* ✅ IMPORTANT: render tips ONLY if advice exists */}
                {checkoutAdvice && (
                    <Pressable
                        onPress={openTipDetails}
                        style={({ pressed }) => [
                            styles.tipBar,
                            { borderColor: '#BBD7FF', backgroundColor: '#F3F8FF' },
                            pressed ? { opacity: 0.88 } : null,
                        ]}
                    >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                            <Text style={styles.tipBarTitle}>{checkoutAdvice.kind === 'checkout' ? 'Checkout' : 'Setup'}</Text>
                            <Text style={styles.tipBarTap}>Tap for details</Text>
                        </View>

                        <Text style={styles.tipBarLine} numberOfLines={1}>
                            {checkoutAdvice.kind === 'checkout'
                                ? checkoutAdvice.route.join(' → ')
                                : checkoutAdvice.setup
                                    ? `Aim ${checkoutAdvice.setup.aim} → leave ${checkoutAdvice.setup.leaves}`
                                    : checkoutAdvice.message}
                        </Text>

                        <Text style={styles.tipBarLine2} numberOfLines={1}>
                            Remaining {remaining} • {dartsLeft} dart{dartsLeft === 1 ? '' : 's'} left
                        </Text>
                    </Pressable>
                )}

                <View style={styles.turnActions}>
                    <ActionButton label="Undo" onPress={undoDart} onLongPress={undoWholeTurn} disabled={!canUndo} hint="hold" />

                    {/* Optional manual end-turn button:
             Not required (auto-advance handles it), but useful if someone wants to end early. */}
                    <ActionButton label="End turn" onPress={endTurn} hint="optional" />
                </View>

                <Text style={styles.microHint}>
                    Auto-advances after 3 darts (or bust). Undo to correct.
                </Text>
            </View>

            {/* Multiplier buttons */}
            <View style={styles.multRow}>
                {([1, 2, 3] as DartMultiplier[]).map(m => {
                    const selected = multiplier === m;
                    const col = multiplierColor(m);
                    const label = m === 1 ? 'S' : m === 2 ? 'D' : 'T';

                    return (
                        <Pressable
                            key={m}
                            onPress={() => setMultiplier(m)}
                            style={({ pressed }) => [
                                styles.multBtn,
                                { borderColor: col },
                                selected && { backgroundColor: col, borderColor: col },
                                pressed && { opacity: 0.9 },
                            ]}
                        >
                            <Text style={[styles.multText, selected && { color: '#fff' }]}>{label}</Text>
                            <Text style={[styles.multSub, selected && { color: '#fff' }]}>
                                {m === 1 ? 'Single' : m === 2 ? 'Double' : 'Triple'}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Keypad */}
            <View style={styles.pad}>
                {numberRows.map((row, idx) => (
                    <View key={idx} style={styles.padRow}>
                        {row.map(n => (
                            <Pressable
                                key={n}
                                onPress={() => pushNumber(n)}
                                style={({ pressed }) => [
                                    styles.key,
                                    { borderColor: multiplier === 1 ? BORDER : accent, opacity: turnLocked ? 0.5 : 1 },
                                    pressed && !turnLocked ? styles.keyPressed : null,
                                ]}
                                disabled={turnLocked}
                            >
                                <Text style={styles.keyTop}>{n}</Text>
                                <Text style={styles.keyBottom}>{scoreFor(n, multiplier)}</Text>
                            </Pressable>
                        ))}
                    </View>
                ))}

                <View style={styles.padRow}>
                    <Pressable
                        onPress={pushMiss}
                        style={({ pressed }) => [
                            styles.key,
                            styles.keyMiss,
                            pressed && !turnLocked ? styles.keyPressed : null,
                            { opacity: turnLocked ? 0.5 : 1 },
                        ]}
                        disabled={turnLocked}
                    >
                        <Text style={[styles.keyTop, { color: '#fff' }]}>MISS</Text>
                        <Text style={[styles.keyBottom, { color: '#fff' }]}>0</Text>
                    </Pressable>

                    <Pressable
                        onPress={push25}
                        style={({ pressed }) => [
                            styles.key,
                            styles.key25,
                            pressed && !turnLocked ? styles.keyPressed : null,
                            { opacity: turnLocked ? 0.5 : 1 },
                        ]}
                        disabled={turnLocked}
                    >
                        <Text style={[styles.keyTop, { color: '#fff' }]}>25</Text>
                        <Text style={[styles.keyBottom, { color: '#fff' }]}>25</Text>
                    </Pressable>

                    <Pressable
                        onPress={pushBull}
                        style={({ pressed }) => [
                            styles.key,
                            styles.keyBull,
                            pressed && !turnLocked ? styles.keyPressed : null,
                            { opacity: turnLocked ? 0.5 : 1 },
                        ]}
                        disabled={turnLocked}
                    >
                        <Text style={[styles.keyTop, { color: '#fff' }]}>BULL</Text>
                        <Text style={[styles.keyBottom, { color: '#fff' }]}>50</Text>
                    </Pressable>
                </View>
            </View>

            <Text style={styles.tip}>Tap Undo = last dart/turn • Hold Undo = clear whole turn</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG, padding: 12, gap: 8 },
    center: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', gap: 12 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 2 },
    title: { fontSize: 20, fontWeight: '800', color: TEXT },
    subtitle: { fontSize: 13, color: MUTED },
    bold: { fontWeight: '800', color: TEXT },

    turnTotalLabel: { fontSize: 12, color: MUTED },
    turnTotalValue: { fontSize: 22, fontWeight: '900', color: TEXT },

    playersCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 10, gap: 8, backgroundColor: '#fff' },
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#fff',
    },
    playerName: { fontSize: 15, fontWeight: '800', color: TEXT },
    playerMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
    remaining: { fontSize: 20, fontWeight: '900', color: TEXT },

    turnCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 10, backgroundColor: '#fff', gap: 8 },
    turnSlots: { flexDirection: 'row', gap: 8 },
    turnSlot: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 9, alignItems: 'center', gap: 2, backgroundColor: '#fff' },
    turnSlotTop: { fontSize: 14, fontWeight: '900', color: TEXT },
    turnSlotBottom: { fontSize: 12, color: MUTED, fontWeight: '800' },

    // Tip bar (only appears if checkoutAdvice exists)
    tipBar: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
        gap: 2,
    },
    tipBarTitle: { fontSize: 12, fontWeight: '900', color: BLUE },
    tipBarTap: { fontSize: 11, fontWeight: '800', color: MUTED },
    tipBarLine: { fontSize: 13, fontWeight: '800', color: TEXT },
    tipBarLine2: { fontSize: 12, fontWeight: '700', color: MUTED },

    turnActions: { flexDirection: 'row', gap: 10 },
    microHint: { fontSize: 11, color: MUTED, textAlign: 'center' },

    actionBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
    actionBtnText: { fontSize: 16, fontWeight: '900' },
    actionBtnHint: { fontSize: 11, fontWeight: '800' },

    multRow: { flexDirection: 'row', gap: 10 },
    multBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    multText: { fontSize: 16, fontWeight: '900', color: TEXT },
    multSub: { marginTop: 2, fontSize: 11, fontWeight: '800', color: MUTED },

    pad: { flex: 1, gap: 8, marginTop: 2 },
    padRow: { flexDirection: 'row', gap: 8, flex: 1 },
    key: { flex: 1, borderWidth: 1, borderRadius: 14, backgroundColor: KEY_BG, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
    keyPressed: { opacity: 0.85 },
    keyTop: { fontSize: 16, fontWeight: '900', color: TEXT },
    keyBottom: { marginTop: 2, fontSize: 12, fontWeight: '800', color: MUTED },

    keyMiss: { backgroundColor: '#8E8E93', borderColor: '#8E8E93' },
    key25: { backgroundColor: GREEN, borderColor: GREEN },
    keyBull: { backgroundColor: RED, borderColor: RED },

    tip: { fontSize: 11, color: MUTED, textAlign: 'center' },
});