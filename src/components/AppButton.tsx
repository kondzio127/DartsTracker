// src/components/AppButton.tsx
import React from 'react';
import { Pressable, Text, ViewStyle, StyleSheet } from 'react-native';

type Variant = 'primary' | 'secondary' | 'ghost';

export default function AppButton({
                                      label,
                                      onPress,
                                      disabled,
                                      variant = 'primary',
                                      style,
                                  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: Variant;
    style?: ViewStyle;
}) {
    return (
        <Pressable
            onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
    ]}
>
    <Text
        style={[
            styles.textBase,
        variant === 'primary' && styles.textPrimary,
    variant !== 'primary' && styles.textNonPrimary,
    disabled && styles.textDisabled,
]}
>
    {label}
    </Text>
    </Pressable>
);
}

const styles = StyleSheet.create({
    base: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primary: {
        backgroundColor: '#111',
        borderColor: '#111',
    },
    secondary: {
        backgroundColor: '#fff',
        borderColor: '#111',
    },
    ghost: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
    },
    pressed: {
        opacity: 0.85,
    },
    disabled: {
        opacity: 0.45,
    },
    textBase: {
        fontSize: 16,
        fontWeight: '600',
    },
    textPrimary: {
        color: '#fff',
    },
    textNonPrimary: {
        color: '#111',
    },
    textDisabled: {
        color: '#666',
    },
});
