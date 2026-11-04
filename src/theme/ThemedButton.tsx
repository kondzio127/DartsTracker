import React from 'react';
import { Pressable, StyleProp, Text, ViewStyle } from 'react-native';

import { useAppTheme } from './useAppTheme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

/**
 * New screens use this button while existing screens keep AppButton.
 * Once each old screen is themed, we can consolidate to one button component.
 */
export default function ThemedButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}: Props) {
  const theme = useAppTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingHorizontal: 16,
          paddingVertical: 13,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: primary ? theme.accent : theme.border,
          backgroundColor: primary ? theme.accent : theme.surfaceRaised,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: primary ? theme.onAccent : theme.foreground,
          fontSize: 15,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
