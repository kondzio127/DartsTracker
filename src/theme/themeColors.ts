import { ThemeTokens } from './themes';

export function buttonColors(theme: ThemeTokens, variant: 'primary' | 'secondary' | 'ghost' | 'danger', disabled = false) {
  if (disabled) return { background: theme.disabledSurface, foreground: theme.disabledForeground, border: theme.border };
  if (variant === 'primary') return { background: theme.accent, foreground: theme.onAccent, border: theme.accent };
  if (variant === 'danger') return { background: theme.danger, foreground: theme.onDanger, border: theme.danger };
  if (variant === 'ghost') return { background: 'transparent', foreground: theme.foreground, border: 'transparent' };
  return { background: theme.surfaceRaised, foreground: theme.foreground, border: theme.border };
}

export function navigationColors(theme: ThemeTokens) {
  return {
    primary: theme.accent, background: theme.background, card: theme.surface,
    text: theme.foreground, border: theme.border, notification: theme.danger,
  };
}
