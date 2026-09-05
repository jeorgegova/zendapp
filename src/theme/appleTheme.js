import { Platform } from 'react-native';

/**
 * Apple HIG inspired theme - iOS 17 style
 * System colors, SF typography scale, rounded corners, subtle shadows
 * iOS usa shadow*, Android usa elevation
 */
export const apple = {
  colors: {
    // Backgrounds
    bg: '#F5F5F7', // Apple light gray
    bgGrouped: '#F2F2F7',
    card: '#FFFFFF',
    // Accent - Apple blue
    blue: '#007AFF',
    bluePressed: '#0051D5',
    blueLight: '#E8F0FE',
    // Semantic
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',
    // Neutrals (Apple gray palette)
    label: '#1D1D1F',
    secondaryLabel: '#6E6E73',
    tertiaryLabel: '#8E8E93',
    separator: '#E5E5EA',
    separator2: '#D1D1D6',
    fill: '#F2F2F7',
    // Tab bar
    tabBg: 'rgba(249,249,249,0.94)',
  },
  radius: {
    xs: 8,
    s: 12,
    m: 16,
    l: 20,
    xl: 28,
    pill: 999,
  },
  spacing: {
    xs: 4,
    s: 8,
    m: 12,
    l: 16,
    xl: 20,
    xxl: 28,
  },
  typography: {
    largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.37, color: '#1D1D1F' },
    title1: { fontSize: 28, fontWeight: '700', letterSpacing: 0.36, color: '#1D1D1F' },
    title2: { fontSize: 22, fontWeight: '700', letterSpacing: 0.35, color: '#1D1D1F' },
    title3: { fontSize: 20, fontWeight: '600', letterSpacing: 0.38, color: '#1D1D1F' },
    headline: { fontSize: 17, fontWeight: '600', letterSpacing: -0.41, color: '#1D1D1F' },
    body: { fontSize: 17, fontWeight: '400', letterSpacing: -0.41, color: '#1D1D1F' },
    callout: { fontSize: 16, fontWeight: '400', letterSpacing: -0.32, color: '#1D1D1F' },
    subheadline: { fontSize: 15, fontWeight: '400', letterSpacing: -0.24, color: '#6E6E73' },
    footnote: { fontSize: 13, fontWeight: '400', letterSpacing: -0.08, color: '#8E8E93' },
    caption1: { fontSize: 12, fontWeight: '400', letterSpacing: 0, color: '#8E8E93' },
    caption2: { fontSize: 11, fontWeight: '400', letterSpacing: 0.06, color: '#8E8E93' },
  },
  shadow: {
    card: { ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6 }, android: { elevation: 1.5 }, default: { elevation: 1 } }) },
    subtle: { ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 0.5 }, shadowOpacity: 0.04, shadowRadius: 2 }, android: { elevation: 0.8 }, default: { elevation: 1 } }) },
    elevated: { ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 16 }, android: { elevation: 6 }, default: { elevation: 4 } }) },
    tab: { ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -0.5 }, shadowOpacity: 0.04, shadowRadius: 3 }, android: { elevation: 8 }, default: { elevation: 4 } }) },
  },
  border: {
    hairline: 0.5,
    card: { borderWidth: 0.5, borderColor: '#E5E5EA' },
  },
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
