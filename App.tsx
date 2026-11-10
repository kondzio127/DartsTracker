import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { getGameHydrationStatus, subscribeGameHydrationStatus, retryGameHydration } from './src/store/gameStore';
import { useAppTheme } from './src/theme/useAppTheme';
import ThemedButton from './src/theme/ThemedButton';

export default function App() {
    const hydration = useSyncExternalStore(subscribeGameHydrationStatus, getGameHydrationStatus, getGameHydrationStatus);
    const theme = useAppTheme();
    if (hydration.status === 'ready') return <RootNavigator />;

    return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: theme.background }}>
            {hydration.status === 'loading' ? (
                <>
                    <ActivityIndicator color={theme.accent} accessibilityLabel="Loading saved game" />
                    <Text style={{ color: theme.foreground, textAlign: 'center' }}>Loading saved game?</Text>
                </>
            ) : (
                <>
                    <Text accessibilityRole="alert" style={{ color: theme.foreground, textAlign: 'center' }}>
                        Saved game data could not be loaded safely. Please retry before continuing.
                    </Text>
                    <ThemedButton label="Retry" onPress={() => { void retryGameHydration(); }} />
                </>
            )}
        </View>
    );
}
