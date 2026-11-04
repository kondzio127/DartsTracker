/**
 * Theme tokens are deliberately independent of React Native and Zustand.
 * Screens should use semantic colours rather than hard-coded hex values.
 */
export const THEME_IDS = [
  'neonArena',
  'clubhousePaper',
  'precisionLab',
  'tournamentBroadcast',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeTokens = {
  name: string;
  shortName: string;
  isDark: boolean;
  background: string;
  surface: string;
  surfaceRaised: string;
  foreground: string;
  muted: string;
  accent: string;
  onAccent: string;
  border: string;
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  neonArena: {
    name: 'Neon Arena',
    shortName: 'Arena',
    isDark: true,
    background: '#0B1020',
    surface: '#171F33',
    surfaceRaised: '#202B43',
    foreground: '#F6F8FC',
    muted: '#9BA9C1',
    accent: '#C7F76B',
    onAccent: '#101625',
    border: '#2A354E',
  },
  clubhousePaper: {
    name: 'Clubhouse Paper',
    shortName: 'Paper',
    isDark: false,
    background: '#F7F4ED',
    surface: '#FFFFFF',
    surfaceRaised: '#EDE8DE',
    foreground: '#17352F',
    muted: '#67776F',
    // Slightly darker than the mock-up copper for accessible white button labels.
    accent: '#B05B40',
    onAccent: '#FFFFFF',
    border: '#DED8CC',
  },
  precisionLab: {
    name: 'Precision Lab',
    shortName: 'Lab',
    isDark: true,
    background: '#101D29',
    surface: '#192C39',
    surfaceRaised: '#264251',
    foreground: '#F4FAFA',
    muted: '#9AB6C3',
    accent: '#54DFDD',
    onAccent: '#10303B',
    border: '#345464',
  },
  tournamentBroadcast: {
    name: 'Tournament Broadcast',
    shortName: 'Broadcast',
    isDark: true,
    background: '#0F1519',
    surface: '#1C252B',
    surfaceRaised: '#27333A',
    foreground: '#F9F9F4',
    muted: '#A5B3B8',
    accent: '#F3655D',
    onAccent: '#160D0E',
    border: '#45555C',
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'neonArena';

export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && THEME_IDS.some(themeId => themeId === id);
}

export function getTheme(id: unknown): ThemeTokens {
  return THEMES[isThemeId(id) ? id : DEFAULT_THEME_ID];
}
