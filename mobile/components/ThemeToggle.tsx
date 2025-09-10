import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function ThemeToggle() {
  const { themeMode, setThemeMode, isDark } = useTheme();
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const borderColor = useThemeColor({}, 'border');

  const toggleTheme = () => {
    if (themeMode === 'light') {
      setThemeMode('dark');
    } else if (themeMode === 'dark') {
      setThemeMode('system');
    } else {
      setThemeMode('light');
    }
  };

  const getThemeIcon = () => {
    if (themeMode === 'light') return '☀️';
    if (themeMode === 'dark') return '🌙';
    return '🔄';
  };

  const getThemeLabel = () => {
    if (themeMode === 'light') return 'Light';
    if (themeMode === 'dark') return 'Dark';
    return 'Auto';
  };

  return (
    <TouchableOpacity
      style={[
        styles.themeToggle,
        {
          backgroundColor: primaryColor,
          borderColor: borderColor,
        }
      ]}
      onPress={toggleTheme}
    >
      <ThemedText style={styles.themeIcon}>{getThemeIcon()}</ThemedText>
      <ThemedText style={[styles.themeLabel, { color: primaryTextColor }]}>{getThemeLabel()}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    gap: 6,
  },
  themeIcon: {
    fontSize: 16,
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
