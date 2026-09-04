import React, { useRef } from 'react';
import { Pressable, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { apple } from '../theme/appleTheme';

export function AppleButton({ title, onPress, variant = 'primary', loading = false, disabled = false, icon, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const isPrimary = variant === 'primary';
  const isDestructive = variant === 'destructive';
  const bg = disabled ? '#C7C7CC' : isPrimary ? apple.colors.blue : isDestructive ? apple.colors.danger : apple.colors.fill;
  const color = isPrimary || isDestructive ? '#fff' : apple.colors.blue;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        disabled={disabled || loading}
        style={[styles.btn, { backgroundColor: bg }, disabled && { opacity: 0.6 }]}
      >
        {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.text, { color }]}>{title}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: apple.radius.s,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  text: { fontSize: 17, fontWeight: '600', letterSpacing: -0.41 },
});
