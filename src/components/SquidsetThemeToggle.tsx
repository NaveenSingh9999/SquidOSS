import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSquidsetTheme } from '@/contexts/SquidsetThemeContext';
import { Palette, Check } from '@/lib/icon-map';

export const SquidsetThemeToggle: React.FC = () => {
  const { themeMode, setThemeMode } = useSquidsetTheme();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">UI Design System</Label>
      </div>
      
      <div className="grid gap-3">
        <button
          onClick={() => setThemeMode('default')}
          className={`
            relative p-4 rounded-lg border-2 transition-all duration-200 text-left
            ${themeMode === 'default' 
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30' 
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }
          `}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-sm mb-1">Default Theme</div>
              <div className="text-xs text-muted-foreground">
                Clean and minimal interface with standard components
              </div>
            </div>
            {themeMode === 'default' && (
              <Check className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            )}
          </div>
        </button>

        <button
          onClick={() => setThemeMode('squidset')}
          className={`
            relative p-4 rounded-lg border-2 transition-all duration-200 text-left
            ${themeMode === 'squidset' 
              ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30' 
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }
          `}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                Squidset Design
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                  Premium
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Modern design with depth, glassmorphism, and smooth animations
              </div>
            </div>
            {themeMode === 'squidset' && (
              <Check className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
            )}
          </div>
        </button>
      </div>

      <div className="text-xs text-muted-foreground pt-2 pl-1">
        {themeMode === 'squidset' 
          ? '✨ Professional design system active' 
          : 'Switch to Squidset for enhanced visuals'}
      </div>
    </div>
  );
};
