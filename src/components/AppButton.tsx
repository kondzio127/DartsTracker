import React from 'react';
import ThemedButton from '../theme/ThemedButton';

// Keep existing props and sizing while sharing the theme-aware implementation.
export default function AppButton(props: React.ComponentProps<typeof ThemedButton>) {
  return <ThemedButton {...props} legacy />;
}
