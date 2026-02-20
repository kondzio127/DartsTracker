// src/navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import NewMatchScreen from '../screens/NewMatchScreen';
import ScoreboardScreen from '../screens/ScoreboardScreen';
import MatchSummaryScreen from '../screens/MatchSummaryScreen';
import AroundTheClockScreen from '../screens/AroundTheClockScreen';
import AroundTheClockSummaryScreen from '../screens/AroundTheClockSummaryScreen';
import PlayersScreen from '../screens/PlayersScreen';
import PlayerFormScreen from '../screens/PlayerFormScreen';
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

    Players: undefined;
    PlayerForm: { playerId?: string } | undefined;

    History: undefined;
    MatchDetail: { matchId: string };
    LegDetail: { matchId: string; legId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator initialRouteName="Home">
                {/* Home: no header */}
                <Stack.Screen
                    name="Home"
                    component={HomeScreen}
                    options={{ headerShown: false }}
                />

                {/* Normal drill-in screens: back is appropriate */}
                <Stack.Screen name="NewMatch" component={NewMatchScreen} options={{ title: 'New Game' }} />
                <Stack.Screen name="Players" component={PlayersScreen} options={{ title: 'Players' }} />
                <Stack.Screen name="PlayerForm" component={PlayerFormScreen} options={{ title: 'Player' }} />
                <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
                <Stack.Screen name="MatchDetail" component={MatchDetailScreen} options={{ title: 'Match' }} />
                <Stack.Screen name="LegDetail" component={LegDetailScreen} options={{ title: 'Leg' }} />

                {/* Stateful/terminal screens: hide back arrow + disable swipe-back */}
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
