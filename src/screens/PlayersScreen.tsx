import React from 'react';
import { View, Text, Button, FlatList, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Players'>;

export default function PlayersScreen({ navigation }: Props) {
    const players = useGameStore(s => s.players);
    const togglePlayerHidden = useGameStore(s => s.togglePlayerHidden);

    const visiblePlayers = [...players].sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    return (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Players</Text>

            <Button title="Add player" onPress={() => navigation.navigate('PlayerForm')} />

            <FlatList
                data={visiblePlayers}
                keyExtractor={(p) => p.id}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => (
                    <View style={{ borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600' }}>
                            {item.name} {item.nickname ? `(${item.nickname})` : ''}
                        </Text>
                        <Text style={{ opacity: 0.8 }}>
                            Flag: {item.flag ?? '—'} | Status: {item.isHidden ? 'Hidden' : 'Active'}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable
                                onPress={() => navigation.navigate('PlayerForm', { playerId: item.id })}
                                style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 }}
                            >
                                <Text>Edit</Text>
                            </Pressable>

                            <Pressable
                                onPress={() => togglePlayerHidden(item.id)}
                                style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 }}
                            >
                                <Text>{item.isHidden ? 'Unhide' : 'Hide'}</Text>
                            </Pressable>
                        </View>
                    </View>
                )}
            />
        </View>
    );
}
