
import React, { useState, useEffect } from 'react';
import { ChevronUp } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileScrollToTopProps {
  threshold?: number;
}

const MobileScrollToTop: React.FC<MobileScrollToTopProps> = ({ threshold = 300 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show button if scrolled down beyond threshold and not actively scrolling
      if (currentScrollY > threshold) {
        // If user stopped scrolling for a moment, show the button
        setTimeout(() => {
          if (Math.abs(window.scrollY - currentScrollY) < 10) {
            setIsVisible(true);
          }
        }, 150);
      } else {
        setIsVisible(false);
      }

      // Hide button when actively scrolling up
      if (currentScrollY < lastScrollY && currentScrollY > threshold) {
        setIsVisible(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold, lastScrollY]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    setIsVisible(false);
  };

  return (
    <div className={cn(
      "fixed left-4 z-40 transition-all duration-300 md:hidden",
      "bottom-24", // Above bottom navbar
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
    )}>
      <Button
        onClick={scrollToTop}
        size="sm"
        className="w-10 h-10 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-lg hover:bg-background/90"
        variant="outline"
      >
        <ChevronUp className="w-4 h-4" />
      </Button>
    </div>
  );
};

export default MobileScrollToTop;
