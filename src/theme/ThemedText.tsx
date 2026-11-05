import React from 'react';
import { Text, TextProps } from 'react-native';
import { useAppTheme } from './useAppTheme';

export default function ThemedText({ style, ...props }: TextProps) {
  const theme = useAppTheme();
  return <Text {...props} style={[{ color: theme.foreground }, style]} />;
}
