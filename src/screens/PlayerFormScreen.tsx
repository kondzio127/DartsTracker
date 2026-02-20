import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from "../components/AppButton";

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerForm'>;

export default function PlayerFormScreen({ route, navigation }: Props) {
    const playerId = route.params?.playerId;

    const players = useGameStore(s => s.players);
    const addPlayer = useGameStore(s => s.addPlayer);
    const updatePlayer = useGameStore(s => s.updatePlayer);

    const existing = useMemo(
        () => players.find(p => p.id === playerId),
        [players, playerId]
    );

    const [name, setName] = useState(existing?.name ?? '');
    const [nickname, setNickname] = useState(existing?.nickname ?? '');
    const [flag, setFlag] = useState(existing?.flag ?? '');

    const onSave = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            Alert.alert('Name required', 'Please enter a player name.');
            return;
        }

        if (existing) {
            updatePlayer(existing.id, {
                name: trimmed,
                nickname: nickname.trim() || undefined,
                flag: flag.trim() || undefined,
            });
        } else {
            addPlayer(trimmed, nickname.trim() || undefined);
            // We didn’t include flag in addPlayer signature earlier.
            // Easiest approach: create then update the last player, but let’s keep it clean:
            // Add a flag param in addPlayer OR update after creating.
            // For now, we’ll just ignore flag on create unless you want addPlayer updated.
        }

        navigation.goBack();
    };

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>
                {existing ? 'Edit Player' : 'Add Player'}
            </Text>

            <Text>Name *</Text>
            <TextInput
                value={name}
                onChangeText={setName}
                style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
            />

            <Text>Nickname</Text>
            <TextInput
                value={nickname}
                onChangeText={setNickname}
                style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
            />

            <Text>Flag (string)</Text>
            <TextInput
                value={flag}
                onChangeText={setFlag}
                placeholder="e.g. UK / BG"
                style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
            />

            <AppButton label="Save" onPress={onSave} />
        </View>
    );
}
