// src/screens/HomeScreen.tsx
import React from 'react';
import { View, Text} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useGameStore } from '../store/gameStore';
import AppButton from "../components/AppButton";

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
    // Read some bits of state and actions from the store
    const players = useGameStore(state => state.players);
    const matches = useGameStore(state => state.matches);
    const addPlayer = useGameStore(state => state.addPlayer);
    const startMatch = useGameStore(state => state.startMatch);

    const handleAddDummyPlayer = () => {
        addPlayer(`Player ${players.length + 1}`);
    };

    const handleStartDummyMatch = () => {
        if (players.length < 2) {
            console.log('Need at least 2 players to start a match');
            return;
        }

        const firstTwoIds = players.slice(0, 2).map(p => p.id);

        startMatch({
            playerIds: firstTwoIds,
            startScore: 501,
            bestOfLegs: 1, // single-leg for now
        });

        navigation.navigate('Scoreboard');
    };

    return (
        <View style={{ flex: 1, padding: 16, justifyContent: 'center', gap: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: '600', marginBottom: 16 }}>
                Darts Tracker MVP
            </Text>

            <Text>Players: {players.length}</Text>
            <Text>Matches: {matches.length}</Text>

            <AppButton
                label="Add dummy player"
                onPress={handleAddDummyPlayer}
            />

            <AppButton
                label="Start dummy match (first 2 players)"
                onPress={handleStartDummyMatch}
            />

            <AppButton
                label="Go to New Match"
                onPress={() => navigation.navigate('NewMatch')}
            />
            <AppButton label="Players" onPress={() => navigation.navigate('Players')} />
            <AppButton label="History" onPress={() => navigation.navigate('History')} />
            <AppButton label="New Game" onPress={() => navigation.navigate('NewMatch')} />

        </View>
    );
}

