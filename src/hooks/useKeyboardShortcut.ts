import { useEffect } from 'react';

interface UseKeyboardShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: boolean;
}

/**
 * Hook for handling keyboard shortcuts
 * @param callback Function to call when shortcut is triggered
 * @param options Shortcut configuration
 * 
 * @example
 * // Cmd+K or Ctrl+K
 * useKeyboardShortcut(() => setOpen(true), {
 *   key: 'k',
 *   ctrlKey: true,
 *   metaKey: true,
 *   preventDefault: true
 * });
 */
export const useKeyboardShortcut = (
  callback: () => void,
  options: UseKeyboardShortcutOptions
) => {
  const { key, ctrlKey, metaKey, shiftKey, altKey, preventDefault = true } = options;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const keyMatch = event.key.toLowerCase() === key.toLowerCase();
      
      // For shortcuts like Cmd+K or Ctrl+K (either modifier works)
      const modifierMatch = 
        (ctrlKey || metaKey) 
          ? (event.ctrlKey || event.metaKey)
          : (
            (ctrlKey === undefined || event.ctrlKey === ctrlKey) &&
            (metaKey === undefined || event.metaKey === metaKey)
          );

      const shiftMatch = shiftKey === undefined || event.shiftKey === shiftKey;
      const altMatch = altKey === undefined || event.altKey === altKey;

      if (keyMatch && modifierMatch && shiftMatch && altMatch) {
        if (preventDefault) {
          event.preventDefault();
        }
        callback();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callback, key, ctrlKey, metaKey, shiftKey, altKey, preventDefault]);
};
