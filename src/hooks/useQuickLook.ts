import { useEffect, useCallback, useState, useRef } from 'react';

interface QuickLookFile {
  id: string;
  name: string;
  type: string;
  size?: number;
}

interface UseQuickLookOptions {
  files: QuickLookFile[];
  onOpen: (file: QuickLookFile) => void;
  onClose: () => void;
  enabled?: boolean;
}

export function useQuickLook({
  files,
  onOpen,
  onClose,
  enabled = true,
}: UseQuickLookOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track which file card the user is interacting with via hover or focus
  const handleFocus = useCallback((_e: Event) => {
    const active = document.activeElement;
    if (!active || !containerRef.current?.contains(active)) return;

    const idx = Array.from(
      containerRef.current.querySelectorAll('[data-file-id]')
    ).findIndex(el => el === active || el.contains(active));

    setFocusedIndex(idx);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('focusin', handleFocus);
    return () => container.removeEventListener('focusin', handleFocus);
  }, [enabled, handleFocus]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Space to open preview
      if (e.code === 'Space' && focusedIndex >= 0 && focusedIndex < files.length) {
        e.preventDefault();
        onOpen(files[focusedIndex]);
        return;
      }

      // Escape to close
      if (e.code === 'Escape') {
        onClose();
        return;
      }

      // Arrow keys to navigate between files
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, files.length - 1));
      }

      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      }
    },
    [enabled, files, focusedIndex, onOpen, onClose]
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    containerRef,
    focusedIndex,
    setFocusedIndex,
  };
}
