import { View, type ViewProps } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const themeBackground = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  const styles = Array.isArray(style) ? style : [style];
  const explicitBackground = styles.find(s => s && typeof s === 'object' && 'backgroundColor' in s);
  
  return <View style={[{ backgroundColor: explicitBackground ? undefined : themeBackground }, ...styles]} {...otherProps} />;
}
