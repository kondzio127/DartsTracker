// src/navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import NewMatchScreen from '../screens/NewMatchScreen';
import ScoreboardScreen from '../screens/ScoreboardScreen';
import MatchSummaryScreen from '../screens/MatchSummaryScreen';

// All possible screens + their params
export type RootStackParamList = {
    Home: undefined;
    NewMatch: undefined;
    Scoreboard: undefined;
    MatchSummary: { matchId: string };
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
            </Stack.Navigator>
        </NavigationContainer>
    );
}
