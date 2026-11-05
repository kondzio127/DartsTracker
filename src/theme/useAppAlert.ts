import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAppTheme } from './useAppTheme';

// iOS supports an explicit appearance; Android keeps its native, readable dialog.
// Preserve native cancellation, button callbacks and accessibility behaviour.
export function useAppAlert() {
  const { isDark } = useAppTheme();
  return useCallback((...args: Parameters<typeof Alert.alert>) => {
    const [title, message, buttons, options] = args;
    Alert.alert(title, message, buttons, {
      userInterfaceStyle: isDark ? 'dark' : 'light',
      ...options,
    });
  }, [isDark]);
}
