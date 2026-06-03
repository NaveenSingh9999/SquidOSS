import { useState, useCallback, useEffect } from 'react';

interface FolderHistoryItem {
  path: string;
  name: string;
  timestamp: number;
}

interface PinnedFolder {
  path: string;
  name: string;
  color?: string;
}

const HISTORY_KEY = 'squidcloud-folder-history';
const PINNED_KEY = 'squidcloud-pinned-folders';
const MAX_HISTORY = 10;

export function useFolderHistory() {
  const [history, setHistory] = useState<FolderHistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [pinnedFolders, setPinnedFolders] = useState<PinnedFolder[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PINNED_KEY);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Persist history to localStorage
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // Persist pinned folders to localStorage
  useEffect(() => {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedFolders));
  }, [pinnedFolders]);

  // Add a folder to history
  const addToHistory = useCallback((path: string, name?: string) => {
    setHistory(prev => {
      // Remove if already exists
      const filtered = prev.filter(item => item.path !== path);
      
      // Add to beginning
      const newItem: FolderHistoryItem = {
        path,
        name: name || (path ? path.split('/').pop() || 'Folder' : 'Root'),
        timestamp: Date.now(),
      };
      
      // Keep only last MAX_HISTORY items
      return [newItem, ...filtered].slice(0, MAX_HISTORY);
    });
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  // Pin a folder
  const pinFolder = useCallback((path: string, name?: string, color?: string) => {
    setPinnedFolders(prev => {
      // Check if already pinned
      if (prev.some(f => f.path === path)) {
        return prev;
      }
      
      return [...prev, {
        path,
        name: name || (path ? path.split('/').pop() || 'Folder' : 'Root'),
        color,
      }];
    });
  }, []);

  // Unpin a folder
  const unpinFolder = useCallback((path: string) => {
    setPinnedFolders(prev => prev.filter(f => f.path !== path));
  }, []);

  // Check if folder is pinned
  const isPinned = useCallback((path: string) => {
    return pinnedFolders.some(f => f.path === path);
  }, [pinnedFolders]);

  // Get recent folders (excluding current)
  const getRecentFolders = useCallback((currentPath: string, limit = 5) => {
    return history
      .filter(item => item.path !== currentPath)
      .slice(0, limit);
  }, [history]);

  return {
    history,
    pinnedFolders,
    addToHistory,
    clearHistory,
    pinFolder,
    unpinFolder,
    isPinned,
    getRecentFolders,
  };
}
