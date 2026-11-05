// src/navigation/RootNavigator.tsx
import React from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme/useAppTheme';
import { navigationColors } from '../theme/themeColors';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import NewMatchScreen from '../screens/NewMatchScreen';
import ScoreboardScreen from '../screens/ScoreboardScreen';
import MatchSummaryScreen from '../screens/MatchSummaryScreen';
import AroundTheClockScreen from '../screens/AroundTheClockScreen';
import AroundTheClockSummaryScreen from '../screens/AroundTheClockSummaryScreen';
import AroundTheClockDetailScreen from '../screens/AroundTheClockDetailScreen';
import PlayersScreen from '../screens/PlayersScreen';
import PlayerFormScreen from '../screens/PlayerFormScreen';
import PlayerStatsScreen from '../screens/PlayerStatsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';
import LegDetailScreen from '../screens/LegDetailScreen';

export type RootStackParamList = {
    Home: undefined;
    NewMatch: undefined;
    Scoreboard: undefined;
    MatchSummary: { matchId: string };
    AroundTheClock: undefined;
    AroundTheClockSummary: undefined;
    AroundTheClockDetail: { sessionId: string };

    Players: undefined;
    PlayerForm: { playerId?: string } | undefined;
    PlayerStats: { playerId: string };

    History: undefined;
    MatchDetail: { matchId: string };
    LegDetail: { matchId: string; legId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const theme = useAppTheme();
    return (
        <NavigationContainer theme={{ ...DefaultTheme, dark: theme.isDark, colors: navigationColors(theme) }}>
            <StatusBar style={theme.isDark ? 'light' : 'dark'} />
            <Stack.Navigator initialRouteName="Home" screenOptions={{
                headerStyle: { backgroundColor: theme.surface },
                headerTintColor: theme.foreground,
                contentStyle: { backgroundColor: theme.background },
                statusBarStyle: theme.isDark ? 'light' : 'dark',
            }}>
                <Stack.Screen
                    name="Home"
                    component={HomeScreen}
                    options={{ headerShown: false }}
                />

                <Stack.Screen name="NewMatch" component={NewMatchScreen} options={{ title: 'New Game' }} />
                <Stack.Screen name="Players" component={PlayersScreen} options={{ title: 'Players' }} />
                <Stack.Screen name="PlayerForm" component={PlayerFormScreen} options={{ title: 'Player' }} />
                <Stack.Screen name="PlayerStats" component={PlayerStatsScreen} options={{ title: 'Player Stats' }} />
                <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
                <Stack.Screen name="MatchDetail" component={MatchDetailScreen} options={{ title: 'Match' }} />
                <Stack.Screen name="LegDetail" component={LegDetailScreen} options={{ title: 'Leg' }} />
                <Stack.Screen
                    name="AroundTheClockDetail"
                    component={AroundTheClockDetailScreen}
                    options={{ title: 'Practice Session' }}
                />

                <Stack.Screen
                    name="Scoreboard"
                    component={ScoreboardScreen}
                    options={{
                        title: 'Scoreboard',
                        headerBackVisible: false,
                        gestureEnabled: false,
                    }}
                />
                <Stack.Screen
                    name="AroundTheClock"
                    component={AroundTheClockScreen}
                    options={{
                        title: 'Around the Clock',
                        headerBackVisible: false,
                        gestureEnabled: false,
                    }}
                />
                <Stack.Screen
                    name="MatchSummary"
                    component={MatchSummaryScreen}
                    options={{
                        title: 'Summary',
                        headerBackVisible: false,
                        gestureEnabled: false,
                    }}
                />
                <Stack.Screen
                    name="AroundTheClockSummary"
                    component={AroundTheClockSummaryScreen}
                    options={{
                        title: 'Summary',
                        headerBackVisible: false,
                        gestureEnabled: false,
                    }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
