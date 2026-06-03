import React, { useState } from 'react';
import { Menu, Search, X } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MobileNavHeaderProps {
  onSearchClick: () => void;
  onMenuClick: () => void;
  onSearchChange?: (query: string) => void;
  title?: string;
  subtitle?: string;
  className?: string;
  searchPlaceholder?: string;
}

const MobileNavHeader: React.FC<MobileNavHeaderProps> = ({
  onSearchClick,
  onMenuClick,
  title = 'SquidCloud',
  subtitle = 'Workspace',
  className,
}) => {
  return (
    <div
      className={cn(
        'sticky top-0 z-40 border-b border-border/40 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur',
        className
      )}
    >
      <div className="px-3 pb-2 pt-2 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            onClick={onMenuClick}
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-lg p-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            aria-label="Open navigation menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </Button>

          <div className="min-w-0 flex-1 ml-1">
            <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
            <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <Button
          onClick={onSearchClick}
          variant="outline"
          size="sm"
          className="h-9 rounded-lg px-3 text-muted-foreground flex items-center gap-2 w-32 justify-start border-border/50 bg-muted/20"
          aria-label="Open command palette"
        >
          <Search className="h-[15px] w-[15px]" />
          <span className="text-xs">Search...</span>
        </Button>
      </div>
    </div>
  );
};

export default MobileNavHeader;
