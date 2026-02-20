// src/screens/HomeScreen.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from '../components/AppButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
    const playersCount = useGameStore(s => s.players.filter(p => !p.isHidden).length);
    const matchesCount = useGameStore(s => s.matches.length);
    const hasActiveMatch = useGameStore(s => Boolean(s.currentMatch && s.currentLegState));

    return (
        <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '700' }}>Darts Tracker</Text>

            <Text style={{ opacity: 0.8 }}>
                Players: {playersCount} • Matches: {matchesCount}
            </Text>

            <View style={{ gap: 10, marginTop: 16 }}>
                <AppButton label="New Game" onPress={() => navigation.navigate('NewMatch')} />
                <AppButton label="Players" variant="secondary" onPress={() => navigation.navigate('Players')} />
                <AppButton label="History" variant="secondary" onPress={() => navigation.navigate('History')} />

                {hasActiveMatch && (
                    <AppButton label="Resume Match" variant="primary" onPress={() => navigation.navigate('Scoreboard')} />
                )}
            </View>
        </View>
    );
}
