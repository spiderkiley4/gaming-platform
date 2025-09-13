// Theme configuration system
export const defaultThemes = {
  dark: {
    name: 'Dark',
    colors: {
      // Background colors - Brighter blue tones
      background: '#1a2b3d',
      surface: '#2a3f5f',
      surfaceVariant: '#3a5580',
      surfaceContainer: '#4a6ba1',
      
      // Text colors - High contrast on blue
      onBackground: '#e6f3ff',
      onSurface: '#e6f3ff',
      onSurfaceVariant: '#b3d9ff',
      onPrimary: '#ffffff',
      onSecondary: '#ffffff',
      
      // Primary colors - Vibrant blue
      primary: '#5865f2',
      primaryContainer: '#4752c4',
      secondary: '#4a90e2',
      secondaryContainer: '#357abd',
      
      // Accent colors - Blue-green
      accent: '#00bcd4',
      accentContainer: '#0097a7',
      
      // Status colors - Blue-themed
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336',
      info: '#2196f3',
      
      // Border colors - Blue borders
      outline: '#4a90e2',
      outlineVariant: '#357abd',
      
      // Interactive colors - Blue hover states
      hover: 'rgba(88, 101, 242, 0.2)',
      pressed: 'rgba(88, 101, 242, 0.3)',
      disabled: 'rgba(74, 144, 226, 0.3)',
      
      // Special colors
      overlay: 'rgba(15, 20, 25, 0.8)',
      shadow: 'rgba(15, 20, 25, 0.6)',
    }
  },
  
  light: {
    name: 'Light',
    colors: {
      // Background colors - Light blue tones
      background: '#f0f8ff',
      surface: '#e6f3ff',
      surfaceVariant: '#cce7ff',
      surfaceContainer: '#b3d9ff',
      
      // Text colors - Dark blue for contrast
      onBackground: '#0d47a1',
      onSurface: '#0d47a1',
      onSurfaceVariant: '#1565c0',
      onPrimary: '#ffffff',
      onSecondary: '#ffffff',
      
      // Primary colors - Vibrant blue
      primary: '#5865f2',
      primaryContainer: '#e3f2fd',
      secondary: '#2196f3',
      secondaryContainer: '#bbdefb',
      
      // Accent colors - Blue-green
      accent: '#00bcd4',
      accentContainer: '#b2ebf2',
      
      // Status colors - Blue-themed
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336',
      info: '#2196f3',
      
      // Border colors - Light blue
      outline: '#90caf9',
      outlineVariant: '#bbdefb',
      
      // Interactive colors - Blue hover states
      hover: 'rgba(33, 150, 243, 0.1)',
      pressed: 'rgba(33, 150, 243, 0.2)',
      disabled: 'rgba(33, 150, 243, 0.3)',
      
      // Special colors
      overlay: 'rgba(13, 71, 161, 0.4)',
      shadow: 'rgba(13, 71, 161, 0.2)',
    }
  }
};

// Custom theme template
export const customThemeTemplate = {
  name: 'Custom',
  colors: {
    // Background colors - Brighter blue tones
    background: '#1a2b3d',
    surface: '#2a3f5f',
    surfaceVariant: '#3a5580',
    surfaceContainer: '#4a6ba1',
    
    // Text colors - High contrast on blue
    onBackground: '#e6f3ff',
    onSurface: '#e6f3ff',
    onSurfaceVariant: '#b3d9ff',
    onPrimary: '#ffffff',
    onSecondary: '#ffffff',
    
    // Primary colors - Vibrant blue
    primary: '#5865f2',
    primaryContainer: '#4752c4',
    secondary: '#4a90e2',
    secondaryContainer: '#357abd',
    
    // Accent colors - Blue-green
    accent: '#00bcd4',
    accentContainer: '#0097a7',
    
    // Status colors - Blue-themed
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
    info: '#2196f3',
    
    // Border colors - Blue borders
    outline: '#4a90e2',
    outlineVariant: '#357abd',
    
    // Interactive colors - Blue hover states
    hover: 'rgba(88, 101, 242, 0.2)',
    pressed: 'rgba(88, 101, 242, 0.3)',
    disabled: 'rgba(74, 144, 226, 0.3)',
    
    // Special colors
    overlay: 'rgba(15, 20, 25, 0.8)',
    shadow: 'rgba(15, 20, 25, 0.6)',
  }
};

// Color categories for theme editor
export const colorCategories = {
  backgrounds: {
    name: 'Backgrounds',
    colors: ['background', 'surface', 'surfaceVariant', 'surfaceContainer']
  },
  text: {
    name: 'Text',
    colors: ['onBackground', 'onSurface', 'onSurfaceVariant', 'onPrimary', 'onSecondary']
  },
  primary: {
    name: 'Primary',
    colors: ['primary', 'primaryContainer', 'secondary', 'secondaryContainer']
  },
  accent: {
    name: 'Accent',
    colors: ['accent', 'accentContainer']
  },
  status: {
    name: 'Status',
    colors: ['success', 'warning', 'error', 'info']
  },
  borders: {
    name: 'Borders',
    colors: ['outline', 'outlineVariant']
  },
  interactive: {
    name: 'Interactive',
    colors: ['hover', 'pressed', 'disabled']
  },
  special: {
    name: 'Special',
    colors: ['overlay', 'shadow']
  }
};

// Helper function to get CSS custom properties from theme
export const getThemeCSSVariables = (theme) => {
  const cssVars = {};
  Object.entries(theme.colors).forEach(([key, value]) => {
    cssVars[`--color-${key}`] = value;
  });
  return cssVars;
};

// Helper function to apply theme to document
export const applyTheme = (theme) => {
  const root = document.documentElement;
  const cssVars = getThemeCSSVariables(theme);
  
  Object.entries(cssVars).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
  
  // Set theme class for additional styling
  root.className = root.className.replace(/theme-\w+/g, '');
  root.classList.add(`theme-${theme.name.toLowerCase()}`);
};
