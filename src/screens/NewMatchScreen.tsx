// src/screens/NewMatchScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMatch'>;

export default function NewMatchScreen({ navigation }: Props) {
    const [player1, setPlayer1] = useState('');
    const [player2, setPlayer2] = useState('');

    return (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>New Match</Text>

            <TextInput
                placeholder="Player 1 name"
                value={player1}
                onChangeText={setPlayer1}
                style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}
            />
            <TextInput
                placeholder="Player 2 name"
                value={player2}
                onChangeText={setPlayer2}
                style={{ borderWidth: 1, borderRadius: 8, padding: 8 }}
            />

            <Button title="Back to Home" onPress={() => navigation.goBack()} />
        </View>
    );
}
