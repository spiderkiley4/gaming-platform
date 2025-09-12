import React from 'react';
import { TouchableOpacity, StyleSheet, Text } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function ThemeToggle() {
  const { themeMode, setThemeMode, isDark } = useTheme();
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
        styles.menuButton,
        {
          backgroundColor: isDark ? '#6366F120' : '#6366F115',
          borderColor: borderColor,
        }
      ]}
      onPress={toggleTheme}
    >
      <Text style={styles.menuIcon}>{getThemeIcon()}</Text>
      <ThemedText style={styles.menuButtonText}>{getThemeLabel()}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
    textAlign: 'center',
  },
  menuButtonText: {
    fontSize: 16,
    flex: 1,
    fontWeight: '600',
  },
});
