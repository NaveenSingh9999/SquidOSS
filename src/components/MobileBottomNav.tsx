
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Files, 
  Share, 
  Upload, 
  Code, 
  Settings,
  ChevronUp
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import UploadButton from '@/components/UploadButton';
import { useIsMobile } from '@/hooks/use-mobile';

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!isMobile) {
      setIsVisible(true);
      lastScrollYRef.current = 0;
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDifference = Math.abs(currentScrollY - lastScrollYRef.current);

      if (scrollDifference > 10) {
        setIsVisible(currentScrollY < lastScrollYRef.current || currentScrollY < 100);
        lastScrollYRef.current = currentScrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  if (!isMobile) return null;

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabClick = (path: string) => {
    if (location.pathname === path) {
      scrollToTop();
    } else {
      navigate(path);
    }
  };

  const navItems = [
    {
      icon: Files,
      label: 'Files',
      path: '/dashboard',
      isActive: location.pathname === '/dashboard' && !location.search.includes('tab=')
    },
    {
      icon: Share,
      label: 'Shared',
      path: '/dashboard?tab=shared',
      isActive: location.pathname === '/dashboard' && location.search.includes('tab=shared')
    },
    {
      icon: Upload,
      label: 'Upload',
      path: '#upload',
      isActive: false,
      isUpload: true
    },
    {
      icon: Code,
      label: 'API',
      path: '/developer-api',
      isActive: location.pathname === '/developer-api'
    },
    {
      icon: Settings,
      label: 'Settings',
      path: '/settings/account',
      isActive: location.pathname.includes('/settings')
    }
  ];

  return (
    <>
      {/* Premium Bottom Navigation */}
      <nav 
        className={`
          fixed bottom-0 left-0 right-0 z-50 lg:hidden
          transition-transform duration-300 ease-out
          ${isVisible ? 'translate-y-0' : 'translate-y-full'}
        `}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Backdrop blur container */}
        <div 
          className="mx-3 mb-3 rounded-2xl border border-blue-500/10 bg-card/90 backdrop-blur-xl shadow-lg shadow-blue-900/10"
        >
          <div className="flex items-center justify-around py-2 px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              
              if (item.isUpload) {
                return (
                  <div key={item.label} className="flex-1 flex justify-center">
                    <UploadButton
                      variant="ghost"
                      size="sm"
                      currentFolder=""
                      allowFolderUpload={true}
                      onUploadComplete={() => {
                        if (location.pathname === '/dashboard') {
                          window.location.reload();
                        }
                      }}
                    >
                      <div className="flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1.5 rounded-xl transition-colors">
                        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
                          <Icon className="w-[18px] h-[18px] text-primary" />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground mt-1">
                          {item.label}
                        </span>
                      </div>
                    </UploadButton>
                  </div>
                );
              }
              
              return (
                <button
                  key={item.label}
                  onClick={() => handleTabClick(item.path)}
                  className={`
                    flex-1 flex flex-col items-center justify-center min-h-[48px] py-1.5
                    transition-all duration-150 rounded-xl
                    ${item.isActive ? 'bg-primary/8' : 'active:bg-accent/50'}
                  `}
                >
                  <div 
                    className={`
                      flex items-center justify-center w-9 h-9 rounded-xl transition-colors
                      ${item.isActive ? 'bg-primary/15' : ''}
                    `}
                  >
                    <Icon 
                      className={`
                        w-[18px] h-[18px] transition-colors
                        ${item.isActive ? 'text-primary' : 'text-muted-foreground'}
                      `} 
                      strokeWidth={item.isActive ? 2.25 : 1.75}
                    />
                  </div>
                  <span 
                    className={`
                      text-[10px] font-medium mt-1 transition-colors
                      ${item.isActive ? 'text-primary' : 'text-muted-foreground'}
                    `}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
      
      {/* Scroll to Top Button */}
      <Button
        variant="ghost"
        size="icon"
        className={`
          fixed bottom-24 right-4 z-40 h-10 w-10 rounded-xl
          bg-card/90 backdrop-blur-xl border border-blue-500/10 shadow-lg shadow-blue-900/10
          transition-all duration-300 ease-out lg:hidden
          ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'}
        `}
        onClick={scrollToTop}
      >
        <ChevronUp className="w-4 h-4 text-muted-foreground" />
      </Button>
    </>
  );
};

export default MobileBottomNav;
