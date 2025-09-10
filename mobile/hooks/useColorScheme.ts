import { useTheme } from '@/context/ThemeContext';

export const useColorScheme = () => {
  const { isDark } = useTheme();
  return isDark ? 'dark' : 'light';
};
