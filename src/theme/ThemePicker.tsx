import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { THEME_IDS, THEMES } from './themes';
import { useThemeStore } from './themeStore';
import { useAppTheme } from './useAppTheme';

/** Temporary Home-screen entry point; move into Settings later. */
export default function ThemePicker() {
  const currentId = useThemeStore(state => state.themeId);
  const setTheme = useThemeStore(state => state.setTheme);
  const theme = useAppTheme();

  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{ color: theme.muted, fontWeight: '700', fontSize: 12, letterSpacing: 0.6 }}
      >
        CHOOSE YOUR THEME
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {THEME_IDS.map(id => {
          const option = THEMES[id];
          const selected = id === currentId;
          return (
            <Pressable
              key={id}
              onPress={() => setTheme(id)}
              accessibilityRole="radio"
              accessibilityLabel={option.name}
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => ({
                width: '48%',
                minHeight: 51,
                paddingHorizontal: 12,
                borderRadius: 13,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: theme.surface,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 9,
                  backgroundColor: option.accent,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              />
              <Text
                style={{ color: theme.foreground, fontSize: 13, fontWeight: selected ? '700' : '500', flexShrink: 1 }}
              >
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
