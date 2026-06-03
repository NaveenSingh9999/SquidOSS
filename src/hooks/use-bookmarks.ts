import { useState, useEffect, useCallback } from 'react';

export interface BookmarkItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path?: string;
  color?: string;
  addedAt: number;
}

const BOOKMARKS_KEY = 'cloudbliss_bookmarks';
const COLORS_KEY = 'cloudbliss_file_colors';

// Color options for files/folders
export const FILE_COLORS = [
  { name: 'None', value: '' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
] as const;

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [fileColors, setFileColors] = useState<Record<string, string>>({});

  // Load bookmarks from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BOOKMARKS_KEY);
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
      const storedColors = localStorage.getItem(COLORS_KEY);
      if (storedColors) {
        setFileColors(JSON.parse(storedColors));
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    }
  }, []);

  // Save bookmarks to localStorage
  const saveBookmarks = useCallback((items: BookmarkItem[]) => {
    setBookmarks(items);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(items));
  }, []);

  // Save colors to localStorage
  const saveColors = useCallback((colors: Record<string, string>) => {
    setFileColors(colors);
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
  }, []);

  // Add bookmark
  const addBookmark = useCallback((item: Omit<BookmarkItem, 'addedAt'>) => {
    const newItem: BookmarkItem = {
      ...item,
      addedAt: Date.now(),
    };
    const updated = [...bookmarks.filter(b => b.id !== item.id), newItem];
    saveBookmarks(updated);
    return newItem;
  }, [bookmarks, saveBookmarks]);

  // Remove bookmark
  const removeBookmark = useCallback((id: string) => {
    const updated = bookmarks.filter(b => b.id !== id);
    saveBookmarks(updated);
  }, [bookmarks, saveBookmarks]);

  // Check if bookmarked
  const isBookmarked = useCallback((id: string) => {
    return bookmarks.some(b => b.id === id);
  }, [bookmarks]);

  // Toggle bookmark
  const toggleBookmark = useCallback((item: Omit<BookmarkItem, 'addedAt'>) => {
    if (isBookmarked(item.id)) {
      removeBookmark(item.id);
      return false;
    } else {
      addBookmark(item);
      return true;
    }
  }, [isBookmarked, removeBookmark, addBookmark]);

  // Set file/folder color
  const setColor = useCallback((id: string, color: string) => {
    const updated = { ...fileColors };
    if (color) {
      updated[id] = color;
    } else {
      delete updated[id];
    }
    saveColors(updated);
  }, [fileColors, saveColors]);

  // Get file/folder color
  const getColor = useCallback((id: string) => {
    return fileColors[id] || '';
  }, [fileColors]);

  // Clear all bookmarks
  const clearBookmarks = useCallback(() => {
    saveBookmarks([]);
  }, [saveBookmarks]);

  return {
    bookmarks,
    fileColors,
    addBookmark,
    removeBookmark,
    isBookmarked,
    toggleBookmark,
    setColor,
    getColor,
    clearBookmarks,
    FILE_COLORS,
  };
}

export default useBookmarks;
