import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemeMode = 'default' | 'squidset';

interface SquidsetThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
}

const SquidsetThemeContext = createContext<SquidsetThemeContextType | undefined>(undefined);

export const SquidsetThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('squidset-theme-mode');
    return (stored as ThemeMode) || 'default';
  });

  useEffect(() => {
    localStorage.setItem('squidset-theme-mode', themeMode);
    
    // Apply theme class to body
    if (themeMode === 'squidset') {
      document.body.classList.add('squidset-theme');
    } else {
      document.body.classList.remove('squidset-theme');
    }
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const toggleThemeMode = () => {
    setThemeModeState(prev => prev === 'default' ? 'squidset' : 'default');
  };

  return (
    <SquidsetThemeContext.Provider value={{ themeMode, setThemeMode, toggleThemeMode }}>
      {children}
    </SquidsetThemeContext.Provider>
  );
};

export const useSquidsetTheme = () => {
  const context = useContext(SquidsetThemeContext);
  if (context === undefined) {
    throw new Error('useSquidsetTheme must be used within a SquidsetThemeProvider');
  }
  return context;
};
