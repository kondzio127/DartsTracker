// src/screens/HomeScreen.tsx
import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemePicker from '../theme/ThemePicker';
import { useAppTheme } from '../theme/useAppTheme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import ThemedButton from '../theme/ThemedButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const isFocused = useIsFocused();
    const playersCount = useGameStore(s => s.players.filter(p => !p.isHidden).length);
    const matchesCount = useGameStore(s => s.matches.filter(m => m.status === 'COMPLETED').length);
    const hasActiveMatch = useGameStore(s => Boolean(s.currentMatch && s.currentLegState && s.currentLegId));
    const hasActivePractice = useGameStore(
        s => s.aroundTheClockPlayerIds.length > 0 && !s.aroundTheClockWinnerPlayerId
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
            {isFocused && <StatusBar style={theme.isDark ? 'light' : 'dark'} />}
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12, justifyContent: 'center' }}>
                <Text style={{ color: theme.foreground, fontSize: 26, fontWeight: '700' }}>Darts Tracker</Text>

                <Text style={{ color: theme.muted }}>
                    Players: {playersCount} | Matches: {matchesCount}
                </Text>

                <View style={{ gap: 10, marginTop: 16 }}>
                    <ThemedButton label="New Game" onPress={() => navigation.navigate('NewMatch')} />
                    <ThemedButton label="Players" variant="secondary" onPress={() => navigation.navigate('Players')} />
                    <ThemedButton label="History" variant="secondary" onPress={() => navigation.navigate('History')} />

                    {hasActiveMatch && (
                        <ThemedButton
                            label="Resume X01 Match"
                            variant="primary"
                            onPress={() => navigation.navigate('Scoreboard')}
                        />
                    )}

                    {hasActivePractice && (
                        <ThemedButton
                            label="Resume Around the Clock"
                            variant="primary"
                            onPress={() => navigation.navigate('AroundTheClock')}
                        />
                    )}
                </View>
                <ThemePicker />
            </ScrollView>
        </SafeAreaView>
    );
}
