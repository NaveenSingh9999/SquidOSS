import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  FileStack, Users, Trash2, Activity,
  Settings2, PanelLeftClose, PanelLeft, Star, Folder,
  Keyboard, ChevronsUpDown, LogOut, User, Key,
  Inbox,
  type Icon,
} from '@/lib/icon-map';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  sidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  user: any;
  profile: any;
  bookmarks: any[];
  onSearchOpen: () => void;
  onSignOut: () => void;
  currentFolder: string;
  onNavigateToFolder: (path: string) => void;
}

const PRIMARY_NAV = [
  { id: 'files', label: 'Files', icon: FileStack, shortcut: '⌘1' },
  { id: 'shared', label: 'Shared', icon: Users, shortcut: '⌘2' },
  { id: 'trash', label: 'Trash', icon: Trash2, shortcut: '⌘3' },
];

const TOOLS_NAV = [
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'file-requests', label: 'File Requests', icon: Inbox },
];

export const EnterpriseSidebar: React.FC<SidebarProps> = ({
  activeTab, onTabChange, sidebarCollapsed, onToggleCollapse,
  user, profile, bookmarks, onSearchOpen: _onSearchOpen, onSignOut,
  currentFolder: _currentFolder, onNavigateToFolder,
}) => {
  const navigate = useNavigate();
  const collapsed = sidebarCollapsed;

  const NavItem = ({ item }: { item: { id: string; label: string; icon: Icon; shortcut?: string } }) => {
    const isActive = activeTab === item.id;
    return (
      <button onClick={() => onTabChange(item.id)} title={collapsed ? item.label : undefined} aria-current={isActive ? 'page' : undefined} className={cn('group relative flex items-center w-full outline-none transition-all duration-100', collapsed ? 'justify-center h-8 w-8 mx-auto' : 'h-7 gap-2.5 px-2', isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50')}>
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {!collapsed && (
          <><span className="text-[12px] flex-1 text-left">{item.label}</span>{item.shortcut && <span className="text-[9px] font-mono text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity">{item.shortcut}</span>}</>
        )}
      </button>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => {
    if (collapsed) return <div className="h-2" />;
    return <div className="px-2 pt-2 pb-0.5 select-none"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40">{label}</p></div>;
  };

  return (
    <aside className={cn('sticky top-0 self-start h-screen lg:h-[100dvh] flex-shrink-0 z-30 border-r border-border/30 bg-card', collapsed ? 'w-[60px]' : 'w-[200px]')}>
      <div className="relative flex h-full flex-col overflow-hidden text-foreground">
        <div className={cn('flex items-center h-12 border-b border-border/40 flex-shrink-0', collapsed ? 'justify-center' : 'justify-end px-3')}>
          <button onClick={onToggleCollapse} className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-1.5 custom-scrollbar">
          <div className="space-y-px">
            <SectionLabel label="Workspace" />
            {PRIMARY_NAV.map(item => <NavItem key={item.id} item={item} />)}
          </div>
          <div className="mt-1 space-y-px">
            <SectionLabel label="Tools" />
            {TOOLS_NAV.map(item => <NavItem key={item.id} item={item} />)}
          </div>
          {!collapsed && bookmarks.length > 0 && (
            <div className="mt-0.5">
              <SectionLabel label="Favorites" />
              <div className="space-y-px">
                {bookmarks.slice(0, 5).map(b => (
                  <button key={b.id} onClick={() => { if (b.type === 'folder' && b.path) { onNavigateToFolder(b.path); onTabChange('files'); } }} className="group flex h-7 w-full items-center gap-2 px-2 text-muted-foreground hover:bg-accent/50 hover:text-foreground outline-none transition-colors">
                    {b.type === 'folder' ? <Folder className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" /> : <FileStack className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />}
                    <span className="text-[11px] font-medium truncate flex-1 text-left">{b.name}</span>
                    <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-500/20 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-border/40 flex-shrink-0 p-1.5 space-y-px">
          <button onClick={() => onTabChange('settings')} className={cn('group flex w-full items-center outline-none transition-colors duration-100', collapsed ? 'justify-center h-8 w-8 mx-auto' : 'h-7 gap-2.5 px-2', activeTab === 'settings' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50')}>
            <Settings2 className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="text-[12px] font-medium">Settings</span>}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn('group flex w-full items-center hover:bg-accent/50 outline-none transition-colors duration-100', collapsed ? 'justify-center h-10' : 'gap-2.5 px-2 py-1.5 text-left')}>
                <div className="h-7 w-7 bg-accent border border-border/50 flex items-center justify-center font-medium text-foreground flex-shrink-0 text-[10px]">{user?.email?.charAt(0).toUpperCase() || 'U'}</div>
                {!collapsed && (
                  <><div className="flex-1 min-w-0"><p className="text-[12px] font-semibold text-foreground truncate leading-tight">{profile?.full_name || user?.email?.split('@')[0] || 'User'}</p></div><ChevronsUpDown className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" /></>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={collapsed ? 'center' : 'end'} side="top" sideOffset={14} className="w-52 border border-border/40 bg-card/95 p-1.5 shadow-sm">
              <div className="px-2 py-1.5 border-b border-border/40 mb-1.5">
                <p className="text-[13px] font-medium text-foreground truncate">{profile?.full_name || 'User'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuItem className="gap-2 py-1.5 cursor-pointer text-[12.5px] text-muted-foreground focus:text-foreground" onClick={() => navigate('/settings/account')}><User className="h-4 w-4" /><span>Account</span></DropdownMenuItem>
              <DropdownMenuItem className="gap-2 py-1.5 cursor-pointer text-[12.5px] text-muted-foreground focus:text-foreground" onClick={() => navigate('/developer-api')}><Key className="h-4 w-4" /><span>API Keys</span></DropdownMenuItem>
              <DropdownMenuItem className="gap-2 py-1.5 cursor-pointer text-[12.5px] text-muted-foreground focus:text-foreground"><Keyboard className="h-4 w-4" /><span>Shortcuts</span><kbd className="ml-auto text-[9px] bg-accent/60 px-1.5 py-0.5 border border-border/40">⌘/</kbd></DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/40" />
              <DropdownMenuItem className="gap-2 py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer text-[12.5px]" onClick={onSignOut}><LogOut className="h-4 w-4" /><span>Sign out</span></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
};

export default EnterpriseSidebar;