import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePDFLazyLoadOptions {
  totalPages: number;
  currentPage: number;
  onPageVisible: (pageNum: number) => void;
  threshold?: number;
  rootMargin?: string;
}

export const usePDFLazyLoad = ({
  totalPages,
  currentPage,
  onPageVisible,
  threshold = 0.1,
  rootMargin = '500px'
}: UsePDFLazyLoadOptions) => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([currentPage]));
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Setup intersection observer for lazy loading
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      // Fallback: load all pages
      const allPages = new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
      setVisiblePages(allPages);
      allPages.forEach(page => onPageVisible(page));
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page-num') || '0');
          
          if (entry.isIntersecting) {
            setVisiblePages(prev => {
              const newSet = new Set(prev);
              newSet.add(pageNum);
              return newSet;
            });
            onPageVisible(pageNum);
          }
        });
      },
      {
        threshold,
        rootMargin
      }
    );

    // Observe all page containers
    pageRefs.current.forEach((element) => {
      if (element && observerRef.current) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [totalPages, threshold, rootMargin, onPageVisible]);

  const registerPage = useCallback((pageNum: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNum, element);
      if (observerRef.current) {
        observerRef.current.observe(element);
      }
    } else {
      pageRefs.current.delete(pageNum);
    }
  }, []);

  return {
    visiblePages,
    registerPage
  };
};
