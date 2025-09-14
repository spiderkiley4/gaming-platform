import React, { createContext, useContext, useState, useEffect } from 'react';
import { defaultThemes, customThemeTemplate, applyTheme } from '../config/themes';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [customTheme, setCustomTheme] = useState(customThemeTemplate);
  const [isCustomTheme, setIsCustomTheme] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme');
    const savedCustomTheme = localStorage.getItem('app-custom-theme');
    const savedIsCustom = localStorage.getItem('app-is-custom-theme') === 'true';

    if (savedTheme && defaultThemes[savedTheme]) {
      setCurrentTheme(savedTheme);
    }

    if (savedCustomTheme) {
      try {
        const parsedCustomTheme = JSON.parse(savedCustomTheme);
        setCustomTheme(parsedCustomTheme);
      } catch (error) {
        console.error('Error parsing saved custom theme:', error);
      }
    }

    setIsCustomTheme(savedIsCustom);
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    const theme = isCustomTheme ? customTheme : defaultThemes[currentTheme];
    applyTheme(theme);
  }, [currentTheme, customTheme, isCustomTheme]);

  const switchTheme = (themeName) => {
    if (defaultThemes[themeName]) {
      setCurrentTheme(themeName);
      setIsCustomTheme(false);
      localStorage.setItem('app-theme', themeName);
      localStorage.setItem('app-is-custom-theme', 'false');
    }
  };

  const updateCustomTheme = (newCustomTheme) => {
    setCustomTheme(newCustomTheme);
    setIsCustomTheme(true);
    localStorage.setItem('app-custom-theme', JSON.stringify(newCustomTheme));
    localStorage.setItem('app-is-custom-theme', 'true');
  };

  const resetToDefault = () => {
    // Reset custom theme to the default template
    setCustomTheme(customThemeTemplate);
    setIsCustomTheme(false);
    localStorage.setItem('app-custom-theme', JSON.stringify(customThemeTemplate));
    localStorage.setItem('app-is-custom-theme', 'false');
  };

  const getCurrentThemeData = () => {
    return isCustomTheme ? customTheme : defaultThemes[currentTheme];
  };

  const getAvailableThemes = () => {
    return Object.keys(defaultThemes).map(key => ({
      key,
      name: defaultThemes[key].name
    }));
  };

  const value = {
    currentTheme,
    customTheme,
    isCustomTheme,
    switchTheme,
    updateCustomTheme,
    resetToDefault,
    getCurrentThemeData,
    getAvailableThemes,
    defaultThemes,
    customThemeTemplate
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
