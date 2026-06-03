import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Files,
  Folder,
  HardDrive,
  Database,
  Users,
  FileStack,
  Plus,
  Trash2,
  Upload,
} from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import CreateItemDialog from '@/components/CreateItemDialog';
import { useCreateItem } from '@/hooks/use-create-item';
import type { CreateFileType } from '@/hooks/use-create-item';

interface MobileBottomNavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onUploadClick?: () => void;
  createDisabled?: boolean;
  onCreateDisabled?: () => void;
  className?: string;
  currentPath?: string;
  onFileCreated?: () => void;
}

const SPRING = 'transition-all duration-200 motion-reduce:transition-none';

const MobileBottomNavbar: React.FC<MobileBottomNavbarProps> = ({
  activeTab,
  onTabChange,
  onUploadClick,
  createDisabled = false,
  onCreateDisabled,
  className,
  currentPath = '',
  onFileCreated,
}) => {
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const {
    fileTypes,
    dialogOpen,
    setDialogOpen,
    fileName,
    setFileName,
    createMode,
    creating,
    openFileDialog,
    openFolderDialog,
    submit,
  } = useCreateItem({ currentPath, onItemCreated: onFileCreated });

  const quickFileTypes = useMemo<CreateFileType[]>(() => fileTypes.slice(0, 4), [fileTypes]);

  const navItems = useMemo(
    () => [
      { id: 'files', label: 'Files', icon: FileStack },
      { id: 'shared', label: 'Shared', icon: Users },
      { id: 'analytics', label: 'Insights', icon: BarChart3 },
      { id: 'trash', label: 'Trash', icon: Trash2 },
    ],
    []
  );

  const haptic = (duration: number | number[] = 14) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  };

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
    haptic(10);
  };

  const handleUploadClick = () => {
    haptic(12);

    if (createDisabled) {
      onCreateDisabled?.();
      return;
    }

    if (onUploadClick) {
      onUploadClick();
      return;
    }

    const uploadButton = document.querySelector(
      'button[data-upload-trigger="dashboard-header-upload"]'
    ) as HTMLButtonElement | null;

    if (uploadButton) {
      uploadButton.click();
      return;
    }

    const uploadInput = document.querySelector(
      'input[data-upload-target="dashboard-header-upload"]'
    ) as HTMLInputElement | null;
    uploadInput?.click();
  };

  const openCreateMenu = () => {
    if (createDisabled) {
      onCreateDisabled?.();
      return;
    }
    setCreateSheetOpen(true);
    haptic(10);
  };

  const handleSelectOption = (callback: (type?: CreateFileType) => void, type?: CreateFileType) => {
    if (createDisabled) {
      onCreateDisabled?.();
      return;
    }
    setCreateSheetOpen(false);

    if (type) {
      callback(type);
      return;
    }

    callback();
  };

  return (
    <>
      <div className={cn('fixed inset-x-0 bottom-0 z-50', className)}>
        <div
          className={cn(
            'border-t border-border/40 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur'
          )}
        >
          <div className="grid grid-cols-5 items-center h-16">
            {navItems.slice(0, 2).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={cn(
                    'group relative flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label={item.label}
                >
                  <Icon className="h-5 w-5 mb-1" strokeWidth={isActive ? 2.5 : 2} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              onClick={openCreateMenu}
              className={cn(
                'relative mx-auto flex h-10 w-10 items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-sm active:scale-95 transition-transform',
                createDisabled && 'opacity-60 cursor-not-allowed active:scale-100'
              )}
              aria-disabled={createDisabled}
              aria-label="Create"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>

            {navItems.slice(2).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={cn(
                    'group relative flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label={item.label}
                >
                  <Icon className="h-5 w-5 mb-1" strokeWidth={isActive ? 2.5 : 2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent
          side="bottom"
          className={cn(
            'w-full max-w-full rounded-t-2xl border-t border-border/50 bg-background px-4 pt-4',
            'pb-[calc(env(safe-area-inset-bottom,0px)+16px)]'
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-muted-foreground/35" />

          <div className="mb-4 text-center">
            <h3 className="text-sm font-semibold text-foreground">Create</h3>
            <p className="mt-1 text-xs text-muted-foreground">Simple actions for files and folders</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleUploadClick}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border border-border/50 bg-card px-3.5 py-3 text-sm font-medium',
                'active:scale-[0.98]',
                SPRING
              )}
            >
              <Upload className="h-4 w-4" />
              Upload Files
            </button>

            <button
              onClick={() => handleSelectOption(openFolderDialog)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card px-3.5 py-3 text-sm font-medium',
                'active:scale-[0.98]',
                SPRING
              )}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Folder className="h-4 w-4" />
              </span>
              New Folder
            </button>

            <div>
              <h4 className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Quick Files</h4>
              <div className="grid grid-cols-2 gap-2.5">
                {quickFileTypes.map((type) => (
                  <button
                    key={type.extension}
                    onClick={() => handleSelectOption(openFileDialog, type)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-sm text-muted-foreground',
                      'hover:text-foreground active:scale-[0.98]',
                      SPRING
                    )}
                  >
                    <type.icon className="h-4 w-4" />
                    <span className="font-medium">{type.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CreateItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        createMode={createMode}
        fileName={fileName}
        onFileNameChange={setFileName}
        onSubmit={submit}
        creating={creating}
        currentPath={currentPath}
      />
    </>
  );
};

export default MobileBottomNavbar;
