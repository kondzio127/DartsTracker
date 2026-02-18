// src/navigation/types.ts

export type RootStackParamList = {
    Home: undefined;
    NewMatch: undefined;
    Scoreboard: undefined;
    MatchSummary: { matchId: string };
};
