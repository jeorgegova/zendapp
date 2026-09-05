import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { apple } from '../theme/appleTheme';

export function AppleCard({ children, style, padded = true, bordered = true, shadow = true, shadowLevel = 'subtle' }) {
  const shadowStyle = shadow ? apple.shadow[shadowLevel] || apple.shadow.card : null;
  return (
    <View style={[styles.card, bordered && apple.border.card, shadowStyle, padded && { padding: 16 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.l,
    overflow: 'hidden',
  },
});
