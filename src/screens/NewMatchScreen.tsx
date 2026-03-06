// src/screens/NewMatchScreen.tsx
//
// Goals of this UI:
// - Clean black/white base theme
// - Use both blue + black buttons for hierarchy
// - No tick emojis (selection is shown via borders/background + labels)
// - Fast player picking: search, selection counter, clear
// - Start button always visible (fixed footer)

import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    ScrollView,
    TextInput,
    Alert,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getFlagEmoji, getCountryName } from '../utils/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMatch'>;

type GameModeUI = 'X01' | 'AROUND_THE_CLOCK';
type FormatType = 'single' | 'bestOf';

const BLUE = '#0A84FF';
const BLACK = '#111111';
const WHITE = '#FFFFFF';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';
const SOFT = '#F2F2F7';

const MAX_PLAYERS = 4;

export default function NewMatchScreen({ navigation }: Props) {
    // -------------------- Store --------------------
    const players = useGameStore(s => s.players);
    const startMatch = useGameStore(s => s.startMatch);
    const startAroundTheClock = useGameStore(s => s.startAroundTheClock);

    // Only show active players, sorted (predictable list)
    const activePlayers = useMemo(
        () => [...players].filter(p => !p.isHidden).sort((a, b) => a.name.localeCompare(b.name)),
        [players]
    );

    // -------------------- UI state --------------------
    const [gameMode, setGameMode] = useState<GameModeUI>('X01');
    const [playerSearch, setPlayerSearch] = useState('');
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

    // X01 settings
    const [startScore, setStartScore] = useState<number>(501);
    const [formatType, setFormatType] = useState<FormatType>('single');
    const [bestOfLegs, setBestOfLegs] = useState<number>(3);

    // Practice settings
    const [maxTarget, setMaxTarget] = useState<number>(20);

    // -------------------- Derived state --------------------
    const filteredPlayers = useMemo(() => {
        const q = playerSearch.trim().toLowerCase();
        if (!q) return activePlayers;

        return activePlayers.filter(p => {
            const name = p.name.toLowerCase();
            const nick = (p.nickname ?? '').toLowerCase();
            const code = (p.flag ?? '').toLowerCase();
            const countryName = (p.flag ? (getCountryName(p.flag) ?? '') : '').toLowerCase();
            return name.includes(q) || nick.includes(q) || code.includes(q) || countryName.includes(q);
        });
    }, [playerSearch, activePlayers]);

    const toggleSelect = (playerId: string) => {
        setSelectedPlayerIds(prev => {
            if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
            if (prev.length >= MAX_PLAYERS) return prev; // enforce max
            return [...prev, playerId];
        });
    };

    const clearSelection = () => setSelectedPlayerIds([]);

    // Best-of should be odd (3/5/7...)
    const normalizeBestOfLegs = (n: number) => {
        if (!Number.isFinite(n) || n < 1) return 1;
        return n % 2 === 0 ? n + 1 : n;
    };
    const bestOfNormalized = normalizeBestOfLegs(bestOfLegs);
    const firstTo = Math.floor(bestOfNormalized / 2) + 1;

    const canStartPlayers = selectedPlayerIds.length >= 1 && selectedPlayerIds.length <= MAX_PLAYERS;
    const canStartX01 = canStartPlayers && startScore >= 2;
    const canStartATC = canStartPlayers && maxTarget >= 1;
    const canStart = gameMode === 'X01' ? canStartX01 : canStartATC;

    const onStart = () => {
        if (!canStartPlayers) {
            Alert.alert('Select players', `Pick at least 1 player (up to ${MAX_PLAYERS}).`);
            return;
        }

        if (gameMode === 'X01') {
            if (startScore < 2) {
                Alert.alert('Invalid start score', 'Start score must be 2 or higher (typically 301/501/701).');
                return;
            }

            const legs = formatType === 'single' ? 1 : bestOfNormalized;

            startMatch({
                playerIds: selectedPlayerIds,
                startScore,
                bestOfLegs: legs,
            });

            navigation.navigate('Scoreboard');
            return;
        }

        startAroundTheClock(selectedPlayerIds, maxTarget >= 1 ? maxTarget : 20);
        navigation.navigate('AroundTheClock');
    };

    const playerLabel = (id: string) => {
        const p = players.find(x => x.id === id);
        if (!p) return id;
        const emoji = p.flag ? getFlagEmoji(p.flag) : '';
        return `${emoji ? emoji + ' ' : ''}${p.name}${p.nickname ? ` (${p.nickname})` : ''}`;
    };

    // -------------------- UI components --------------------

    // A reusable "pill" selector button.
    const Pill = ({
                      label,
                      selected,
                      onPress,
                  }: {
        label: string;
        selected: boolean;
        onPress: () => void;
    }) => (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.pill,
                selected && { backgroundColor: BLACK, borderColor: BLACK },
                pressed && { opacity: 0.9 },
            ]}
        >
            <Text style={[styles.pillText, selected && { color: WHITE }]}>{label}</Text>
        </Pressable>
    );

    // A section wrapper for consistent spacing.
    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {children}
        </View>
    );

    // Mode selection card (no ✅ emojis; selection shown via border/background)
    const ModeCard = ({
                          value,
                          title,
                          subtitle,
                      }: {
        value: GameModeUI;
        title: string;
        subtitle: string;
    }) => {
        const selected = gameMode === value;
        return (
            <Pressable
                onPress={() => setGameMode(value)}
                style={({ pressed }) => [
                    styles.modeCard,
                    selected && { borderColor: BLUE, backgroundColor: '#F3F8FF' },
                    pressed && { opacity: 0.9 },
                ]}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.dot, selected && { backgroundColor: BLUE }]} />
                    <Text style={styles.modeTitle}>{title}</Text>
                </View>
                <Text style={styles.modeSubtitle}>{subtitle}</Text>
            </Pressable>
        );
    };

    // A simple button component (black or blue)
    const Button = ({
                        label,
                        onPress,
                        variant = 'black',
                        disabled,
                    }: {
        label: string;
        onPress: () => void;
        variant?: 'black' | 'blue' | 'outline';
        disabled?: boolean;
    }) => {
        const isBlue = variant === 'blue';
        const isOutline = variant === 'outline';

        const bg = isOutline ? WHITE : isBlue ? BLUE : BLACK;
        const fg = isOutline ? BLACK : WHITE;
        const borderColor = isOutline ? BORDER : bg;

        return (
            <Pressable
                onPress={onPress}
                disabled={disabled}
                style={({ pressed }) => [
                    styles.btn,
                    { backgroundColor: bg, borderColor },
                    disabled && { opacity: 0.45 },
                    pressed && !disabled && { opacity: 0.9 },
                ]}
            >
                <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
            </Pressable>
        );
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: WHITE }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={{ flex: 1 }}>
                {/* Scrollable content */}
                <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                    <Text style={styles.pageTitle}>New Game</Text>

                    <Section title="Game mode">
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <ModeCard value="X01" title="X01" subtitle="301 / 501 / 701 match" />
                            <ModeCard value="AROUND_THE_CLOCK" title="Around the Clock" subtitle="Practice mode" />
                        </View>
                    </Section>

                    <Section title={`Players (${selectedPlayerIds.length}/${MAX_PLAYERS})`}>
                        {activePlayers.length === 0 ? (
                            <View style={styles.card}>
                                <Text style={{ color: MUTED }}>No players yet.</Text>
                                <View style={{ marginTop: 10 }}>
                                    <Button label="Go add a player" onPress={() => navigation.navigate('Players')} variant="blue" />
                                </View>
                            </View>
                        ) : (
                            <>
                                <TextInput
                                    value={playerSearch}
                                    onChangeText={setPlayerSearch}
                                    placeholder="Search players (name, country, code)"
                                    style={styles.input}
                                />

                                {/* Black + Blue button theme (requested) */}
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Button label="Manage players" onPress={() => navigation.navigate('Players')} variant="black" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Button
                                            label="Clear selection"
                                            onPress={clearSelection}
                                            variant="outline"
                                            disabled={selectedPlayerIds.length === 0}
                                        />
                                    </View>
                                </View>

                                <View style={{ gap: 10, marginTop: 10 }}>
                                    {filteredPlayers.map(p => {
                                        const selected = selectedPlayerIds.includes(p.id);

                                        const emoji = p.flag ? getFlagEmoji(p.flag) : '';
                                        const country = p.flag ? (getCountryName(p.flag) ?? p.flag) : undefined;

                                        return (
                                            <Pressable
                                                key={p.id}
                                                onPress={() => toggleSelect(p.id)}
                                                style={({ pressed }) => [
                                                    styles.playerRow,
                                                    selected && { borderColor: BLUE, backgroundColor: '#F3F8FF' },
                                                    pressed && { opacity: 0.9 },
                                                ]}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.playerName}>
                                                        {emoji ? `${emoji} ` : ''}
                                                        {p.name}
                                                        {p.nickname ? ` (${p.nickname})` : ''}
                                                    </Text>
                                                    <Text style={styles.playerMeta}>
                                                        {country ? `Country: ${country}` : 'Country: —'}
                                                    </Text>
                                                </View>

                                                {/* Selection indicator WITHOUT emojis */}
                                                <Text style={[styles.playerChip, selected && styles.playerChipSelected]}>
                                                    {selected ? 'Selected' : 'Tap'}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {selectedPlayerIds.length > 0 && (
                                    <View style={[styles.card, { marginTop: 10 }]}>
                                        <Text style={{ color: MUTED }}>
                                            Selected: {selectedPlayerIds.map(playerLabel).join(', ')}
                                        </Text>
                                    </View>
                                )}
                            </>
                        )}
                    </Section>

                    {gameMode === 'X01' && (
                        <>
                            <Section title="Start score">
                                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                    <Pill label="301" selected={startScore === 301} onPress={() => setStartScore(301)} />
                                    <Pill label="501" selected={startScore === 501} onPress={() => setStartScore(501)} />
                                    <Pill label="701" selected={startScore === 701} onPress={() => setStartScore(701)} />
                                </View>

                                <Text style={styles.helpText}>Custom start score (optional)</Text>
                                <TextInput
                                    value={String(startScore)}
                                    onChangeText={(t) => setStartScore(Number(t.replace(/[^0-9]/g, '')) || 0)}
                                    keyboardType="number-pad"
                                    style={styles.input}
                                />
                            </Section>

                            <Section title="Match format">
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <Pill label="Single leg" selected={formatType === 'single'} onPress={() => setFormatType('single')} />
                                    <Pill label="Best of" selected={formatType === 'bestOf'} onPress={() => setFormatType('bestOf')} />
                                </View>

                                {formatType === 'bestOf' && (
                                    <View style={{ marginTop: 10, gap: 10 }}>
                                        <Text style={styles.helpText}>Quick pick</Text>
                                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                            {[3, 5, 7, 9].map(n => (
                                                <Pill
                                                    key={n}
                                                    label={`${n}`}
                                                    selected={bestOfNormalized === n}
                                                    onPress={() => setBestOfLegs(n)}
                                                />
                                            ))}
                                        </View>

                                        <Text style={styles.helpText}>Custom “Best of”</Text>
                                        <TextInput
                                            value={String(bestOfLegs)}
                                            onChangeText={(t) => setBestOfLegs(Number(t.replace(/[^0-9]/g, '')) || 1)}
                                            keyboardType="number-pad"
                                            style={styles.input}
                                        />

                                        <Text style={{ color: MUTED }}>
                                            Will use: {bestOfNormalized} (first to {firstTo})
                                        </Text>
                                    </View>
                                )}
                            </Section>
                        </>
                    )}

                    {gameMode === 'AROUND_THE_CLOCK' && (
                        <Section title="Practice settings">
                            <Text style={styles.helpText}>Max target (usually 20)</Text>

                            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                <Pill label="20" selected={maxTarget === 20} onPress={() => setMaxTarget(20)} />
                                <Pill label="25" selected={maxTarget === 25} onPress={() => setMaxTarget(25)} />
                            </View>

                            <Text style={styles.helpText}>Custom max target</Text>
                            <TextInput
                                value={String(maxTarget)}
                                onChangeText={(t) => setMaxTarget(Number(t.replace(/[^0-9]/g, '')) || 20)}
                                keyboardType="number-pad"
                                style={styles.input}
                            />
                        </Section>
                    )}

                    {/* Spacer so scroll content doesn't hide behind fixed footer */}
                    <View style={{ height: 120 }} />
                </ScrollView>

                {/* Fixed footer: Blue start + Black back */}
                <View style={styles.footer}>
                    <Button
                        label={gameMode === 'X01' ? 'Start X01' : 'Start Practice'}
                        onPress={onStart}
                        variant="blue"
                        disabled={!canStart}
                    />

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Button label="Back" onPress={() => navigation.navigate('Home')} variant="black" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button label="Players" onPress={() => navigation.navigate('Players')} variant="outline" />
                        </View>
                    </View>

                    {!canStart && (
                        <Text style={styles.startHint}>
                            Select 1–{MAX_PLAYERS} players and complete settings
                        </Text>
                    )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        gap: 14,
    },
    pageTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: BLACK,
    },

    section: { gap: 10 },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: BLACK },

    card: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 12,
        backgroundColor: WHITE,
    },

    modeCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 12,
        backgroundColor: WHITE,
        gap: 6,
    },
    modeTitle: { fontWeight: '900', color: BLACK, fontSize: 15 },
    modeSubtitle: { color: MUTED, fontSize: 12, lineHeight: 16 },

    dot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: BORDER, // becomes BLUE if selected
    },

    input: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        padding: 10,
        backgroundColor: WHITE,
    },
    helpText: { color: MUTED, fontSize: 12 },

    playerRow: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 12,
        backgroundColor: WHITE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    playerName: { fontWeight: '900', color: BLACK, fontSize: 15 },
    playerMeta: { marginTop: 4, color: MUTED, fontSize: 12 },

    playerChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: SOFT,
        color: BLACK,
        fontWeight: '900',
        fontSize: 12,
        overflow: 'hidden',
    },
    playerChipSelected: {
        backgroundColor: BLUE,
        borderColor: BLUE,
        color: WHITE,
    },

    pill: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: WHITE,
    },
    pillText: { fontWeight: '900', color: BLACK },

    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: BORDER,
        backgroundColor: WHITE,
    },

    btn: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: { fontWeight: '900', fontSize: 15 },

    startHint: {
        textAlign: 'center',
        color: MUTED,
        fontSize: 12,
        marginTop: 2,
    },
});
