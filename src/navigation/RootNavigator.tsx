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

// All possible screens + their params
export type RootStackParamList = {
    Home: undefined;
    NewMatch: undefined;
    Scoreboard: undefined;
    MatchSummary: { matchId: string };
    AroundTheClock: undefined;
    AroundTheClockSummary: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator initialRouteName="Home">
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="NewMatch" component={NewMatchScreen} />
                <Stack.Screen name="Scoreboard" component={ScoreboardScreen} />
                <Stack.Screen name="MatchSummary" component={MatchSummaryScreen} />
                <Stack.Screen name="AroundTheClock" component={AroundTheClockScreen} />
                <Stack.Screen
                    name="AroundTheClockSummary"
                    component={AroundTheClockSummaryScreen}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
