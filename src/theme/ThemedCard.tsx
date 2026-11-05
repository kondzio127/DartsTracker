import React from 'react';
import { View, ViewProps } from 'react-native';
import { useAppTheme } from './useAppTheme';

// Keep spacing and shape with the caller so existing layouts stay intact.
export default function ThemedCard({ style, ...props }: ViewProps) {
  const theme = useAppTheme();
  return <View {...props} style={[{ backgroundColor: theme.surface, borderColor: theme.border }, style]} />;
}
