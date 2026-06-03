
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Force dark theme only
  const [theme] = useState<Theme>('dark');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize theme after component mounts
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Apply dark theme to document
  useEffect(() => {
    if (isInitialized) {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  }, [isInitialized]);

  const toggleTheme = () => {
    // Do nothing - theme is locked to dark
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
