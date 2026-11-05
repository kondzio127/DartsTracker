import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { useAppTheme } from './useAppTheme';

export default function ThemedInput({ style, editable = true, ...props }: TextInputProps) {
  const theme = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      selectionColor={theme.accent}
      keyboardAppearance={theme.isDark ? 'dark' : 'light'}
      {...props}
      editable={editable}
      style={[
        { color: theme.foreground, backgroundColor: theme.surface, borderColor: theme.border },
        style,
        !editable && { color: theme.disabledForeground, backgroundColor: theme.disabledSurface },
      ]}
    />
  );
}
