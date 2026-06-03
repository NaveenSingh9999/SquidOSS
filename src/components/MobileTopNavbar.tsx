import React, { useState } from 'react';
import { Plus, RotateCcw, Upload, ArrowLeft, Home } from '@/lib/icon-map';
import { cn } from '@/lib/utils';

interface MobileTopNavbarProps {
  onFilesClick: () => void;
  onAddClick: () => void;
  onUploadClick?: () => void;
  onReloadClick: () => void;
  onBackClick?: () => void;
  showBackButton?: boolean;
  title?: string;
  className?: string;
}

const MobileTopNavbar: React.FC<MobileTopNavbarProps> = ({
  onFilesClick,
  onAddClick,
  onUploadClick,
  onReloadClick,
  onBackClick,
  showBackButton = false,
  title = "CloudBliss",
  className
}) => {
  const [activeTab, setActiveTab] = useState<'add' | 'upload'>('add');

  const handleTabClick = (tab: 'files' | 'add' | 'upload' | 'reload', onClick: () => void) => {
    if (tab === 'add' || tab === 'upload') {
      setActiveTab(tab);
    }
    onClick();
    
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
  };

  const handleUploadClick = () => {
    const uploadButton = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (uploadButton) {
      uploadButton.click();
    } else if (onUploadClick) {
      onUploadClick();
    }
  };

  return (
    <header className={cn(
      "sticky top-0 left-0 right-0 z-50",
      "bg-background/95 backdrop-blur-xl",
      "border-b border-border/40",
      className
    )}>
      {/* Safe area top padding */}
      <div className="safe-area-pt" />
      
      {/* Main content */}
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <button
                onClick={onBackClick}
                className={cn(
                  "flex items-center justify-center",
                  "h-9 w-9 rounded-xl",
                  "bg-muted/40",
                  "text-muted-foreground hover:text-foreground",
                  "transition-all duration-150 active:scale-95"
                )}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            <h1 className="text-base font-semibold text-foreground tracking-tight truncate">
              {title}
            </h1>
          </div>
          
          {/* Home button */}
          <button
            onClick={() => handleTabClick('files', onFilesClick)}
            className={cn(
              "flex items-center justify-center",
              "h-9 w-9 rounded-xl",
              "bg-muted/40",
              "text-muted-foreground hover:text-foreground",
              "transition-all duration-150 active:scale-95"
            )}
          >
            <Home className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Action row - segmented control style */}
        <div className="flex items-center gap-2">
          {/* Segmented control container */}
          <div className={cn(
            "flex-1 flex items-center",
            "bg-muted/30 border border-border/40",
            "rounded-xl p-1"
          )}>
            {/* Create button */}
            <button
              onClick={() => handleTabClick('add', onAddClick)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2",
                "py-2.5 rounded-lg",
                "text-sm font-medium",
                "transition-all duration-150",
                activeTab === 'add'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              <span>Create</span>
            </button>

            {/* Upload button */}
            <button
              onClick={() => handleTabClick('upload', handleUploadClick)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2",
                "py-2.5 rounded-lg",
                "text-sm font-medium",
                "transition-all duration-150",
                activeTab === 'upload'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <Upload className="h-4 w-4" strokeWidth={1.75} />
              <span>Upload</span>
            </button>
          </div>
          
          {/* Refresh button */}
          <button
            onClick={() => handleTabClick('reload', onReloadClick)}
            className={cn(
              "flex items-center justify-center",
              "h-10 w-10 rounded-xl",
              "bg-muted/40",
              "text-muted-foreground hover:text-foreground",
              "transition-all duration-150 active:scale-95"
            )}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default MobileTopNavbar;
