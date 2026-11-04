import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_THEME_ID, isThemeId, ThemeId } from './themes';

type ThemePreferences = {
  themeId: ThemeId;
  setTheme: (themeId: ThemeId) => void;
};

/**
 * Store appearance preferences separately from match data.
 * The scoring store can move to SQLite later without touching this setting.
 */
export const useThemeStore = create<ThemePreferences>()(
  persist(
    set => ({
      themeId: DEFAULT_THEME_ID,
      setTheme: themeId => {
        if (isThemeId(themeId)) set({ themeId });
      },
    }),
    {
      name: 'darts-tracker-theme-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ themeId: state.themeId }),
      merge: (persisted, current) => {
        const themeId = (persisted as Partial<ThemePreferences> | undefined)?.themeId;
        return { ...current, themeId: isThemeId(themeId) ? themeId : DEFAULT_THEME_ID };
      },
    },
  ),
);
