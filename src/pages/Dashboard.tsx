/**
 * SquidCloud Enterprise Dashboard
 * - StatsPanel replaces StatsBar (no icons, modern usage panel)
 * - Squircle shapes throughout
 * - LazyFileGrid lazy loading fixed
 * - Clean professional UI/UX
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo, memo
} from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { cn, formatFileSize } from '@/lib/utils';
import { downloadFileWithRes54 } from '@/lib/res54';
import {
  getFiles, getAllFiles, getFolders, deleteFile,
  downloadFile, createFileShare, formatBytes,
  type FileItem as FileItemType,
  type FolderItem,
} from '@/lib/api';

// UI Components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent } from '@/components/ui/sheet';

// Dashboard sub-components
import FileItem from '@/components/FileItem';
import FileInfoModal from '@/components/FileInfoModal';
import EnhancedInstantPreviewModal from '@/components/EnhancedInstantPreviewModal';
import BackgroundUploadPanel from '@/components/BackgroundUploadPanel';
import TrashTab from '@/components/TrashTab';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import StorageTab from '@/components/StorageTab';
import MobileBottomNavbar from '@/components/MobileBottomNavbar';
import MobileNavHeader from '@/components/MobileNavHeader';
import CreateUploadSegmented from '@/components/CreateUploadSegmented';
import { CommandPalette } from '@/components/CommandPalette';
import { backgroundUploadService } from '@/services/backgroundUpload';
import { AppStartupPINCheck } from '@/components/AppStartupPINCheck';
import DragDropUpload from '@/components/DragDropUpload';
import BulkActionsToolbar from '@/components/BulkActionsToolbar';
import { usePINAuthContext } from '@/contexts/PINAuthContext';
import ProviderSetupModal from '@/components/ui/ProviderSetupModal';
import WorkspaceCollaboratorsModal, { WorkspaceRole } from '@/components/WorkspaceCollaboratorsModal';
import { WorkspaceSettingsModal } from '@/components/WorkspaceSettingsModal';
import { downloadAndSaveBlob } from '@/utils/downloadHelper';
import { backgroundDownloadService } from '@/services/backgroundDownload';

// Enterprise components
import { EnterpriseSidebar } from '@/components/ui/EnterpriseSidebar';
import { EnterpriseFolderCard } from '@/components/ui/EnterpriseFolderCard';
import { LazyFileGrid } from '@/components/ui/LazyFileGrid';
import { StatsPanel } from '@/components/ui/StatsPanel';
import { RecencyFadeWrapper } from '@/components/ui/RecencyFadeWrapper';
import { FileViewInfoContext } from '@/contexts/FileViewInfoContext';
import CreateFileRequestDialog from '@/components/CreateFileRequestDialog';
import ManageFileRequests from '@/components/ManageFileRequests';
// Icons
import {
  Search, Grid3X3, List, RefreshCw, ChevronLeft, ChevronRight,
  Home, ArrowLeft, Upload, Files, HardDrive, Share2, Folder,
  Star, CheckSquare, X, Plus, SlidersHorizontal, Trash2, BarChart3,
  FileText, Image, Video, Music, Archive, Code,
  AlertCircle, Shield, Lock, ChevronsUpDown, Check, Briefcase,
  FileStack, Users, Activity, Database, Settings2, Cloud, Inbox,
  LogOut, Key, User
} from '@/lib/icon-map';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface DashboardProps {
  defaultTab?: string;
  openUpload?: boolean;
}

interface WorkspaceItem {
  id: string;
  user_id?: string;
  name: string;
  is_default: boolean;
  created_at: string;
  storage_backend?: string;
  member_limit?: number | null;
}

type ProviderType = 'squidcloud' | 'r2' | 'tebi';

interface StorageProviderRecord {
  id: string;
  provider_type: string;
  is_default?: boolean | null;
}

const ACTIVE_WORKSPACE_STORAGE_KEY = 'squid_active_workspace_id';
const ACTIVE_PROVIDER_TYPE_STORAGE_KEY = 'squid_active_provider_type';
const ACTIVE_PROVIDER_ID_STORAGE_KEY = 'squid_active_provider_id';

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─────────────────────────────────────────────────────────
// Breadcrumb / path bar
// ─────────────────────────────────────────────────────────

const PathBar = memo(({
  currentFolder,
  onNavigate,
}: {
  currentFolder: string;
  onNavigate: (path: string) => void;
}) => {
  if (!currentFolder) return null;
  const parts = currentFolder.split('/').filter(Boolean);
  return (
    <div className="flex items-center gap-1 px-0.5 text-[13px] text-muted-foreground select-none mt-1">
      <button
        onClick={() => onNavigate('')}
        className="hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Home className="w-3.5 h-3.5" />
      </button>
      {parts.map((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <React.Fragment key={path}>
            <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
            <button
              onClick={() => !isLast && onNavigate(path)}
              className={cn(
                'transition-colors max-w-[120px] truncate',
                isLast
                  ? 'text-foreground font-medium cursor-default'
                  : 'hover:text-foreground'
              )}
            >
              {part}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
});
PathBar.displayName = 'PathBar';

// ─────────────────────────────────────────────────────────
// Back card
// ─────────────────────────────────────────────────────────

const BackCard = memo(({
  viewMode,
  onClick,
}: {
  viewMode: 'grid' | 'list';
  onClick: () => void;
}) => (
  <div
    role="button"
    aria-label="Go back"
    onClick={onClick}
    className={cn(
      'group relative overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/20 text-muted-foreground',
      'transition-all duration-150 cursor-pointer select-none',
      'hover:border-border/80 hover:bg-muted/40 hover:text-foreground'
    )}
  >
    {viewMode === 'grid' ? (
      <div className="p-4 flex flex-col gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-background/80 border border-border/50">
          <ArrowLeft className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Back</p>
          <p className="text-[11px] text-muted-foreground">Up one level</p>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-background/80 border border-border/50">
          <ArrowLeft className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium">Back</p>
        </div>
      </div>
    )}
  </div>
));
BackCard.displayName = 'BackCard';

// ─────────────────────────────────────────────────────────
// Vault entry card
// ─────────────────────────────────────────────────────────

const VaultCard = memo(({ viewMode, onClick }: any) => { return null; });
VaultCard.displayName = 'VaultCard';

// Empty state
// ─────────────────────────────────────────────────────────

const EmptyState = memo(({ searchQuery }: { searchQuery: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-[14px] bg-muted/50 border border-border/50 flex items-center justify-center mb-4 text-muted-foreground">
      <Files className="w-6 h-6" />
    </div>
    <h3 className="text-base font-semibold text-foreground mb-1">
      {searchQuery ? 'No files found' : 'No files here yet'}
    </h3>
    <p className="text-[13px] text-muted-foreground max-w-sm">
      {searchQuery
        ? `Try a different search term or clear the filter.`
        : 'Folders help you organize your files. Use the Create & Upload buttons above to get started.'}
    </p>
  </div>
));
EmptyState.displayName = 'EmptyState';

// ─────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ defaultTab = 'files' }) => {
  // ── State ──────────────────────────────────────────────
  const [files, setFiles]               = useState<FileItemType[]>([]);
  const [folders, setFolders]           = useState<FolderItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [totalSize, setTotalSize]       = useState(0);
  const [currentFolder, setCurrentFolder] = useState('');
  const [rawSearch, setRawSearch]       = useState('');
  const [workspaces, setWorkspaces]     = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeWorkspaceRole, setActiveWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [workspaceManageOpen, setWorkspaceManageOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const searchQuery                     = useDebounce(rawSearch, 250);
  const [viewMode, setViewMode]         = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab]       = useState(defaultTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' &&
    localStorage.getItem('squid_sidebar_collapsed') === 'true'
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [previewFile, setPreviewFile]   = useState<FileItemType | null>(null);
  const [fileInfoFile, setFileInfoFile] = useState<FileItemType | null>(null);
  const handleViewInfo = (f: FileItemType) => setFileInfoFile(f);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [showVaultAuth, setShowVaultAuth] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [repoCount, setRepoCount]       = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [fileRequestOpen, setFileRequestOpen] = useState(false);
  const [showFileRequests, setShowFileRequests] = useState(false);
  const [fileRequestsRefreshToken, setFileRequestsRefreshToken] = useState(0);
  const [setupProvider, setSetupProvider] = useState<ProviderType | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>(['squidcloud']);
  const [providerRecords, setProviderRecords] = useState<StorageProviderRecord[]>([]);
  const [activeProviderType, setActiveProviderType] = useState<ProviderType>(() => {
    if (typeof window === 'undefined') return 'squidcloud';
    const saved = localStorage.getItem(ACTIVE_PROVIDER_TYPE_STORAGE_KEY);
    return saved === 'tebi' ? 'tebi' : 'squidcloud';
  });
  const [activeProviderId, setActiveProviderId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_PROVIDER_ID_STORAGE_KEY);
  });

  // ── Hooks ───────────────────────────────────────────────
  const { user, signOut, profile } = useAuth();
  const { toast }                  = useToast();
  const navigate                   = useNavigate();
  const isMobile                   = useIsMobile();
  const { verifyOperationNow }     = usePINAuthContext();
  const { bookmarks, isBookmarked, getColor, toggleBookmark, setColor } = useBookmarks();

  // ── Keyboard shortcuts ──────────────────────────────────
  useKeyboardShortcut(
    () => setIsSpotlightOpen(true),
    { key: 'k', ctrlKey: true, metaKey: true, preventDefault: true }
  );

  // ── Derived ─────────────────────────────────────────────
  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }
    if (filterMode === 'shared') {
      result = result.filter(f => f.shared);
    }
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'size-asc': return (a.size || 0) - (b.size || 0);
        case 'size-desc': return (b.size || 0) - (a.size || 0);
        default: return 0;
      }
    });
    return sorted;
  }, [files, searchQuery, filterMode, sortBy]);

  const filteredFolders = useMemo(() => {
    let result = folders;
    if (filterMode === 'files' || filterMode === 'shared') {
      return [];
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return 0;
      }
    });
    return sorted;
  }, [folders, searchQuery, filterMode, sortBy]);

  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId) return null;
    return workspaces.find(workspace => workspace.id === activeWorkspaceId) || null;
  }, [workspaces, activeWorkspaceId]);

  const canUpload = useMemo(() => {
    if (!activeWorkspaceRole) return false;
    return WORKSPACE_ROLE_RANK[activeWorkspaceRole] >= WORKSPACE_ROLE_RANK.editor;
  }, [activeWorkspaceRole]);

  const canAdministerWorkspace = useMemo(() => {
    if (!activeWorkspaceRole) return false;
    return WORKSPACE_ROLE_RANK[activeWorkspaceRole] >= WORKSPACE_ROLE_RANK.admin;
  }, [activeWorkspaceRole]);

  const canModifyItem = useCallback((ownerId?: string) => {
    if (!activeWorkspaceRole) return false;
    const rank = WORKSPACE_ROLE_RANK[activeWorkspaceRole];
    if (rank >= WORKSPACE_ROLE_RANK.admin) return true;
    if (rank >= WORKSPACE_ROLE_RANK.editor) return ownerId === user?.id;
    return false;
  }, [activeWorkspaceRole, user?.id]);

  const handleCreateBlocked = useCallback(() => {
    toast({
      title: 'Insufficient permissions',
      description: 'You need editor access to create or upload in this workspace.',
      variant: 'destructive',
    });
  }, [toast]);

  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error: defaultWorkspaceError } = await supabase.rpc('get_or_create_default_workspace', {
        p_user_id: user.id,
      });

      if (defaultWorkspaceError) {
        console.warn('Default workspace RPC failed (non-fatal):', defaultWorkspaceError);
      }

      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, is_default, created_at, user_id, storage_backend, member_limit')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      const workspaceList = (data || []) as WorkspaceItem[];
      setWorkspaces(workspaceList);

      if (workspaceList.length === 0) {
        setActiveWorkspaceId(null);
        return;
      }

      const savedWorkspaceId = typeof window !== 'undefined'
        ? localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
        : null;

      const initialWorkspace = workspaceList.find(workspace => workspace.id === savedWorkspaceId)
        || workspaceList.find(workspace => workspace.is_default)
        || workspaceList[0];

      if (!initialWorkspace) {
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, initialWorkspace.id);
      }

      setActiveWorkspaceId(initialWorkspace.id);
    } catch (err: any) {
      toast({
        title: 'Workspace error',
        description: err.message || 'Failed to load workspaces',
        variant: 'destructive',
      });
    }
  }, [user?.id, toast]);

  useEffect(() => {
    if (!user?.id) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      return;
    }

    fetchWorkspaces();
  }, [user?.id, fetchWorkspaces]);

  useEffect(() => {
    if (!user?.id || !activeWorkspaceId) {
      setActiveWorkspaceRole(null);
      return;
    }

    const loadRole = async () => {
      try {
        const { data, error } = await supabase.rpc('get_workspace_role', {
          p_workspace_id: activeWorkspaceId,
          p_user_id: user.id,
        });

        if (error) {
          throw error;
        }

        setActiveWorkspaceRole(data || null);
      } catch (err: any) {
        console.error('Failed to load workspace role:', err);
        setActiveWorkspaceRole(null);
      }
    };

    void loadRole();
  }, [activeWorkspaceId, user?.id]);

  useEffect(() => {
    setWorkspaceManageOpen(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId || !user?.id) return;

    const sendHeartbeat = async () => {
      try {
        await supabase.rpc('upsert_workspace_presence', {
          p_workspace_id: activeWorkspaceId,
          p_current_file_id: previewFile?.id || null,
          p_socket_id: null,
        });
      } catch (err) {
        console.error('Failed to update workspace presence:', err);
      }
    };

    void sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 10000);
    return () => window.clearInterval(interval);
  }, [activeWorkspaceId, previewFile?.id, user?.id]);

  const handleSwitchWorkspace = useCallback((workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) return;

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
    }

    setActiveWorkspaceId(workspaceId);
    setCurrentFolder('');
    setRawSearch('');
    setSelectedFiles(new Set());
    setSelectionMode(false);
  }, [activeWorkspaceId]);

  const handleCreateWorkspace = useCallback(async () => {
    if (!user?.id) return;

    const rawName = window.prompt('Enter a name for your new workspace');
    if (!rawName) return;

    const name = rawName.trim();
    if (!name) {
      toast({
        title: 'Workspace name required',
        description: 'Please enter a valid workspace name.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          user_id: user.id,
          name,
          is_default: false,
        })
        .select('id, name, is_default, created_at')
        .single();

      if (error) {
        throw error;
      }

      const createdWorkspace = data as WorkspaceItem;
      setWorkspaces(prev => {
        const next = [...prev, createdWorkspace];
        return next.sort((a, b) => {
          if (a.is_default !== b.is_default) {
            return a.is_default ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, createdWorkspace.id);
      }

      setActiveWorkspaceId(createdWorkspace.id);
      setCurrentFolder('');
      setRawSearch('');
      setSelectedFiles(new Set());
      setSelectionMode(false);

      toast({
        title: 'Workspace created',
        description: `Switched to ${createdWorkspace.name}`,
      });
    } catch (err: any) {
      toast({
        title: 'Unable to create workspace',
        description: err.message || 'Please try a different name.',
        variant: 'destructive',
      });
    }
  }, [user?.id, toast]);

  const persistActiveProvider = useCallback((providerType: ProviderType, providerId: string | null) => {
    setActiveProviderType(providerType);
    setActiveProviderId(providerId);

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_PROVIDER_TYPE_STORAGE_KEY, providerType);
      if (providerId) {
        localStorage.setItem(ACTIVE_PROVIDER_ID_STORAGE_KEY, providerId);
      } else {
        localStorage.removeItem(ACTIVE_PROVIDER_ID_STORAGE_KEY);
      }
    }

    setCurrentFolder('');
    setRawSearch('');
    setSelectedFiles(new Set());
    setSelectionMode(false);
  }, []);

  const activeProviderLabel = useMemo(() => {
    if (activeProviderType === 'r2') return 'Cloudflare R2 (Coming Soon)';
    if (activeProviderType === 'tebi') return 'Tebi.io';
    return 'SquidCloud';
  }, [activeProviderType]);

  const handleProviderSelection = useCallback((providerType: ProviderType) => {
    if (providerType === 'r2') {
      toast({
        title: 'Coming soon',
        description: 'Cloudflare R2 frontend integration is coming soon. Use Tebi.io for BYOS today.',
      });
      return;
    }

    if (providerType === 'squidcloud') {
      persistActiveProvider('squidcloud', null);
      toast({ title: 'Provider switched', description: 'Now showing SquidCloud storage' });
      return;
    }

    const matchedProvider = providerRecords.find(provider => provider.provider_type === providerType);
    if (!matchedProvider) {
      setSetupProvider(providerType);
      setIsProviderModalOpen(true);
      return;
    }

    persistActiveProvider(providerType, matchedProvider.id);
    toast({
      title: 'Provider switched',
      description: providerType === 'r2' ? 'Now showing Cloudflare R2 storage' : 'Now showing Tebi.io storage',
    });
  }, [persistActiveProvider, providerRecords, toast]);

  // ── Data fetching ────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (!user?.id) return;

    if (!activeWorkspaceId) {
      setFiles([]);
      setFolders([]);
      setTotalSize(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: providersData } = await supabase
        .from('storage_providers')
        .select('id, provider_type, is_default')
        .eq('user_id', user.id);

      const providerData = (providersData || []) as StorageProviderRecord[];
      setProviderRecords(providerData);
      setConfiguredProviders(['squidcloud', ...Array.from(new Set(providerData.map(provider => provider.provider_type)))]);

      let effectiveProviderType: ProviderType = activeProviderType;
      let effectiveProviderId: string | null = activeProviderId;

      if (effectiveProviderType !== 'squidcloud') {
        const matchedProvider = providerData.find(provider => (
          provider.provider_type === effectiveProviderType
          && (!effectiveProviderId || provider.id === effectiveProviderId)
        )) || providerData.find(provider => provider.provider_type === effectiveProviderType);

        if (!matchedProvider) {
          effectiveProviderType = 'squidcloud';
          effectiveProviderId = null;
          setActiveProviderType('squidcloud');
          setActiveProviderId(null);
          if (typeof window !== 'undefined') {
            localStorage.setItem(ACTIVE_PROVIDER_TYPE_STORAGE_KEY, 'squidcloud');
            localStorage.removeItem(ACTIVE_PROVIDER_ID_STORAGE_KEY);
          }
        } else {
          effectiveProviderId = matchedProvider.id;
          if (effectiveProviderId !== activeProviderId) {
            setActiveProviderId(effectiveProviderId);
            if (typeof window !== 'undefined') {
              localStorage.setItem(ACTIVE_PROVIDER_ID_STORAGE_KEY, effectiveProviderId);
            }
          }
        }
      }

      let query: any = supabase
        .from('files')
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .eq('is_deleted', false);

      if (effectiveProviderType === 'squidcloud') {
        query = query.is('storage_provider_id', null);
      } else if (effectiveProviderId) {
        query = query.eq('storage_provider_id', effectiveProviderId);
      } else {
        query = query.eq('storage_provider_id', '00000000-0000-0000-0000-000000000000');
      }

      if (currentFolder) {
        query = query.eq('parent_folder', currentFolder);
      } else {
        query = query.is('parent_folder', null);
      }

      const { data: filesData, error: filesError } = await query.order('created_at', { ascending: false });
      if (filesError) throw filesError;

      const unified = (filesData || []).map(f => ({
        ...f,
        content_type: f.type,
        file_path: f.storage_path,
      }));
      setFiles(unified);
      setTotalSize(unified.reduce((a, f) => a + (f.size || 0), 0));

      let folderQuery: any = supabase
        .from('folders')
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: false });

      if (effectiveProviderType === 'squidcloud') {
        folderQuery = folderQuery.is('storage_provider_id', null);
      } else if (effectiveProviderId) {
        folderQuery = folderQuery.eq('storage_provider_id', effectiveProviderId);
      } else {
        folderQuery = folderQuery.eq('storage_provider_id', '00000000-0000-0000-0000-000000000000');
      }

      const { data: foldersData, error: foldersError } = await folderQuery;
      if (foldersError) throw foldersError;

      const fetchedFolders = (foldersData || []).filter((folder: any) => {
        if (!currentFolder) return !folder.parent_folder || folder.parent_folder === '';
        return folder.parent_folder === currentFolder;
      });
      setFolders(fetchedFolders as FolderItem[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load files');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load files',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspaceId, currentFolder, activeProviderType, activeProviderId, toast]);

  useEffect(() => { if (user) fetchFiles(); }, [user, fetchFiles]);

  // Onboarding / repo check
  useEffect(() => {
    const check = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('repo_count, onboarding_complete')
        .eq('id', user.id)
        .single();
      setRepoCount(data?.repo_count || 0);
    };
    check();
  }, [user]);

  // Re-fetch after background upload completes
  useEffect(() => {
    const unsub = backgroundUploadService.subscribe(tasks => {
      const hasCompleted = tasks.some(t => t.status === 'completed');
      const hasActive    = tasks.some(t => t.status === 'uploading' || t.status === 'pending');
      if (hasCompleted && !hasActive) {
        setTimeout(fetchFiles, 800);
      }
    });
    return unsub;
  }, [fetchFiles]);

  // Sidebar collapse persistence
  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('squid_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  // ── Navigation ───────────────────────────────────────────
  const handleNavigateTo = useCallback((path: string) => {
    setCurrentFolder(path);
    setRawSearch('');
    setSelectedFiles(new Set());
    setSelectionMode(false);
  }, []);

  const handleGoBack = useCallback(() => {
    if (!currentFolder) return;
    const parts = currentFolder.split('/').filter(Boolean);
    parts.pop();
    handleNavigateTo(parts.join('/'));
  }, [currentFolder, handleNavigateTo]);

  const handleOpenFolder = useCallback((folder: FolderItem) => {
    handleNavigateTo(folder.path);
  }, [handleNavigateTo]);

  const openCbCode = useCallback((folderId: string | null, fileName?: string) => {
    const targetFolder = folderId || 'current';
    sessionStorage.setItem('cbcode_last_folder', targetFolder);
    const query = fileName ? `?file=${encodeURIComponent(fileName)}` : '';
    navigate(`/cbcode/${targetFolder}${query}`);
  }, [navigate]);

  const handleOpenFolderInCbCode = useCallback((folder: FolderItem) => {
    openCbCode(folder.id);
  }, [openCbCode]);

  const handleOpenFileInCbCode = useCallback((file: FileItemType) => {
    openCbCode(file.parent_folder || null, file.name);
  }, [openCbCode]);

  // ── File actions ─────────────────────────────────────────
  const handleFileClick = useCallback((file: FileItemType) => {
    if (selectionMode) {
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
        return next;
      });
      return;
    }
    setPreviewFile(file);
  }, [selectionMode]);

  const handleFileDownload = useCallback(async (file: FileItemType) => {
    const taskId = `download_${file.id}_${Date.now()}`;
    backgroundDownloadService.startTask({
      id: taskId,
      fileName: file.name,
      fileSize: file.size || 0,
    });

    try {
      let blob: Blob;
      if (file.encrypted && file.storage_path === 'res54_distributed') {
        blob = await downloadFileWithRes54(
          file.id,
          (progress) => {
            backgroundDownloadService.updateProgress(taskId, progress);
          },
          {
            reason: 'download',
            fileName: file.name,
          }
        );
      } else {
        blob = await downloadFile(file.id, (progress) => {
          backgroundDownloadService.updateProgress(taskId, progress);
        });
      }
      await downloadAndSaveBlob(blob, file.name);
      backgroundDownloadService.completeTask(taskId);
      toast({ title: 'Download complete', description: 'Your file has been downloaded.' });
    } catch (e: any) {
      backgroundDownloadService.failTask(taskId, e.message);
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  const handleFileDelete = useCallback(async (file: FileItemType) => {
    if (!canModifyItem(file.user_id)) {
      const rank = activeWorkspaceRole ? WORKSPACE_ROLE_RANK[activeWorkspaceRole] : 0;
      toast({
        title: 'Action not allowed',
        description: rank >= WORKSPACE_ROLE_RANK.editor
          ? 'Only admins can delete other members\' files.'
          : 'You need editor access to delete files in this workspace.',
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(`Move "${file.name}" to trash?`)) return;

    const authorized = await verifyOperationNow('delete_files');
    if (!authorized) {
      toast({ title: 'PIN required', description: 'PIN verification is required to delete files', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.rpc('move_to_trash_secure', { file_uuid: file.id });
      if (error) {
        throw new Error(error.message || 'Failed to move file to trash');
      }
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setTotalSize(prev => prev - (file.size || 0));
      if (previewFile?.id === file.id) setPreviewFile(null);
      toast({ title: 'Moved to trash', description: file.name });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }, [activeWorkspaceRole, canModifyItem, previewFile, toast, verifyOperationNow]);

  const handleFileShare = useCallback(async (file: FileItemType) => {
    // Sharing is now handled inside FileActionMenu with EnhancedShareDialog
    // This callback is kept for compatibility if needed.
  }, []);

  const handleFolderDelete = useCallback(async (folder: FolderItem) => {
    if (!canModifyItem(folder.user_id)) {
      const rank = activeWorkspaceRole ? WORKSPACE_ROLE_RANK[activeWorkspaceRole] : 0;
      toast({
        title: 'Action not allowed',
        description: rank >= WORKSPACE_ROLE_RANK.editor
          ? 'Only admins can delete other members\' folders.'
          : 'You need editor access to delete folders in this workspace.',
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(`Delete "${folder.name}" and all its contents?`)) return;

    const authorized = await verifyOperationNow('delete_files');
    if (!authorized) {
      toast({ title: 'PIN required', description: 'PIN verification is required to delete folders', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.rpc('delete_folder_secure', { folder_uuid: folder.id });
      if (error) {
        throw new Error(error.message || 'Failed to delete folder');
      }
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      toast({ title: 'Folder deleted', description: folder.name });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }, [activeWorkspaceRole, canModifyItem, toast, verifyOperationNow]);

  // ── Selection / Bulk ─────────────────────────────────────
  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setSelectionMode(false);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
  }, [filteredFiles]);

  const handleBulkDelete = useCallback(async () => {
    const toDelete = filteredFiles.filter(f => selectedFiles.has(f.id));
    if (toDelete.length === 0) return;

    if (!activeWorkspaceRole || WORKSPACE_ROLE_RANK[activeWorkspaceRole] < WORKSPACE_ROLE_RANK.editor) {
      toast({
        title: 'Action not allowed',
        description: 'You need editor access to delete files in this workspace.',
        variant: 'destructive',
      });
      return;
    }

    const canDeleteAll = WORKSPACE_ROLE_RANK[activeWorkspaceRole] >= WORKSPACE_ROLE_RANK.admin;
    const deletable = canDeleteAll ? toDelete : toDelete.filter(f => f.user_id === user?.id);

    if (deletable.length === 0) {
      toast({
        title: 'Action not allowed',
        description: 'Only admins can delete other members\' files.',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`Delete ${deletable.length} file(s)?`)) return;

    const authorized = await verifyOperationNow('delete_files');
    if (!authorized) {
      toast({ title: 'PIN required', description: 'PIN verification is required to delete files', variant: 'destructive' });
      return;
    }

    try {
      await Promise.all(deletable.map(f => deleteFile(f.id)));
      const deletableIds = new Set(deletable.map(f => f.id));
      setFiles(prev => prev.filter(f => !deletableIds.has(f.id)));
      clearSelection();
      toast({ title: 'Deleted', description: `${deletable.length} files deleted` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }, [activeWorkspaceRole, filteredFiles, selectedFiles, clearSelection, toast, user?.id, verifyOperationNow]);

  const handleBulkDownload = useCallback(async () => {
    const toDownload = filteredFiles.filter(f => selectedFiles.has(f.id));
    if (toDownload.length === 1) return handleFileDownload(toDownload[0]);
    toast({ title: 'Downloading...', description: `Preparing ${toDownload.length} files` });
    for (const f of toDownload) await handleFileDownload(f);
    clearSelection();
  }, [filteredFiles, selectedFiles, handleFileDownload, clearSelection, toast]);

  const handleBulkShare = useCallback(async () => {
    const toShare = filteredFiles.filter(f => selectedFiles.has(f.id));
    const authorized = await verifyOperationNow('create_share');
    if (!authorized) {
      toast({ title: 'PIN required', description: 'PIN verification is required to create shares', variant: 'destructive' });
      return;
    }

    const links: string[] = [];
    for (const f of toShare) {
      try {
        const { shareUrl } = await createFileShare(f.id);
        links.push(`${f.name}: ${shareUrl}`);
      } catch { /* skip */ }
    }
    await navigator.clipboard.writeText(links.join('\n'));
    toast({ title: 'Links copied', description: `${links.length} share links copied` });
    clearSelection();
  }, [filteredFiles, selectedFiles, clearSelection, toast, verifyOperationNow]);

  // ── Drag & Drop ──────────────────────────────────────────
  const handleFilesDropped = useCallback(async (droppedFiles: File[], folderPath?: string) => {
    if (!canUpload) {
      handleCreateBlocked();
      return;
    }
    const target = folderPath || currentFolder;
    for (const f of droppedFiles) {
      await backgroundUploadService.addTask(f, target);
    }
    toast({ title: `${droppedFiles.length} file(s) queued`, description: 'Uploading in background...' });
  }, [canUpload, currentFolder, handleCreateBlocked, toast]);

  const handleMobileQuickUpload = useCallback(() => {
    if (!canUpload) {
      handleCreateBlocked();
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;

    input.onchange = async () => {
      const selectedFiles = Array.from(input.files || []);
      if (selectedFiles.length === 0) return;

      try {
        for (const selectedFile of selectedFiles) {
          await backgroundUploadService.addTask(selectedFile, currentFolder || '');
        }

        toast({
          title: `${selectedFiles.length} file(s) queued`,
          description: 'Uploading in background...',
        });
      } catch (error: any) {
        toast({
          title: 'Upload failed',
          description: error?.message || 'Could not queue files for upload',
          variant: 'destructive',
        });
      }
    };

    input.click();
  }, [canUpload, currentFolder, handleCreateBlocked, toast]);

  // ── Adjacent files for preview navigation ────────────────
  const findAdjacent = useCallback((file: FileItemType) => {
    const i = filteredFiles.findIndex(f => f.id === file.id);
    return {
      previous: i > 0 ? filteredFiles[i - 1] : null,
      next: i < filteredFiles.length - 1 ? filteredFiles[i + 1] : null,
    };
  }, [filteredFiles]);

  const previewAdjacents = useMemo(() => {
    if (!previewFile) {
      return { previous: null as FileItemType | null, next: null as FileItemType | null };
    }
    return findAdjacent(previewFile);
  }, [previewFile, findAdjacent]);

  const previewCurrentIndex = useMemo(() => {
    if (!previewFile) return -1;
    return filteredFiles.findIndex(f => f.id === previewFile.id);
  }, [previewFile, filteredFiles]);

  const previewSiblingFiles = useMemo(
    () => filteredFiles.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size })),
    [filteredFiles]
  );

  // ─────────────────────────────────────────────────────────
  // Mobile layout
  // ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <FileViewInfoContext.Provider value={handleViewInfo}>
      <AppStartupPINCheck>
        <DragDropUpload
          onFilesDropped={handleFilesDropped}
          onDragStateChange={setIsDragActive}
          currentFolder={currentFolder}
          allowFolderUpload
        >
          <div className="flex min-h-screen flex-col bg-background">
            <MobileNavHeader
              onSearchClick={() => setIsSpotlightOpen(true)}
              onSearchChange={setRawSearch}
              onMenuClick={() => setMobileSidebarOpen(true)}
              title={
                activeTab === 'files'
                  ? 'My Files'
                  : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
              }
              subtitle={activeWorkspace?.name || 'Workspace'}
            />

            <main className="flex-1 px-3 pb-24 pt-2">
              {activeTab === 'files' && (
                <MobileFilesView
                  loading={loading}
                  currentFolder={currentFolder}
                  filteredFolders={filteredFolders}
                  filteredFiles={filteredFiles}
                  filesCount={files.length}
                  foldersCount={folders.length}
                  totalSize={totalSize}
                  workspaceName={activeWorkspace?.name}
                  searchQuery={searchQuery}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  onRefresh={fetchFiles}
                  onGoBack={handleGoBack}
                  onOpenFolder={handleOpenFolder}
                  onOpenFolderInCbCode={handleOpenFolderInCbCode}
                  onFileClick={handleFileClick}
                  onOpenFileInCbCode={handleOpenFileInCbCode}
                  onFileDownload={handleFileDownload}
                  onFileDelete={handleFileDelete}
                  onFileShare={handleFileShare}
                  onFolderDelete={handleFolderDelete}
                  onVaultOpen={() => setShowVaultAuth(true)}
                  bookmarks={bookmarks}
                  getColor={getColor}
                  isBookmarked={isBookmarked}
                  onToggleBookmark={toggleBookmark}
                  onSetColor={setColor}
                  selectionMode={selectionMode}
                  selectedFiles={selectedFiles}
                  onToggleSelection={() => {
                    setSelectionMode(!selectionMode);
                    setSelectedFiles(new Set());
                  }}
                  onFileCreated={fetchFiles}
                  onUploadComplete={fetchFiles}
                  onViewInfo={handleViewInfo}
                />
              )}

              {activeTab === 'trash' && (
                      <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
                        <TrashTab workspaceId={activeWorkspaceId} />
                </div>
              )}

              {activeTab === 'analytics' && (
                <AnalyticsDashboard />
              )}
              {activeTab === 'file-requests' && (
                <div className="rounded-2xl border border-border/50 bg-card/80 p-3">
                  <ManageFileRequests />
                </div>
              )}

              {activeTab === 'shared' && (
                <SharedView
                  files={files}
                  onFileDownload={handleFileDownload}
                  onFileShare={handleFileShare}
                  onFileDelete={handleFileDelete}
                  onFileClick={handleFileClick}
                  onOpenFileInCbCode={handleOpenFileInCbCode}
                  onRefresh={fetchFiles}
                  onViewInfo={handleViewInfo}
                />
              )}

              {activeTab === 'settings' && (
                <div className="rounded-2xl border border-border/50 bg-card/80">
                  <button onClick={() => navigate('/settings/account')} className="flex w-full items-center gap-2.5 px-3 h-10 hover:bg-accent/50 text-left transition-colors group">
                    <User className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
                    <span className="text-[13px] flex-1 font-medium text-foreground">Account</span>
                    <span className="text-[11px] text-muted-foreground/50">Profile, password &amp; security</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <div className="h-px bg-border/40 mx-3" />
                  <button onClick={() => navigate('/developer-api')} className="flex w-full items-center gap-2.5 px-3 h-10 hover:bg-accent/50 text-left transition-colors group">
                    <Key className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
                    <span className="text-[13px] flex-1 font-medium text-foreground">API Keys</span>
                    <span className="text-[11px] text-muted-foreground/50">Webhooks &amp; developer tools</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <div className="h-px bg-border/40 mx-3" />
                  <button onClick={signOut} className="flex w-full items-center gap-2.5 px-3 h-10 hover:bg-destructive/10 text-left transition-colors group rounded-b-2xl">
                    <LogOut className="w-4 h-4 text-destructive/70 flex-shrink-0" />
                    <span className="text-[13px] flex-1 font-medium text-destructive">Sign out</span>
                    <span className="text-[11px] text-destructive/50">End current session</span>
                    <ChevronRight className="w-3 h-3 text-destructive/30 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              )}
            </main>

            <MobileBottomNavbar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onUploadClick={handleMobileQuickUpload}
              createDisabled={!canUpload}
              onCreateDisabled={handleCreateBlocked}
              currentPath={currentFolder}
              onFileCreated={fetchFiles}
            />

            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetContent
                side="left"
                className="w-[82vw] max-w-[320px] border-r border-border/50 bg-background p-0"
              >
                <div className="flex h-full flex-col">
                  <div className="border-b border-border/40 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Workspace</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {activeWorkspace?.name || 'Default workspace'}
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 py-3">
                    <div className="space-y-1">
                      {[
                        { id: 'files', label: 'Files', icon: FileStack },
                        { id: 'shared', label: 'Shared', icon: Users },
                        { id: 'trash', label: 'Trash', icon: Trash2 },
                        { id: 'file-requests', label: 'File Requests', icon: Inbox },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTab(item.id);
                              setMobileSidebarOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 px-1 pb-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest">Tools</p>
                    </div>
                    <div className="space-y-1">
                      {[
                        { id: 'analytics', label: 'Analytics', icon: Activity },
                        { id: 'settings', label: 'Settings', icon: Settings2 },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTab(item.id);
                              setMobileSidebarOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 px-1">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Storage provider</p>
                      </div>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => {
                            handleProviderSelection('squidcloud');
                            setMobileSidebarOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                            activeProviderType === 'squidcloud'
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          )}
                        >
                          <span className="truncate">SquidCloud</span>
                          {activeProviderType === 'squidcloud' && <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => {
                            handleProviderSelection('tebi');
                            setMobileSidebarOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                            activeProviderType === 'tebi'
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          )}
                        >
                          <span className="truncate">Tebi.io</span>
                          <div className="flex items-center gap-2">
                            {activeProviderType === 'tebi' ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : !configuredProviders.includes('tebi') ? (
                              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Setup</span>
                            ) : null}
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground/60 opacity-80"
                        >
                          <span className="truncate">Cloudflare R2</span>
                          <span className="text-[10px] uppercase tracking-[0.08em]">Soon</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Workspaces</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            handleCreateWorkspace();
                            setMobileSidebarOpen(false);
                          }}
                          className="h-7 rounded-lg px-2 text-xs"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          New
                        </Button>
                      </div>

                      {activeWorkspaceId && canAdministerWorkspace && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setWorkspaceManageOpen(true);
                            setMobileSidebarOpen(false);
                          }}
                          className="h-7 w-full justify-start rounded-lg px-2 text-xs text-muted-foreground"
                        >
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          Collaborators
                        </Button>
                      )}
                      {activeWorkspaceId && canAdministerWorkspace && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setWorkspaceSettingsOpen(true);
                            setMobileSidebarOpen(false);
                          }}
                          className="h-7 w-full justify-start rounded-lg px-2 text-xs text-muted-foreground"
                        >
                          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                          Settings
                        </Button>
                      )}

                      <div className="mt-2 space-y-1.5">
                        {workspaces.map((workspace) => {
                          const isActive = workspace.id === activeWorkspaceId;
                          return (
                            <button
                              key={workspace.id}
                              onClick={() => {
                                handleSwitchWorkspace(workspace.id);
                                setMobileSidebarOpen(false);
                              }}
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                                isActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                              )}
                            >
                              <span className="truncate">{workspace.name}</span>
                              {isActive && <Check className="h-3.5 w-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* ── Mobile Modals ── */}
          {previewFile && (
            <EnhancedInstantPreviewModal
              file={previewFile}
              isOpen={!!previewFile}
              onClose={() => setPreviewFile(null)}
              onDownload={() => handleFileDownload(previewFile)}
              onShare={() => handleFileShare(previewFile)}
              onNext={() => {
                if (previewAdjacents.next) setPreviewFile(previewAdjacents.next);
              }}
              onPrevious={() => {
                if (previewAdjacents.previous) setPreviewFile(previewAdjacents.previous);
              }}
              hasNext={!!previewAdjacents.next}
              hasPrevious={!!previewAdjacents.previous}
              currentIndex={previewCurrentIndex >= 0 ? previewCurrentIndex : undefined}
              totalFiles={filteredFiles.length}
              siblingFiles={previewSiblingFiles}
              onNavigateToFile={(target) => {
                const selected = filteredFiles.find(f => f.id === target.id);
                if (selected) setPreviewFile(selected);
              }}
            />
          )}

          <CommandPalette
            open={isSpotlightOpen}
            onOpenChange={setIsSpotlightOpen}
            files={filteredFiles}
            folders={filteredFolders.map(folder => ({ id: folder.id, name: folder.name, path: folder.path || '' }))}
            onOpenFile={(file) => {
              const selected = filteredFiles.find(f => f.id === file.id);
              if (selected) setPreviewFile(selected);
            }}
            onNavigateToFiles={() => setActiveTab('files')}
            onNavigateToShared={() => setActiveTab('shared')}
            onNavigateToTrash={() => setActiveTab('trash')}
            onNavigateToAnalytics={() => setActiveTab('analytics')}
            onNavigateToSettings={() => setActiveTab('settings')}
            onNavigateToAccount={() => navigate('/settings/account')}
            onNavigateToDeveloperApi={() => navigate('/developer-api')}
            onNavigateToFolder={handleNavigateTo}
            onSetViewMode={setViewMode}
            currentViewMode={viewMode}
            selectedFilesCount={selectedFiles.size}
          />

          <ProviderSetupModal
            isOpen={isProviderModalOpen}
            onClose={() => setIsProviderModalOpen(false)}
            provider={setupProvider || 'tebi'}
            onSuccess={(providerInfo) => {
              if (providerInfo) {
                const providerType = providerInfo.providerType as ProviderType;
                setProviderRecords(prev => {
                  const next = prev.filter(item => item.id !== providerInfo.id);
                  next.push({ id: providerInfo.id, provider_type: providerInfo.providerType });
                  return next;
                });
                setConfiguredProviders(prev => (
                  prev.includes(providerInfo.providerType)
                    ? prev
                    : [...prev, providerInfo.providerType]
                ));
                persistActiveProvider(providerType, providerInfo.id);
              }
              fetchFiles();
            }}
          />

          <WorkspaceCollaboratorsModal
            open={workspaceManageOpen}
            onClose={() => setWorkspaceManageOpen(false)}
            workspaceId={activeWorkspaceId}
            workspaceName={activeWorkspace?.name || 'Workspace'}
            currentRole={activeWorkspaceRole}
            currentUserId={user?.id || ''}
          />
          <WorkspaceSettingsModal
            open={workspaceSettingsOpen}
            onClose={() => setWorkspaceSettingsOpen(false)}
            workspaceId={activeWorkspaceId}
            workspaceName={activeWorkspace?.name || 'Workspace'}
            currentRole={activeWorkspaceRole}
            currentUserId={user?.id || ''}
            onWorkspaceUpdated={(newName) => {
              setWorkspaces(prev => prev.map(w =>
                w.id === activeWorkspaceId ? { ...w, name: newName } : w
              ));
            }}
            onWorkspaceDeleted={() => {
              setWorkspaces(prev => prev.filter(w => w.id !== activeWorkspaceId));
              if (typeof window !== 'undefined') {
                localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
              }
              setActiveWorkspaceId(null);
              setActiveWorkspaceRole(null);
            }}
          />
        </DragDropUpload>
      </AppStartupPINCheck>
      </FileViewInfoContext.Provider>
    );
  }

  // ─────────────────────────────────────────────────────────
  // Desktop layout
  // ─────────────────────────────────────────────────────────
  return (
    <FileViewInfoContext.Provider value={handleViewInfo}>
    <AppStartupPINCheck>
      <DragDropUpload
        onFilesDropped={handleFilesDropped}
        onDragStateChange={setIsDragActive}
        currentFolder={currentFolder}
        allowFolderUpload
      >
        {/* Drop overlay */}
        {isDragActive && (
          <div className="fixed inset-0 z-[100] bg-primary/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-card border-2 border-dashed border-primary rounded-[20px] p-10 text-center shadow-2xl">
              <Upload className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="text-base font-semibold">Drop to upload</p>
              <p className="text-sm text-muted-foreground mt-1">
                {currentFolder
                  ? `To "${currentFolder.split('/').pop()}"`
                  : 'To root'}
              </p>
            </div>
          </div>
        )}

        <div className="flex h-screen w-full overflow-hidden bg-background">
          {/* Sidebar */}
          <EnterpriseSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            sidebarCollapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleCollapse}
            user={user}
            profile={profile}
            bookmarks={bookmarks}
            onSearchOpen={() => setIsSpotlightOpen(true)}
            onSignOut={signOut}
            currentFolder={currentFolder}
            onNavigateToFolder={handleNavigateTo}
          />

          {/* Main content */}
          <div className="flex-1 min-w-0 flex h-screen flex-col overflow-hidden bg-gradient-to-b from-background via-background to-muted/10">
            <div className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-xl">
              <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-6 lg:px-8">
                <div className="flex items-center gap-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 text-left transition-colors hover:bg-card/80">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Cloud className="h-3.5 w-3.5" />
                        </div>
                        <div className="leading-tight">
                          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80">Provider</p>
                          <p className="max-w-[220px] truncate text-sm font-medium text-foreground">
                            {activeProviderLabel}
                          </p>
                        </div>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem className="flex justify-between items-center cursor-pointer" onSelect={() => handleProviderSelection('squidcloud')}>
                        <span>SquidCloud</span>
                        {activeProviderType === 'squidcloud' && <Check className="h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="opacity-60">
                        <div className="flex justify-between items-center w-full">
                          <span>Cloudflare R2</span>
                          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Coming soon</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="cursor-pointer"
                        onSelect={() => {
                          setTimeout(() => {
                            handleProviderSelection('tebi');
                          }, 150);
                        }}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span>Tebi.io</span>
                          {activeProviderType === 'tebi' && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="opacity-50">
                        <span>AWS S3 (Coming Soon)</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="opacity-50">
                        <span>GCP (Coming Soon)</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 text-left transition-colors hover:bg-card/80">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Briefcase className="h-3.5 w-3.5" />
                        </div>
                      <div className="leading-tight">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80">Workspaces</p>
                        <p className="max-w-[220px] truncate text-sm font-medium text-foreground">
                          {activeWorkspace?.name || 'Loading workspace...'}
                        </p>
                      </div>
                      <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72">
                    {workspaces.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.id}
                        className="flex items-center justify-between"
                        onClick={() => handleSwitchWorkspace(workspace.id)}
                      >
                        <span className="truncate">{workspace.name}</span>
                        {workspace.id === activeWorkspaceId && <Check className="h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    {activeWorkspaceId && canAdministerWorkspace && (
                      <DropdownMenuItem onClick={() => setWorkspaceManageOpen(true)}>
                        <Users className="mr-2 h-4 w-4" />
                        Collaborators
                      </DropdownMenuItem>
                    )}
                    {activeWorkspaceId && canAdministerWorkspace && (
                      <DropdownMenuItem onClick={() => setWorkspaceSettingsOpen(true)}>
                        <Settings2 className="mr-2 h-4 w-4" />
                        Workspace Settings
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleCreateWorkspace}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create workspace
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSpotlightOpen(true)}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    title="Search (⌘K)"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <main className="flex-1 overflow-y-auto px-6 pb-8 pt-6 lg:px-8">
              <div className="mx-auto w-full max-w-[1400px]">

              {/* ── Files tab ── */}
              {activeTab === 'files' && (
                  <FilesView
                    loading={loading}
                    error={error}
                    currentFolder={currentFolder}
                    filteredFolders={filteredFolders}
                    filteredFiles={filteredFiles}
                    files={files}
                    folders={folders}
                    totalSize={totalSize}
                    searchQuery={searchQuery}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    filterMode={filterMode}
                    onFilterChange={setFilterMode}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    onGoBack={handleGoBack}
                    onNavigateTo={handleNavigateTo}
                    onOpenFolder={handleOpenFolder}
                    onOpenFolderInCbCode={handleOpenFolderInCbCode}
                    onFileClick={handleFileClick}
                    onOpenFileInCbCode={handleOpenFileInCbCode}
                    onFileDownload={handleFileDownload}
                    onFileDelete={handleFileDelete}
                    onFileShare={handleFileShare}
                    onFolderDelete={handleFolderDelete}
                    onVaultOpen={() => setShowVaultAuth(true)}
                    onRefresh={fetchFiles}
                    bookmarks={bookmarks}
                    getColor={getColor}
                    isBookmarked={isBookmarked}
                    onToggleBookmark={toggleBookmark}
                    onSetColor={setColor}
                    selectionMode={selectionMode}
                    selectedFiles={selectedFiles}
                    onToggleSelection={() => {
                      setSelectionMode(!selectionMode);
                      setSelectedFiles(new Set());
                    }}
                    onSelectAll={selectAll}
                    onFileCreated={fetchFiles}
                    onUploadComplete={fetchFiles}
                    createDisabled={!canUpload}
                    onCreateBlocked={handleCreateBlocked}
                  />
              )}

              {activeTab === 'shared' && (
                <SharedView
                  files={files}
                  onFileDownload={handleFileDownload}
                  onFileShare={handleFileShare}
                  onFileDelete={handleFileDelete}
                  onFileClick={handleFileClick}
                  onOpenFileInCbCode={handleOpenFileInCbCode}
                  onRefresh={fetchFiles}
                  onViewInfo={handleViewInfo}
                />
              )}

              {activeTab === 'trash'     && <TrashTab workspaceId={activeWorkspaceId} />}
              {activeTab === 'analytics' && <AnalyticsDashboard />}
              {activeTab === 'storage'   && <StorageTab />}

              {activeTab === 'file-requests' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold tracking-tight">File Requests</h1>
                      <p className="mt-1 text-sm text-muted-foreground">Public upload links for anyone to submit files.</p>
                    </div>
                    <Button onClick={() => setFileRequestOpen(true)} className="gap-2">
                      <Plus className="w-4 h-4" />
                      New Request
                    </Button>
                  </div>
                  <ManageFileRequests refreshToken={fileRequestsRefreshToken} />
                  <CreateFileRequestDialog
                    open={fileRequestOpen}
                    onClose={() => setFileRequestOpen(false)}
                    currentFolder={currentFolder}
                    onCreated={() => {
                      setFileRequestOpen(false);
                      setShowFileRequests(true);
                      setFileRequestsRefreshToken(prev => prev + 1);
                    }}
                  />
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="max-w-2xl">
                  <h1 className="text-xl font-bold text-white mb-3 px-1">Settings</h1>
                  <div className="bg-white/[0.06] rounded-2xl border border-white/10">
                    <button onClick={() => navigate('/settings/account')} className="flex w-full items-center gap-3 px-4 h-12 hover:bg-white/[0.04] text-left transition-colors group">
                      <User className="w-4 h-4 text-white/50 flex-shrink-0" />
                      <span className="text-[14px] flex-1 font-medium text-white">Account</span>
                      <span className="text-[12px] text-white/40">Profile, password &amp; security</span>
                      <ChevronRight className="w-3.5 h-3.5 text-white/20 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <div className="h-px bg-white/[0.06] mx-4" />
                    <button onClick={() => navigate('/developer-api')} className="flex w-full items-center gap-3 px-4 h-12 hover:bg-white/[0.04] text-left transition-colors group">
                      <Key className="w-4 h-4 text-white/50 flex-shrink-0" />
                      <span className="text-[14px] flex-1 font-medium text-white">API Keys</span>
                      <span className="text-[12px] text-white/40">Webhooks &amp; developer tools</span>
                      <ChevronRight className="w-3.5 h-3.5 text-white/20 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <div className="h-px bg-white/[0.06] mx-4" />
                    <button onClick={signOut} className="flex w-full items-center gap-3 px-4 h-12 hover:bg-white/[0.04] text-left transition-colors group rounded-b-2xl">
                      <LogOut className="w-4 h-4 text-red-400/60 flex-shrink-0" />
                      <span className="text-[14px] flex-1 font-medium text-red-400">Sign out</span>
                      <span className="text-[12px] text-red-400/40">End current session</span>
                      <ChevronRight className="w-3.5 h-3.5 text-red-400/20 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

            {/* ── Modals ── */}
        {previewFile && (
          <EnhancedInstantPreviewModal
            file={previewFile}
            isOpen={!!previewFile}
            onClose={() => setPreviewFile(null)}
            onDownload={() => handleFileDownload(previewFile)}
            onShare={() => handleFileShare(previewFile)}
            onNext={() => {
              if (previewAdjacents.next) setPreviewFile(previewAdjacents.next);
            }}
            onPrevious={() => {
              if (previewAdjacents.previous) setPreviewFile(previewAdjacents.previous);
            }}
            hasNext={!!previewAdjacents.next}
            hasPrevious={!!previewAdjacents.previous}
            currentIndex={previewCurrentIndex >= 0 ? previewCurrentIndex : undefined}
            totalFiles={filteredFiles.length}
            siblingFiles={previewSiblingFiles}
            onNavigateToFile={(target) => {
              const selected = filteredFiles.find(f => f.id === target.id);
              if (selected) setPreviewFile(selected);
            }}
          />
        )}

        <FileInfoModal
          file={fileInfoFile}
          open={!!fileInfoFile}
          onClose={() => setFileInfoFile(null)}
        />

        {selectionMode && selectedFiles.size > 0 && (
          <BulkActionsToolbar
            selectedCount={selectedFiles.size}
            totalCount={filteredFiles.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkDownload={handleBulkDownload}
            onBulkShare={handleBulkShare}
            onBulkMove={() => {}}
            onBulkDelete={handleBulkDelete}
            onClose={clearSelection}
            isMobile={false}
          />
        )}

        <CommandPalette
          open={isSpotlightOpen}
          onOpenChange={setIsSpotlightOpen}
          files={filteredFiles}
          folders={filteredFolders.map(folder => ({ id: folder.id, name: folder.name, path: folder.path || '' }))}
          onOpenFile={(file) => {
            const selected = filteredFiles.find(f => f.id === file.id);
            if (selected) setPreviewFile(selected);
          }}
          onNavigateToFiles={() => setActiveTab('files')}
          onNavigateToShared={() => setActiveTab('shared')}
          onNavigateToTrash={() => setActiveTab('trash')}
          onNavigateToAnalytics={() => setActiveTab('analytics')}
          onNavigateToSettings={() => setActiveTab('settings')}
          onNavigateToAccount={() => navigate('/settings/account')}
          onNavigateToDeveloperApi={() => navigate('/developer-api')}
          onNavigateToFolder={handleNavigateTo}
          onSetViewMode={setViewMode}
          currentViewMode={viewMode}
          selectedFilesCount={selectedFiles.size}
          onDeleteSelected={selectedFiles.size > 0 ? handleBulkDelete : undefined}
          onShareSelected={selectedFiles.size > 0 ? handleBulkShare : undefined}
          onDownloadSelected={selectedFiles.size > 0 ? handleBulkDownload : undefined}
          onRefresh={fetchFiles}
          onSignOut={signOut}
          currentFolder={currentFolder}
        />

        <ProviderSetupModal
          isOpen={isProviderModalOpen}
          onClose={() => setIsProviderModalOpen(false)}
          provider={setupProvider || 'tebi'}
          onSuccess={(providerInfo) => {
            if (providerInfo) {
              const providerType = providerInfo.providerType as ProviderType;
              setProviderRecords(prev => {
                const next = prev.filter(item => item.id !== providerInfo.id);
                next.push({ id: providerInfo.id, provider_type: providerInfo.providerType });
                return next;
              });
              setConfiguredProviders(prev => (
                prev.includes(providerInfo.providerType)
                  ? prev
                  : [...prev, providerInfo.providerType]
              ));
              persistActiveProvider(providerType, providerInfo.id);
            }
            fetchFiles();
          }}
        />

        <BackgroundUploadPanel />

        <WorkspaceCollaboratorsModal
          open={workspaceManageOpen}
          onClose={() => setWorkspaceManageOpen(false)}
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspace?.name || 'Workspace'}
          currentRole={activeWorkspaceRole}
          currentUserId={user?.id || ''}
        />
        <WorkspaceSettingsModal
          open={workspaceSettingsOpen}
          onClose={() => setWorkspaceSettingsOpen(false)}
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspace?.name || 'Workspace'}
          currentRole={activeWorkspaceRole}
          currentUserId={user?.id || ''}
          onWorkspaceUpdated={(newName) => {
            setWorkspaces(prev => prev.map(w =>
              w.id === activeWorkspaceId ? { ...w, name: newName } : w
            ));
          }}
          onWorkspaceDeleted={() => {
            setWorkspaces(prev => prev.filter(w => w.id !== activeWorkspaceId));
            if (typeof window !== 'undefined') {
              localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
            }
            setActiveWorkspaceId(null);
            setActiveWorkspaceRole(null);
          }}
        />
      </div>
      </DragDropUpload>
    </AppStartupPINCheck>
    </FileViewInfoContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────
// FilesView (desktop)
// ─────────────────────────────────────────────────────────

interface FilesViewProps {
  loading: boolean;
  error: string | null;
  currentFolder: string;
  filteredFolders: FolderItem[];
  filteredFiles: FileItemType[];
  files: FileItemType[];
  folders: FolderItem[];
  totalSize: number;
  searchQuery: string;
  viewMode: 'grid' | 'list';
  setViewMode: (m: 'grid' | 'list') => void;
  filterMode: string;
  onFilterChange: (f: string) => void;
  sortBy: string;
  onSortChange: (s: string) => void;
  onGoBack: () => void;
  onNavigateTo: (p: string) => void;
  onOpenFolder: (f: FolderItem) => void;
  onOpenFolderInCbCode: (f: FolderItem) => void;
  onFileClick: (f: FileItemType) => void;
  onOpenFileInCbCode: (f: FileItemType) => void;
  onFileDownload: (f: FileItemType) => void;
  onFileDelete: (f: FileItemType) => void;
  onFileShare: (f: FileItemType) => void;
  onFolderDelete: (f: FolderItem) => void;
  onVaultOpen: () => void;
  onRefresh: () => void;
  bookmarks: any[];
  getColor: (id: string) => string | undefined;
  isBookmarked: (id: string) => boolean;
  onToggleBookmark: (b: any) => void;
  onSetColor: (id: string, color: string) => void;
  selectionMode: boolean;
  selectedFiles: Set<string>;
  onToggleSelection: () => void;
  onSelectAll: () => void;
  onFileCreated: () => void;
  onUploadComplete: (f: FileItemType) => void;
  createDisabled?: boolean;
  onCreateBlocked?: () => void;
}

const FilesView: React.FC<FilesViewProps> = ({
  loading, error, currentFolder, filteredFolders, filteredFiles,
  files, folders, totalSize,
  searchQuery,
  viewMode, setViewMode,
  filterMode, onFilterChange, sortBy, onSortChange,
  onGoBack, onNavigateTo, onOpenFolder,
  onOpenFolderInCbCode, onFileClick, onOpenFileInCbCode,
  onFileDownload, onFileDelete, onFileShare,
  onFolderDelete, onVaultOpen, onRefresh,
  bookmarks, getColor, isBookmarked, onToggleBookmark, onSetColor,
  selectionMode, selectedFiles, onToggleSelection, onSelectAll,
  onFileCreated, onUploadComplete,
  createDisabled, onCreateBlocked,
}) => {
  const showFolders = filteredFolders.length > 0 || !currentFolder;
  const showFiles   = filteredFiles.length > 0;

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Files</h1>
          <PathBar currentFolder={currentFolder} onNavigate={onNavigateTo} />
        </div>
        <div className="flex items-center gap-2">
          <CreateUploadSegmented
            currentFolder={currentFolder}
            onFileCreated={onFileCreated}
            onUploadComplete={onUploadComplete}
            disabled={!!createDisabled}
            onDisabledClick={onCreateBlocked}
          />
        </div>
      </div>

      {/* ── Usage panel — hidden when empty ── */}
      {(files.length > 0 || folders.length > 0 || totalSize > 0) && (
        <StatsPanel
          files={files}
          folders={folders}
          totalSize={totalSize}
          activeFilter={filterMode === 'all' ? undefined : filterMode}
          onFilterChange={onFilterChange}
        />
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border/40 bg-card/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {currentFolder && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onGoBack}
              className="gap-1.5 h-8 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          {searchQuery && (
            <span className="text-[13px] text-muted-foreground">
              {filteredFiles.length + filteredFolders.length} results for &ldquo;{searchQuery}&rdquo;
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSelection}
            className={cn(
              'h-8 gap-1.5',
              selectionMode && 'bg-primary/10 text-primary hover:bg-primary/20'
            )}
          >
            <CheckSquare className="w-4 h-4" />
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>
          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="text-xs hidden sm:inline">Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {[
                ['date-desc', 'Newest'],
                ['date-asc', 'Oldest'],
                ['name-asc', 'Name A–Z'],
                ['name-desc', 'Name Z–A'],
                ['size-desc', 'Largest'],
                ['size-asc', 'Smallest'],
              ].map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onSortChange(value)}
                  className={cn(sortBy === value && 'bg-primary/10 text-primary')}
                >
                  {label}
                  {sortBy === value && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          {/* View toggle */}
          <div className="flex rounded-[10px] border border-border/50 bg-muted/30 p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center justify-center h-6 w-7 rounded-[7px] transition-colors',
                viewMode === 'grid'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center justify-center h-6 w-7 rounded-[7px] transition-colors',
                viewMode === 'list'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="flex items-center gap-3 rounded-[14px] border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={onRefresh} className="ml-auto">
            Retry
          </Button>
        </div>
      )}

      {/* ── Folders ── */}
      {!error && showFolders && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Folders
          </h2>
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3'
                : 'space-y-1'
            )}
          >
            {currentFolder && <BackCard viewMode={viewMode} onClick={onGoBack} />}
            {filteredFolders.length === 0 && !currentFolder && (
              <div className="col-span-full flex items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-8 text-center">
                <p className="text-[13px] text-muted-foreground">
                  You haven&rsquo;t created any folders yet. Click <strong>Create</strong> &rarr; <strong>New Folder</strong> to organize your files.
                </p>
              </div>
            )}
            {filteredFolders.map(folder => (
              <EnterpriseFolderCard
                key={folder.id}
                folder={folder}
                viewMode={viewMode}
                color={getColor(folder.id)}
                isBookmarked={isBookmarked(folder.id)}
                onOpen={() => onOpenFolder(folder)}
                onDelete={() => onFolderDelete(folder)}
                onOpenInCbCode={() => onOpenFolderInCbCode(folder)}
                onToggleBookmark={() =>
                  onToggleBookmark({
                    id: folder.id,
                    name: folder.name,
                    type: 'folder',
                    path: folder.path,
                  })
                }
                onSetColor={c => onSetColor(folder.id, c)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Files ── */}
      {!error && (
        <section className="space-y-2">
          {(showFolders || showFiles) && (
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Files
            </h2>
          )}
          <LazyFileGrid
            files={filteredFiles}
            viewMode={viewMode}
            loading={loading}
            batchSize={24}
            emptyState={<EmptyState searchQuery={searchQuery} />}
            renderFile={(file) => (
		  <FileItem
		    key={file.id}
		    file={file}
		    viewMode={viewMode}
        onOpenInCbCode={onOpenFileInCbCode}
		    onDelete={onFileDelete}
		    onDownload={onFileDownload}
 		    onShare={onFileShare}
 		    onClick={onFileClick}
		    onPreview={() => onFileClick(file)}
		    onShareRevoked={onRefresh}
		    onShareChange={onRefresh}
		    selectionMode={selectionMode}
		    isSelected={selectedFiles.has(file.id)}
		    onToggleSelect={() => {}}
		  />
	   )}
          />
        </section>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// SharedView
// ─────────────────────────────────────────────────────────

const SharedView: React.FC<{
  files: FileItemType[];
  onFileDownload: (f: FileItemType) => void;
  onFileShare: (f: FileItemType) => void;
  onFileDelete: (f: FileItemType) => void;
  onFileClick: (f: FileItemType) => void;
  onOpenFileInCbCode: (f: FileItemType) => void;
  onRefresh: () => void;
  onViewInfo?: (f: FileItemType) => void;
}> = ({ files, onFileDownload, onFileShare, onFileDelete, onFileClick, onOpenFileInCbCode, onRefresh, onViewInfo }) => {
  const sharedFiles = useMemo(() => files.filter(f => f.shared), [files]);
  const sharedSize = useMemo(
    () => sharedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
    [sharedFiles]
  );
  const recentlyShared = useMemo(() => {
    if (sharedFiles.length === 0) return null;
    return [...sharedFiles].sort((a, b) => (
      new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
    ))[0];
  }, [sharedFiles]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shared Files</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage links and shared content from one place.</p>
        </div>
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
          {sharedFiles.length} shared
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-[14px] border border-border/50 bg-card/60 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Shared Files</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{sharedFiles.length}</p>
        </div>
        <div className="rounded-[14px] border border-border/50 bg-card/60 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Shared Size</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatFileSize(sharedSize)}</p>
        </div>
        <div className="rounded-[14px] border border-border/50 bg-card/60 p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Latest Shared</p>
          <p className="mt-2 truncate text-sm font-medium text-foreground">
            {recentlyShared ? recentlyShared.name : 'No shared files yet'}
          </p>
        </div>
      </div>

      {sharedFiles.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border/50 bg-card/30 p-8">
          <EmptyState searchQuery="" />
        </div>
      ) : (
        <div className="rounded-[16px] border border-border/50 bg-card/40 p-2">
          <div className="space-y-1">
          {sharedFiles.map(f => (
            <FileItem
              key={f.id}
              file={f}
              viewMode="list"
              onOpenInCbCode={onOpenFileInCbCode}
              onDelete={onFileDelete}
              onDownload={onFileDownload}
              onShare={onFileShare}
              onViewInfo={onViewInfo ? (file) => onViewInfo(file) : undefined}
              onClick={onFileClick}
              onPreview={() => onFileClick(f)}
              onShareRevoked={onRefresh}
              onShareChange={onRefresh}
            />
          ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// MobileFilesView
// ─────────────────────────────────────────────────────────

const MobileFilesView: React.FC<any> = ({
  loading, currentFolder, filteredFolders, filteredFiles,
  workspaceName,
  searchQuery,
  viewMode, setViewMode,
  onRefresh,
  onGoBack, onOpenFolder, onOpenFolderInCbCode, onFileClick, onOpenFileInCbCode, onFileDownload,
  onFileDelete, onFileShare, onFolderDelete, onVaultOpen,
  getColor, isBookmarked, onToggleBookmark, onSetColor,
  onViewInfo,
}) => {
  const pathParts = currentFolder.split('/').filter(Boolean);
  const activeTitle = pathParts[pathParts.length - 1] || workspaceName || 'My Files';
  const activePath = currentFolder || 'Root';

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border/50 bg-card/75 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{activeTitle}</h2>
            <p className="truncate text-xs text-muted-foreground">{activePath}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 w-8 rounded-lg p-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              if (currentFolder) onGoBack();
            }}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium',
              currentFolder
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border/50 bg-background/70 text-muted-foreground'
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {currentFolder ? 'Back' : 'Root'}
          </button>

          <div className="flex rounded-lg border border-border/50 bg-background/70 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'h-6 rounded-md px-2 text-[11px] font-medium transition-colors',
                viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'h-6 rounded-md px-2 text-[11px] font-medium transition-colors',
                viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Grid
            </button>
          </div>
        </div>

        {searchQuery && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {filteredFiles.length + filteredFolders.length} results for "{searchQuery}".
          </p>
        )}
      </section>

      {(filteredFolders.length > 0 || !currentFolder) && (
        <section className="rounded-2xl border border-border/50 bg-card/75 p-2.5">
          <h3 className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Folders</h3>
          <div className="grid grid-cols-2 gap-2">
            {/* SquidVault hidden */}
            {filteredFolders.map(folder => (
              <EnterpriseFolderCard
                key={folder.id}
                folder={folder}
                viewMode="grid"
                color={getColor(folder.id)}
                isBookmarked={isBookmarked(folder.id)}
                onOpen={() => onOpenFolder(folder)}
                onOpenInCbCode={() => onOpenFolderInCbCode(folder)}
                onDelete={() => onFolderDelete(folder)}
                onToggleBookmark={() =>
                  onToggleBookmark({ id: folder.id, name: folder.name, type: 'folder', path: folder.path })
                }
                onSetColor={c => onSetColor(folder.id, c)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border/50 bg-card/75 p-2.5">
        <h3 className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Files</h3>
        <LazyFileGrid
          files={filteredFiles}
          viewMode={viewMode}
          loading={loading}
          batchSize={18}
          emptyState={<EmptyState searchQuery={searchQuery} />}
          renderFile={(file) => (
            <RecencyFadeWrapper key={file.id} file={file}>
              <FileItem
                file={file}
                viewMode={viewMode}
                onOpenInCbCode={onOpenFileInCbCode}
                onDelete={onFileDelete}
                onDownload={onFileDownload}
                onShare={onFileShare}
              onViewInfo={onViewInfo ? (f) => onViewInfo(f) : undefined}
                onClick={onFileClick}
                onPreview={() => onFileClick(file)}
                onShareRevoked={onRefresh}
                onShareChange={onRefresh}
                selectionMode={false}
              />
            </RecencyFadeWrapper>
          )}
        />
      </section>

    </div>
  );
};

export default Dashboard;
