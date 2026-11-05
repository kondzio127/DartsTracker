import React from 'react';
import { Pressable, StyleProp, Text, ViewStyle, PressableProps } from 'react-native';

import { useAppTheme } from './useAppTheme';
import { buttonColors } from './themeColors';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
  onLongPress?: PressableProps['onLongPress'];
  delayLongPress?: number;
  compact?: boolean;
  legacy?: boolean;
};

/**
 * Shared colours with sizing options to preserve existing screen layouts.
 */
export default function ThemedButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
  onLongPress,
  delayLongPress,
  compact = false,
  legacy = false,
}: Props) {
  const theme = useAppTheme();
  const { background, foreground, border } = buttonColors(theme, variant, disabled);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={({ pressed }) => [
        {
          minHeight: compact || legacy ? undefined : 48,
          paddingHorizontal: compact ? 10 : legacy ? 14 : 16,
          paddingVertical: compact ? 8 : legacy ? 12 : 13,
          borderRadius: legacy ? 12 : 14,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: background,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: pressed && !disabled ? 0.82 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: foreground,
          fontSize: compact ? 13 : legacy ? 16 : 15,
          fontWeight: legacy ? '600' : '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
