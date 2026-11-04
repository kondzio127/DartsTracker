import { useThemeStore } from './themeStore';
import { getTheme } from './themes';

/** Subscribe only to the selected theme, not to unrelated game state. */
export function useAppTheme() {
  const themeId = useThemeStore(state => state.themeId);
  return getTheme(themeId);
}
