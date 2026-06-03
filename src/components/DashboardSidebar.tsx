import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';


interface DashboardSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onFileClick: () => void;
  onTrashClick: () => void;
  onSharedClick: () => void;
  onSettingsClick: () => void;
  onAnalyticsClick: () => void;
  onLogout: () => void;
  isAdmin?: boolean;
  userEmail?: string;
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  isOpen,
  onToggle,
  onFileClick,
  onTrashClick,
  onSharedClick,
  onSettingsClick,
  onAnalyticsClick,
  onLogout,
  isAdmin = false,
  userEmail = '',
}) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  // Typographic, Squircled Nav Item (No Icons)
  const NavItem = ({
    label,
    shortLabel,
    onClick,
    active = false,
  }: {
    label: string;
    shortLabel: string;
    onClick: () => void;
    active?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-center px-4 py-3 rounded-[20px] transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] relative overflow-hidden group',
        active
          ? 'bg-foreground text-background shadow-[0_4px_20px_rgba(0,0,0,0.15)] scale-[0.98]'
          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5 active:scale-95'
      )}
    >
      {isOpen ? (
        <span
          className={cn(
            'w-full text-left truncate transition-all duration-400',
            active ? 'font-bold tracking-tight text-[15px]' : 'font-medium tracking-wide text-sm'
          )}
        >
          {label}
        </span>
      ) : (
        <span
          className={cn(
            'block text-[11px] font-bold uppercase tracking-widest transition-all duration-400',
            active ? 'text-background' : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {shortLabel}
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* Floating Modern Squircle Sidebar Container */}
      <div
        className={cn(
          'fixed left-4 top-4 bottom-4 bg-card/40 backdrop-blur-3xl border border-border/40 shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex flex-col z-40 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] rounded-[32px] overflow-hidden',
          isOpen ? 'w-[240px]' : 'w-[80px]'
        )}
      >
        {/* Header - Typographic Logo & Toggle */}
        <div className="h-24 flex items-center justify-between px-6 flex-shrink-0 pt-2">
          {isOpen ? (
            <span className="font-black text-xl tracking-tighter truncate bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60 transition-opacity duration-300">
              SquidCloud
            </span>
          ) : (
            <span className="w-full text-center font-black text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60">
              SC
            </span>
          )}
        </div>

        {/* Categories / Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-6 smooth-scrollbar pb-6">
          <div className="space-y-1.5">
            {isOpen && (
              <p className="text-[10px] font-bold text-muted-foreground/50 px-4 pb-2 uppercase tracking-[0.2em] transition-opacity duration-300">
                Storage
              </p>
            )}
            <NavItem label="Files" shortLabel="FL" onClick={onFileClick} active={isActive('/dashboard')} />
            <NavItem label="Shared" shortLabel="SH" onClick={onSharedClick} active={isActive('/shared')} />
            <NavItem label="Vault" shortLabel="VL" onClick={() => {}} />
            <NavItem label="Trash" shortLabel="TR" onClick={onTrashClick} active={isActive('/trash')} />
          </div>

          <div className="mx-4 h-[1px] bg-border/40 rounded-full" />

          <div className="space-y-1.5">
            {isOpen && (
              <p className="text-[10px] font-bold text-muted-foreground/50 px-4 pb-2 uppercase tracking-[0.2em] transition-opacity duration-300">
                Tools
              </p>
            )}
            <NavItem label="Analytics" shortLabel="AN" onClick={onAnalyticsClick} />
            <NavItem label="Extensions" shortLabel="EX" onClick={() => {}} />
          </div>

          {isAdmin && (
            <div className="space-y-1.5 pt-2">
              <div className="mx-4 mb-6 h-[1px] bg-border/40 rounded-full" />
              {isOpen && (
                <p className="text-[10px] font-bold text-muted-foreground/50 px-4 pb-2 uppercase tracking-[0.2em] transition-opacity duration-300">
                  Admin
                </p>
              )}
              <NavItem label="System" shortLabel="SY" onClick={() => {}} />
            </div>
          )}
        </nav>

        {/* Footer Area - Typographic Actions */}
        <div className="px-3 pb-4 pt-2 space-y-2 flex-shrink-0 bg-card/20 backdrop-blur-xl border-t border-border/20 rounded-b-[32px]">
          {isOpen && userEmail && (
            <div className="mb-4 px-4 py-3 rounded-[20px] bg-foreground/5 border border-foreground/5">
              <p className="text-[13px] font-bold text-foreground truncate tracking-tight">
                {userEmail.split('@')[0]}
              </p>
              <p className="text-[11px] font-medium text-muted-foreground truncate tracking-wide">
                {userEmail}
              </p>
            </div>
          )}
          
          <NavItem label="Settings" shortLabel="ST" onClick={onSettingsClick} />
          
          <button
            onClick={onLogout}
            className={cn(
              'w-full flex items-center justify-center px-4 py-3 rounded-[20px] transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] text-sm font-bold text-destructive/80 hover:bg-destructive hover:text-destructive-foreground active:scale-95'
            )}
          >
            {isOpen ? (
              <span className="w-full text-left tracking-wide">Logout</span>
            ) : (
              <span className="text-[11px] uppercase tracking-widest">OUT</span>
            )}
          </button>
        </div>
      </div>

      {/* Floating Toggle Button (Outside the sidebar) */}
      <button
        onClick={onToggle}
        className={cn(
          "fixed top-8 z-50 flex items-center justify-center w-8 h-12 bg-card/60 backdrop-blur-xl border border-border/40 shadow-sm transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-foreground/10 active:scale-90 text-foreground font-bold rounded-r-[12px] rounded-l-[4px]",
          isOpen ? "left-[260px]" : "left-[100px]"
        )}
      >
        <span className="text-[10px] tracking-tighter">
          {isOpen ? "◀" : "▶"}
        </span>
      </button>

      {/* Main content offset mapping to floated boundaries */}
      <div className={cn('transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]', isOpen ? 'ml-[272px]' : 'ml-[112px]')} />
    </>
  );
};

export default DashboardSidebar;
