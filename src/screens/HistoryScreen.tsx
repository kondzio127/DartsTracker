import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import { getMatchWinnerId } from '../utils/stats';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

type ModeFilter = 'ALL' | 'X01' | 'PRACTICE';
type PlayerFilter = 'ALL' | string;

type HistoryItem =
    | { kind: 'match'; id: string; date: string }
    | { kind: 'practice'; id: string; date: string };

export default function HistoryScreen({ navigation }: Props) {
    const matches = useGameStore(s => s.matches);
    const players = useGameStore(s => s.players);
    const aroundTheClockSessions = useGameStore(s => s.aroundTheClockSessions);

    const activePlayers = useMemo(
        () => players.filter(p => !p.isHidden).sort((a, b) => a.name.localeCompare(b.name)),
        [players]
    );

    const [mode, setMode] = useState<ModeFilter>('ALL');
    const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('ALL');

    const playerName = (id: string) => players.find(p => p.id === id)?.name ?? 'Unknown';

    const items = useMemo(() => {
        const list: { kind: 'match' | 'practice'; id: string; date: string }[] = [];

        if (mode === 'ALL' || mode === 'X01') {
            for (const m of matches) {
                // show finished matches first; you can remove this if you want in-progress too
                list.push({ kind: 'match', id: m.id, date: m.createdAt });
            }
        }

        if (mode === 'ALL' || mode === 'PRACTICE') {
            for (const s of aroundTheClockSessions) {
                list.push({ kind: 'practice', id: s.id, date: s.finishedAt });
            }
        }

        // apply player filter
        const filtered = list.filter(item => {
            if (playerFilter === 'ALL') return true;
            if (item.kind === 'match') {
                const match = matches.find(m => m.id === item.id);
                return match ? match.playerIds.includes(playerFilter) : false;
            } else {
                const sess = aroundTheClockSessions.find(s => s.id === item.id);
                return sess?.playerId === playerFilter;
            }
        });

        // sort newest first
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return filtered;
    }, [mode, playerFilter, matches, aroundTheClockSessions]);

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>History</Text>

            {/* Mode filter */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['ALL','X01','PRACTICE'] as ModeFilter[]).map(m => (
                    <Pressable key={m} onPress={() => setMode(m)} style={{ borderWidth: 1, padding: 8, borderRadius: 10, opacity: mode === m ? 1 : 0.6 }}>
                        <Text>{m}</Text>
                    </Pressable>
                ))}
            </View>

            {/* Player filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => setPlayerFilter('ALL')} style={{ borderWidth: 1, padding: 8, borderRadius: 10, opacity: playerFilter === 'ALL' ? 1 : 0.6 }}>
                        <Text>All players</Text>
                    </Pressable>

                    {activePlayers.map(p => (
                        <Pressable key={p.id} onPress={() => setPlayerFilter(p.id)} style={{ borderWidth: 1, padding: 8, borderRadius: 10, opacity: playerFilter === p.id ? 1 : 0.6 }}>
                            <Text>{p.name}</Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>

            <FlatList
                data={items}
                keyExtractor={(it) => `${it.kind}:${it.id}`}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => {
                    if (item.kind === 'match') {
                        const match = matches.find(m => m.id === item.id);
                        if (!match) return null;
                        const winnerId = getMatchWinnerId(match);
                        const winner = winnerId ? playerName(winnerId) : '—';
                        const playersStr = match.playerIds.map(playerName).join(' vs ');

                        return (
                            <Pressable
                                onPress={() => navigation.navigate('MatchDetail', { matchId: match.id })}
                                style={{ borderWidth: 1, borderRadius: 10, padding: 12 }}
                            >
                                <Text style={{ fontWeight: '700' }}>
                                    {new Date(match.createdAt).toLocaleString()}
                                </Text>
                                <Text>Mode: {match.mode}</Text>
                                <Text>Players: {playersStr}</Text>
                                <Text>Winner: {winner}</Text>
                            </Pressable>
                        );
                    }

                    const sess = aroundTheClockSessions.find(s => s.id === item.id);
                    if (!sess) return null;

                    return (
                        <View style={{ borderWidth: 1, borderRadius: 10, padding: 12 }}>
                            <Text style={{ fontWeight: '700' }}>
                                {new Date(sess.finishedAt).toLocaleString()}
                            </Text>
                            <Text>Mode: PRACTICE (Around the Clock)</Text>
                            <Text>Player: {sess.playerId ? playerName(sess.playerId) : '—'}</Text>
                            <Text>Darts thrown: {sess.dartsThrown}</Text>
                            <Text>Best streak: {sess.bestStreak}</Text>
                        </View>
                    );
                }}
            />
        </View>
    );
}
