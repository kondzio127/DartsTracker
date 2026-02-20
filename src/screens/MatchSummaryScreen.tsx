// src/screens/MatchSummaryScreen.tsx
import React, { useCallback, useLayoutEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from "../components/AppButton";

type Props = NativeStackScreenProps<RootStackParamList, 'MatchSummary'>;

export default function MatchSummaryScreen({ route, navigation }: Props) {
    const { matchId } = route.params;

    const matches = useGameStore(state => state.matches);
    const players = useGameStore(state => state.players);

    const match = matches.find(m => m.id === matchId);

    const getPlayerName = (playerId?: string) =>
        players.find(p => p.id === playerId)?.name ?? (playerId ?? 'Unknown');

    // ✅ This is the key: make Home the root so you cannot swipe back to Summary
    const goHomeReset = useCallback(() => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
        });
    }, [navigation]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: () => null,
            headerRight: () => null,
            gestureEnabled: false,
        });
    }, [navigation, goHomeReset]);

    if (!match) {
        return (
            <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Match not found.</Text>
                <AppButton label="Back to Home" onPress={goHomeReset} />
            </View>
        );
    }

    const legWins = match.legWinsByPlayer ?? {};
    const bestOfLegs = match.bestOfLegs ?? 1;

    const isSingleLeg = bestOfLegs === 1;
    const legsToWin = Math.floor(bestOfLegs / 2) + 1;

    let winnerPlayerId: string | undefined;
    let maxWins = -1;
    for (const pid of match.playerIds) {
        const wins = legWins[pid] ?? 0;
        if (wins > maxWins) {
            maxWins = wins;
            winnerPlayerId = pid;
        }
    }
    const winnerName = winnerPlayerId ? getPlayerName(winnerPlayerId) : 'N/A';

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Match Summary</Text>

            <Text>Date: {new Date(match.createdAt).toLocaleString()}</Text>
            <Text>Game mode: {match.mode}</Text>
            <Text>Start score: {match.startScore}</Text>

            {isSingleLeg ? (
                <Text>Format: Single leg</Text>
            ) : (
                <Text>Format: Best of {bestOfLegs} legs (first to {legsToWin})</Text>
            )}

            <Text>Legs played: {match.legs.length}</Text>
            <Text>Number of players: {match.playerIds.length}</Text>

            <View style={{ marginTop: 12 }}>
                <Text style={{ fontWeight: '600' }}>Players & leg wins:</Text>
                {match.playerIds.map(pid => (
                    <Text key={pid}>
                        - {getPlayerName(pid)} – legs won: {legWins[pid] ?? 0}
                    </Text>
                ))}
            </View>

            <View style={{ marginTop: 16 }}>
                <Text style={{ fontWeight: '600' }}>Legs:</Text>
                {match.legs.length === 0 && <Text>No legs recorded.</Text>}
                {match.legs.map(leg => (
                    <View key={leg.id} style={{ marginVertical: 4 }}>
                        <Text>
                            Leg {leg.sequence}: Starter: {getPlayerName(leg.startingPlayerId)} | Winner:{' '}
                            {getPlayerName(leg.winnerPlayerId)}
                        </Text>
                    </View>
                ))}
            </View>

            <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '700' }}>
                Winner: {winnerName}
            </Text>

            <View style={{ marginTop: 24, gap: 8 }}>
                {/* ✅ Also reset here */}
                <AppButton label="Back to Home" onPress={goHomeReset} />
            </View>
        </ScrollView>
    );
}
