// src/screens/PlayerFormScreen.tsx
import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Alert,
    Modal,
    FlatList,
    Pressable,
    SafeAreaView,
    StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useGameStore } from '../store/gameStore';
import AppButton from '../components/AppButton';
import {
    COUNTRY_OPTIONS,
    getCountryLabel,
    normalizeCountryCode,
    CountryOption,
} from '../utils/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerForm'>;

export default function PlayerFormScreen({ route, navigation }: Props) {
    /**
     * If you navigate with:
     * navigation.navigate('PlayerForm', { playerId: '...' })
     * then we’re editing; otherwise we’re creating.
     */
    const playerId = route.params?.playerId;

    // Pull what we need from the store
    const players = useGameStore(s => s.players);
    const addPlayer = useGameStore(s => s.addPlayer);
    const updatePlayer = useGameStore(s => s.updatePlayer);

    // Existing player (if editing)
    const existing = useMemo(
        () => players.find(p => p.id === playerId),
        [players, playerId]
    );

    // Form state
    const [name, setName] = useState(existing?.name ?? '');
    const [nickname, setNickname] = useState(existing?.nickname ?? '');
    const [flagCode, setFlagCode] = useState(existing?.flag ?? '');

    // Picker state
    const [pickerOpen, setPickerOpen] = useState(false);
    const [query, setQuery] = useState('');

    /**
     * Search filtering:
     * - Search by country name ("Bulgaria")
     * - or by ISO2 code ("BG")
     */
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return COUNTRY_OPTIONS;

        return COUNTRY_OPTIONS.filter((c) => {
            return (
                c.name.toLowerCase().includes(q) ||
                c.code.toLowerCase().includes(q)
            );
        });
    }, [query]);

    // User picks a country
    const onPick = (c: CountryOption) => {
        setFlagCode(c.code);
        setPickerOpen(false);
        setQuery('');
    };

    // User clears a country
    const onClearFlag = () => {
        setFlagCode('');
        setPickerOpen(false);
        setQuery('');
    };

    // Save player
    const onSave = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            Alert.alert('Name required', 'Please enter a player name.');
            return;
        }

        const nick = nickname.trim() || undefined;

        /**
         * Normalize the code so things like "uk" become "GB".
         * If it fails validation, we store undefined (no flag).
         */
        const normFlag = normalizeCountryCode(flagCode);

        if (existing) {
            updatePlayer(existing.id, {
                name: trimmed,
                nickname: nick,
                flag: normFlag || undefined,
            });
        } else {
            // IMPORTANT: make sure your store addPlayer supports (name, nickname, flag)
            addPlayer(trimmed, nick, normFlag || undefined);
        }

        navigation.goBack();
    };

    return (
        <View style={styles.screen}>
            <Text style={styles.title}>
                {existing ? 'Edit Player' : 'Add Player'}
            </Text>

            <Text style={styles.label}>Name *</Text>
            <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="e.g. Konrad"
            />

            <Text style={styles.label}>Nickname</Text>
            <TextInput
                value={nickname}
                onChangeText={setNickname}
                style={styles.input}
                placeholder="Optional"
            />

            <Text style={styles.label}>Flag</Text>

            {/* Pressable “field” that opens the searchable picker */}
            <Pressable
                onPress={() => setPickerOpen(true)}
                style={({ pressed }) => [
                    styles.flagField,
                    pressed && { opacity: 0.85 },
                ]}
            >
                <Text style={styles.flagFieldText}>
                    {flagCode ? getCountryLabel(flagCode) : 'Select country / flag'}
                </Text>
                <Text style={styles.hint}>
                    Tap to search and pick a flag.
                </Text>
            </Pressable>

            <AppButton label="Save" onPress={onSave} />

            {/* Modal flag picker */}
            <Modal
                visible={pickerOpen}
                animationType="slide"
                onRequestClose={() => setPickerOpen(false)}
            >
                <SafeAreaView style={styles.modal}>
                    <Text style={styles.modalTitle}>Select flag</Text>

                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search (e.g. Bulgaria / BG / UK)"
                        style={styles.input}
                    />

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <AppButton label="Cancel" onPress={() => setPickerOpen(false)} />
                        <AppButton label="Clear" onPress={onClearFlag} />
                    </View>

                    <FlatList
                        data={filtered}
                        keyExtractor={(item) => item.code}
                        keyboardShouldPersistTaps="handled"
                        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                        renderItem={({ item }) => (
                            <Pressable
                                onPress={() => onPick(item)}
                                style={({ pressed }) => [
                                    styles.countryRow,
                                    pressed && { opacity: 0.85 },
                                ]}
                            >
                                <Text style={styles.countryLeft}>
                                    {item.emoji} {item.name}
                                </Text>
                                <Text style={styles.countryRight}>{item.code}</Text>
                            </Pressable>
                        )}
                    />
                </SafeAreaView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, padding: 16, gap: 12 },
    title: { fontSize: 20, fontWeight: '700' },
    label: { fontWeight: '700' },
    hint: { marginTop: 4, opacity: 0.65 },

    input: { borderWidth: 1, borderRadius: 10, padding: 10 },

    flagField: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
    },
    flagFieldText: { fontWeight: '800' },

    modal: { flex: 1, padding: 16, gap: 10 },
    modalTitle: { fontSize: 18, fontWeight: '800' },

    countryRow: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    countryLeft: { fontSize: 16, fontWeight: '700' },
    countryRight: { opacity: 0.7, fontWeight: '800' },
});
