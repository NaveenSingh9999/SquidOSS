import React, { useMemo, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn, formatFileSize } from '@/lib/utils';
import { formatBytes } from '@/lib/api';
import type { FileItem as FileItemType, FolderItem } from '@/lib/api';
import { EnterpriseFolderCard } from '@/components/ui/EnterpriseFolderCard';
import { LazyFileGrid } from '@/components/ui/LazyFileGrid';
import FileItem from '@/components/FileItem';
import CreateUploadSegmented from '@/components/CreateUploadSegmented';
import {
  Files, Share2, Trash2, BarChart3, Database, Code,
  Settings2, Download, Cloud, Briefcase, ChevronDown,
  Sparkles, Grid3X3, List, RefreshCw, Filter,
  Plus, Lock,
  FileText, Image, Users,
  Search, ChevronLeft, Home, ChevronRight,
  CheckSquare, AlertCircle, X,
} from '@/lib/icon-map';

const COLORS = {
  bgPage: '#0C0D09',
  bgSidebar: '#0f100c',
  bgCard: '#141612',
  bgHover: '#1a1d17',
  borderSubtle: '#1e2018',
  borderDim: '#1c1e19',
  borderActive: '#2e3226',
  accent: '#6B7F5E',
  accentLight: '#a3c48a',
  textPrimary: '#eef0e8',
  textSecondary: '#888',
  textMuted: '#444',
  textDim: '#3d3d38',
};

const FILE_TYPE_COLORS: Record<string, string> = {
  json: COLORS.accent,
  md: '#7f77dd',
  zip: '#c07d3a',
  image: '#3a9e8a',
  video: '#994f6a',
  audio: '#c07d3a',
  pdf: '#7f77dd',
  txt: '#6B7F5E',
  code: '#6B7F5E',
};

function getFileTypeColor(name: string, type: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const t = type.toLowerCase();
  if (t.startsWith('image/')) return FILE_TYPE_COLORS.image;
  if (t.startsWith('video/')) return FILE_TYPE_COLORS.video;
  if (t.startsWith('audio/')) return FILE_TYPE_COLORS.audio;
  if (ext === 'json' || ext === 'yaml' || ext === 'toml' || t.includes('json')) return FILE_TYPE_COLORS.json;
  if (ext === 'md' || ext === 'txt') return FILE_TYPE_COLORS.md;
  if (ext === 'zip' || ext === 'tar' || ext === 'gz') return FILE_TYPE_COLORS.zip;
  if (ext === 'pdf') return FILE_TYPE_COLORS.pdf;
  return FILE_TYPE_COLORS.code;
}

function getFileIcon(type: string) {
  const t = type.toLowerCase();
  if (t.startsWith('image/')) return Image;
  if (t.startsWith('video/')) return FileText;
  if (t.startsWith('audio/')) return FileText;
  return FileText;
}

const SIDEBAR_ITEMS_TOP = [
  { id: 'files', icon: Files },
  { id: 'shared', icon: Share2 },
  { id: 'trash', icon: Trash2 },
  { id: 'analytics', icon: BarChart3 },
  { id: 'database', icon: Database },
  { id: 'code', icon: Code },
];

const PILL_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px',
  fontSize: 12,
  color: '#888',
  cursor: 'pointer',
  transition: 'all 130ms ease',
  borderRadius: 4,
};

interface SquidDashboardUIProps {
  loading: boolean;
  currentFolder: string;
  filteredFolders: FolderItem[];
  filteredFiles: FileItemType[];
  files: FileItemType[];
  folders: FolderItem[];
  totalSize: number;
  searchQuery: string;
  viewMode: 'grid' | 'list';
  setViewMode: (m: 'grid' | 'list') => void;
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
  onViewInfo?: (f: FileItemType) => void;
  error: string | null;
  activeWorkspaceName?: string;
  activeProviderLabel?: string;
  onToggleUI?: () => void;
}

const SquidDashboardUI: React.FC<SquidDashboardUIProps> = ({
  loading, error, currentFolder, filteredFolders, filteredFiles,
  files, folders, totalSize, searchQuery,
  viewMode, setViewMode,
  onGoBack, onNavigateTo, onOpenFolder,
  onOpenFolderInCbCode, onFileClick, onOpenFileInCbCode,
  onFileDownload, onFileDelete, onFileShare,
  onFolderDelete, onVaultOpen, onRefresh,
  bookmarks, getColor, isBookmarked, onToggleBookmark, onSetColor,
  selectionMode, selectedFiles, onToggleSelection, onSelectAll,
  onFileCreated, onUploadComplete,
  createDisabled, onCreateBlocked,
  onViewInfo, error: _error,
  activeWorkspaceName, activeProviderLabel,
  onToggleUI,
}) => {
  const [activeTab, setActiveTab] = useState('files');
  const [sidebarTab, setSidebarTab] = useState('files');

  const showFolders = filteredFolders.length > 0 || !currentFolder;
  const showFiles = filteredFiles.length > 0;

  const sharedCount = useMemo(() => files.filter(f => f.shared).length, [files]);
  const encryptedCount = useMemo(() => files.filter(f => f.encrypted).length, [files]);
  const storageUsed = totalSize;
  const storagePct = useMemo(() => {
    if (totalSize === 0) return 0;
    return Math.min(100, Math.round((totalSize / (1024 * 1024 * 1024)) * 100));
  }, [totalSize]);

  const sidebarActiveStyle = (isActive: boolean): React.CSSProperties => ({
    background: isActive ? '#1a1d17' : 'transparent',
    color: isActive ? '#a3c48a' : '#3d3d38',
    position: 'relative',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#0C0D09' }}>
      {/* ───── SIDEBAR (52px) ───── */}
      <SidebarSection activeTab={sidebarTab} onTabChange={setSidebarTab} onToggleUI={onToggleUI} />

      {/* ───── MAIN ───── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ───── TOPBAR (46px) ───── */}
        <TopbarSection
          activeProviderLabel={activeProviderLabel}
          activeWorkspaceName={activeWorkspaceName}
        />

        {/* ───── TAB BAR ───── */}
        <TabBarSection activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ───── BODY ───── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>

            {activeTab === 'files' && (
              <>
                {/* Stats Row */}
                <StatsRowSection
                  files={files}
                  folders={folders}
                  totalSize={totalSize}
                  storagePct={storagePct}
                />

                {/* Files Section */}
                <FilesSectionContent
                  loading={loading}
                  currentFolder={currentFolder}
                  filteredFolders={filteredFolders}
                  filteredFiles={filteredFiles}
                  files={files}
                  folders={folders}
                  totalSize={totalSize}
                  searchQuery={searchQuery}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  onGoBack={onGoBack}
                  onNavigateTo={onNavigateTo}
                  onOpenFolder={onOpenFolder}
                  onOpenFolderInCbCode={onOpenFolderInCbCode}
                  onFileClick={onFileClick}
                  onOpenFileInCbCode={onOpenFileInCbCode}
                  onFileDownload={onFileDownload}
                  onFileDelete={onFileDelete}
                  onFileShare={onFileShare}
                  onFolderDelete={onFolderDelete}
                  onVaultOpen={onVaultOpen}
                  onRefresh={onRefresh}
                  bookmarks={bookmarks}
                  getColor={getColor}
                  isBookmarked={isBookmarked}
                  onToggleBookmark={onToggleBookmark}
                  onSetColor={onSetColor}
                  selectionMode={selectionMode}
                  selectedFiles={selectedFiles}
                  onToggleSelection={onToggleSelection}
                  onSelectAll={onSelectAll}
                  onFileCreated={onFileCreated}
                  onUploadComplete={onUploadComplete}
                  createDisabled={createDisabled}
                  onCreateBlocked={onCreateBlocked}
                  onViewInfo={onViewInfo}
                  error={_error}
                />
              </>
            )}

            {activeTab === 'shared' && (
              <div style={{ padding: '24px 0', color: '#888', textAlign: 'center', fontSize: 13 }}>
                Shared files view
              </div>
            )}

            {activeTab === 'trash' && (
              <div style={{ padding: '24px 0', color: '#888', textAlign: 'center', fontSize: 13 }}>
                Trash view
              </div>
            )}

            {activeTab === 'analytics' && (
              <div style={{ padding: '24px 0', color: '#888', textAlign: 'center', fontSize: 13 }}>
                Analytics view
              </div>
            )}

            {activeTab === 'database' && (
              <div style={{ padding: '24px 0', color: '#888', textAlign: 'center', fontSize: 13 }}>
                Storage view
              </div>
            )}

            {activeTab === 'code' && (
              <div style={{ padding: '24px 0', color: '#888', textAlign: 'center', fontSize: 13 }}>
                Code view
              </div>
            )}
          </div>
        </div>

        {/* ───── BOTTOM BAR (50px) ───── */}
        <BottomBarSection
          currentFolder={currentFolder}
          onFileCreated={onFileCreated}
          onUploadComplete={onUploadComplete}
          createDisabled={!!createDisabled}
          onCreateBlocked={onCreateBlocked}
        />
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   Sidebar Section
   ──────────────────────────────────────────── */
const SidebarSection: React.FC<{ activeTab: string; onTabChange: (t: string) => void; onToggleUI?: () => void }> = ({
  activeTab, onTabChange, onToggleUI,
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = React.useState(activeTab);

  const handleTabChange = (tabId: string) => {
    setActiveSidebarTab(tabId);
    onTabChange(tabId);
  };

  return (
    <aside
      style={{
        width: 52,
        flexShrink: 0,
        background: '#0f100c',
        borderRight: '0.5px solid #1c1e19',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '12px 0',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
        {SIDEBAR_ITEMS_TOP.map(item => {
          const isActive = activeSidebarTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              title={item.id}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                background: isActive ? '#1a1d17' : 'transparent',
                color: isActive ? '#a3c48a' : '#3d3d38',
                transition: 'all 130ms ease',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = '#181a15';
                  e.currentTarget.style.color = '#7a8f6a';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#3d3d38';
                }
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 18,
                    background: '#6B7F5E',
                    borderRadius: '0 3px 3px 0',
                  }}
                />
              )}
              <item.icon size={16} />
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 8 }}>
        <SidebarIconButton icon={Settings2} tooltip="Settings" />
        <SidebarIconButton icon={Download} tooltip="Downloads" />
        {onToggleUI && <SidebarIconButton icon={Grid3X3} tooltip="Classic UI" onClick={onToggleUI} />}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: '#1e2418',
            border: '0.5px solid #2e3226',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a3c48a',
            fontSize: 12,
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          N
        </div>
      </div>
    </aside>
  );
};

const SidebarIconButton: React.FC<{ icon: React.ComponentType<{ size?: number }>; tooltip: string; onClick?: () => void }> = ({ icon: Icon, tooltip, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={tooltip}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? '#181a15' : 'transparent',
        color: hovered ? '#7a8f6a' : '#3d3d38',
        transition: 'all 130ms ease',
      }}
    >
      <Icon size={16} />
    </button>
  );
};

/* ────────────────────────────────────────────
   Topbar Section
   ──────────────────────────────────────────── */
const TopbarSection: React.FC<{
  activeProviderLabel?: string;
  activeWorkspaceName?: string;
}> = ({ activeProviderLabel, activeWorkspaceName }) => {
  return (
    <div
      style={{
        height: 46,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        borderBottom: '0.5px solid #191b16',
        background: '#0C0D09',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Provider Pill */}
        <button style={PILL_STYLE}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6B7F5E', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#888', lineHeight: '16px' }}>{activeProviderLabel || 'SquidCloud'}</span>
          <ChevronDown size={12} color="#888" />
        </button>

        {/* Workspace Pill */}
        <button style={PILL_STYLE}>
          <Briefcase size={13} color="#6B7F5E" />
          <span style={{ fontSize: 12, color: '#888', lineHeight: '16px' }}>{activeWorkspaceName || 'Workspace'}</span>
          <ChevronDown size={12} color="#888" />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: '#141612',
            border: '0.5px solid #1e2018',
            borderRadius: 9,
            fontSize: 11,
            color: '#444',
          }}
        >
          <Sparkles size={12} color="#6B7F5E" />
          Free plan
        </div>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: '#6B7F5E',
            color: '#0c0d09',
            border: 'none',
            borderRadius: 9,
            fontWeight: 500,
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 130ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <Share2 size={14} />
          Share
        </button>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   Tab Bar Section
   ──────────────────────────────────────────── */
const TABS = [
  { id: 'files', label: 'Files', icon: Files },
  { id: 'shared', label: 'Shared', icon: Share2 },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'database', label: 'Storage', icon: Database },
];

const TabBarSection: React.FC<{ activeTab: string; onTabChange: (t: string) => void }> = ({
  activeTab, onTabChange,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        borderBottom: '0.5px solid #191b16',
        background: '#0C0D09',
        height: 40,
        flexShrink: 0,
        gap: 0,
      }}
    >
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 16px',
              height: '100%',
              border: 'none',
              borderBottom: isActive ? '2px solid #6B7F5E' : '2px solid transparent',
              background: 'transparent',
              color: isActive ? '#a3c48a' : '#3d3d38',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 130ms ease',
              fontWeight: isActive ? 500 : 400,
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#888'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#3d3d38'; }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

/* ────────────────────────────────────────────
   Stats Row Section
   ──────────────────────────────────────────── */
interface StatsRowSectionProps {
  files: FileItemType[];
  folders: FolderItem[];
  totalSize: number;
  storagePct: number;
}

const StatsRowSection: React.FC<StatsRowSectionProps> = ({
  files, folders, totalSize, storagePct,
}) => {
  const storageUsedDisplay = useMemo(() => formatBytes(totalSize), [totalSize]);

  const cardBase: React.CSSProperties = {
    background: '#141612',
    border: '0.5px solid #1e2018',
    borderRadius: 12,
    padding: '14px 16px',
    transition: 'all 130ms ease',
    cursor: 'default',
  };

  return (
    <div style={{ display: 'flex', gap: 12, paddingTop: 20, paddingBottom: 20 }}>
      {/* Storage Card */}
      <div
        style={{
          ...cardBase,
          width: 260,
          flexShrink: 0,
          padding: 20,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#3d3d38', marginBottom: 16, textTransform: 'uppercase' }}>
          Storage Usage
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* SVG Ring */}
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#1a1d17" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="32"
              fill="none"
              stroke="#6B7F5E"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(storagePct / 100) * 201} 201`}
              strokeDashoffset={0}
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 500ms ease' }}
            />
            <text x="40" y="36" textAnchor="middle" fill="#eef0e8" fontSize="20" fontWeight="600">
              {storagePct}%
            </text>
            <text x="40" y="52" textAnchor="middle" fill="#444" fontSize="10">
              bytes
            </text>
          </svg>

          <div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#eef0e8', lineHeight: '32px' }}>
              {storageUsedDisplay}
            </div>
            <div style={{ fontSize: 12, color: '#4a4d42', marginTop: 2 }}>
              of unlimited storage
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                padding: '3px 8px',
                background: '#1a1d17',
                borderRadius: 6,
                fontSize: 10,
                color: '#6B7F5E',
              }}
            >
              <Sparkles size={10} />
              Free plan
            </div>
          </div>
        </div>

        {/* Segmented bar */}
        <div style={{ marginTop: 16, height: 6, borderRadius: 4, background: '#1e2018', overflow: 'hidden' }}>
          <div style={{ width: `${storagePct}%`, height: '100%', background: '#6B7F5E', borderRadius: 4, transition: 'width 500ms ease' }} />
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#444' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6B7F5E' }} />
            Used
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#444' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e2018' }} />
            Free
          </div>
        </div>
      </div>

          {/* Stat grid — storage usage + members only */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
            <StatCard
              icon={Users}
              iconBg="#7f77dd20"
              iconColor="#7f77dd"
              value={1}
              label="Members"
              badge="Solo"
              trend=""
            />
            <div
              style={{
                background: '#141612',
                border: '0.5px solid #1e2018',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>Files</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#eef0e8' }}>{files.length}</div>
              <div style={{ fontSize: 10, color: '#333', marginTop: 4 }}>
                {files.length > 0 ? '↑ New today' : 'No files yet'}
              </div>
            </div>
          </div>
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ComponentType<{ size?: number }>;
  iconBg?: string;
  iconColor: string;
  value: number | string;
  label: string;
  badge?: string;
  trend?: string;
  trendUp?: boolean;
  neutral?: boolean;
  dashed?: boolean;
}> = ({ icon: Icon, iconBg, iconColor, value, label, badge, trend, trendUp, dashed }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: '#141612',
        border: dashed ? '0.5px dashed #1e2018' : '0.5px solid #1e2018',
        borderRadius: 12,
        padding: '14px 16px',
        transition: 'all 130ms ease',
        cursor: dashed ? 'pointer' : 'default',
        borderColor: hovered ? '#2e3226' : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {dashed ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', gap: 6, color: '#3d3d38' }}>
          <Icon size={20} />
          <span style={{ fontSize: 11 }}>Add widget</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: iconBg || 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={14} color={iconColor} />
            </div>
            {badge && (
              <span style={{ fontSize: 10, color: '#444', padding: '1px 6px', borderRadius: 4, background: '#1a1d17' }}>
                {badge}
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#eef0e8', lineHeight: '26px' }}>
            {value}
          </div>
          <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>{label}</div>
          {trend && (
            <div style={{ fontSize: 10, marginTop: 6, color: trendUp ? '#6B7F5E' : '#333' }}>
              {trendUp && <span style={{ marginRight: 2 }}>↑</span>}
              {trend}
              {!trendUp && trend === 'All secured' && <span style={{ color: '#6B7F5E', marginLeft: 2 }}>✓</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ searchQuery: string }> = ({ searchQuery }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
    <div style={{ width: 56, height: 56, borderRadius: 14, background: '#1a1d17', border: '0.5px solid #1e2018', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
      <Files size={24} color="#3d3d38" />
    </div>
    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#eef0e8', margin: '0 0 4px' }}>
      {searchQuery ? 'No files found' : 'No files here yet'}
    </h3>
    <p style={{ fontSize: 12, color: '#444', maxWidth: 280, margin: 0 }}>
      {searchQuery
        ? `No results for "${searchQuery}". Try a different search term.`
        : 'Upload files or create folders to get started.'}
    </p>
  </div>
);

/* ────────────────────────────────────────────
   Files Section Content
   ──────────────────────────────────────────── */
interface FilesSectionContentProps {
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
  onViewInfo?: (f: FileItemType) => void;
}

const FilesSectionContent: React.FC<FilesSectionContentProps> = ({
  loading, error, currentFolder, filteredFolders, filteredFiles,
  files, folders, totalSize, searchQuery,
  viewMode, setViewMode,
  onGoBack, onNavigateTo, onOpenFolder,
  onOpenFolderInCbCode, onFileClick, onOpenFileInCbCode,
  onFileDownload, onFileDelete, onFileShare,
  onFolderDelete, onVaultOpen, onRefresh,
  bookmarks, getColor, isBookmarked, onToggleBookmark, onSetColor,
  selectionMode, selectedFiles, onToggleSelection, onSelectAll,
  onFileCreated, onUploadComplete,
  createDisabled, onCreateBlocked,
  onViewInfo,
}) => {
  const showFolders = filteredFolders.length > 0 || !currentFolder;
  const showFiles = filteredFiles.length > 0;

  const BreadcrumbBar = () => {
    if (!currentFolder) return null;
    const parts = currentFolder.split('/').filter(Boolean);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#444', marginBottom: 8 }}>
        <button
          onClick={() => onNavigateTo('')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Home size={12} />
        </button>
        {parts.map((part, i) => {
          const path = parts.slice(0, i + 1).join('/');
          const isLast = i === parts.length - 1;
          return (
            <React.Fragment key={path}>
              <ChevronRight size={10} color="#333" />
              <button
                onClick={() => !isLast && onNavigateTo(path)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: isLast ? 'default' : 'pointer',
                  color: isLast ? '#eef0e8' : '#888',
                  fontSize: 12,
                  padding: 0,
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {part}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#3d3d38', textTransform: 'uppercase' }}>
            FILES
          </span>
          {currentFolder && <BreadcrumbBar />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ToolBarButton icon={selectionMode ? X : CheckSquare} onClick={onToggleSelection} />
          <ToolBarButton icon={RefreshCw} onClick={onRefresh} />
          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: 6, border: '0.5px solid #1e2018', overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: viewMode === 'grid' ? '#1a1d17' : 'transparent',
                color: viewMode === 'grid' ? '#a3c48a' : '#333',
                cursor: 'pointer',
                transition: 'all 130ms ease',
              }}
            >
              <Grid3X3 size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: viewMode === 'list' ? '#1a1d17' : 'transparent',
                color: viewMode === 'list' ? '#a3c48a' : '#333',
                cursor: 'pointer',
                transition: 'all 130ms ease',
              }}
            >
              <List size={13} />
            </button>
          </div>
          <ToolBarButton icon={Filter} onClick={() => {}} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, border: '0.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
          <AlertCircle size={20} color="rgba(239,68,68,0.8)" />
          <span style={{ fontSize: 13, color: 'rgba(239,68,68,0.8)', flex: 1 }}>{error}</span>
          <button onClick={onRefresh} style={{ padding: '6px 12px', borderRadius: 8, border: '0.5px solid #1e2018', background: '#141612', color: '#888', fontSize: 12, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Folders */}
      {!error && showFolders && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#3d3d38', textTransform: 'uppercase', marginBottom: 8 }}>
            FOLDERS
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(172px, 1fr))' : '1fr',
              gap: 8,
            }}
          >
            {currentFolder && (
              <div
                onClick={onGoBack}
                style={{
                  padding: viewMode === 'grid' ? 16 : '10px 12px',
                  borderRadius: 12,
                  border: '0.5px dashed #1e2018',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: viewMode === 'grid' ? 'column' : 'row',
                  gap: viewMode === 'grid' ? 12 : 10,
                  alignItems: viewMode === 'grid' ? 'flex-start' : 'center',
                  transition: 'all 130ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2e3226'; e.currentTarget.style.background = '#1a1d17'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2018'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: viewMode === 'grid' ? 40 : 32, height: viewMode === 'grid' ? 40 : 32, borderRadius: viewMode === 'grid' ? 10 : 8, background: '#0C0D09', border: '0.5px solid #1e2018', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                  <ChevronLeft size={viewMode === 'grid' ? 16 : 14} />
                </div>
                {viewMode === 'grid' ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#888' }}>Back</div>
                    <div style={{ fontSize: 10, color: '#444' }}>Up one level</div>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#888' }}>Back</span>
                )}
              </div>
            )}
            {filteredFolders.length === 0 && !currentFolder && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', borderRadius: 12, border: '0.5px dashed #1e2018', background: 'transparent' }}>
                <span style={{ fontSize: 12, color: '#444' }}>No folders yet. Create one to organize your files.</span>
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
        </div>
      )}

      {/* Files grid */}
      {!error && (
        <div>
          <LazyFileGrid
            files={filteredFiles}
            viewMode={viewMode}
            loading={loading}
            batchSize={24}
            emptyState={<EmptyState searchQuery={searchQuery} />}
            renderFile={(file) => (
              <NewFileCard
                key={file.id}
                file={file}
                viewMode={viewMode}
                onClick={onFileClick}
                onDelete={onFileDelete}
                onDownload={onFileDownload}
                onShare={onFileShare}
                onViewInfo={onViewInfo}
                onOpenInCbCode={onOpenFileInCbCode}
                selectionMode={selectionMode}
                isSelected={selectedFiles.has(file.id)}
                onShareRevoked={onRefresh}
                onShareChange={onRefresh}
              />
            )}
          />
        </div>
      )}
    </div>
  );
};

const ToolBarButton: React.FC<{ icon: React.ComponentType<{ size?: number }>; onClick: () => void }> = ({ icon: Icon, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? '#1a1d17' : 'transparent',
        color: hovered ? '#888' : '#333',
        transition: 'all 130ms ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon size={13} />
    </button>
  );
};

/* ────────────────────────────────────────────
   New File Card
   ──────────────────────────────────────────── */
interface NewFileCardProps {
  file: FileItemType;
  viewMode: 'grid' | 'list';
  onClick?: (file: FileItemType) => void;
  onDelete?: (file: FileItemType) => void;
  onDownload?: (file: FileItemType) => void;
  onShare?: (file: FileItemType) => void;
  onViewInfo?: (file: FileItemType) => void;
  onOpenInCbCode?: (file: FileItemType) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onShareRevoked?: (id: string) => void;
  onShareChange?: (id: string) => void;
}

const NewFileCard: React.FC<NewFileCardProps> = ({
  file, viewMode, onClick, onDelete, onDownload, onShare, onViewInfo,
  onOpenInCbCode, selectionMode, isSelected, onShareRevoked, onShareChange,
}) => {
  const [hovered, setHovered] = useState(false);
  const typeColor = getFileTypeColor(file.name, file.type || '');
  const Icon = getFileIcon(file.type || '');

  const handleClick = () => {
    onClick?.(file);
  };

  const sizeDisplay = useMemo(() => formatBytes(file.size || 0), [file.size]);
  const dateDisplay = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(file.created_at || file.updated_at), { addSuffix: true });
    } catch { return ''; }
  }, [file.created_at, file.updated_at]);

  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (viewMode === 'list') {
    return (
      <FileItem
        file={file}
        viewMode="list"
        onClick={onClick}
        onDelete={onDelete}
        onDownload={onDownload}
        onShare={onShare}
        onViewInfo={onViewInfo}
        onOpenInCbCode={onOpenInCbCode}
        onPreview={() => onClick?.(file)}
        selectionMode={selectionMode}
        isSelected={isSelected}
        onShareRevoked={onShareRevoked}
        onShareChange={onShareChange}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        background: '#141612',
        border: '0.5px solid #1e2018',
        borderRadius: 12,
        padding: 14,
        cursor: 'pointer',
        transition: 'all 130ms ease',
        overflow: 'hidden',
        borderColor: hovered ? '#2e3226' : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: hovered ? '#6B7F5E' : 'transparent',
          transition: 'background 130ms ease',
        }}
      />

      {/* Icon square */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: '#1a1d17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <Icon size={16} color={typeColor} />
      </div>

      {/* File name */}
      <div
        style={{
          fontSize: 12,
          color: '#ccc',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 4,
        }}
        title={file.name}
      >
        {file.name}
      </div>

      {/* Meta */}
      <div style={{ fontSize: 10, color: '#3a3a35', marginBottom: 8 }}>
        {sizeDisplay} · {dateDisplay}
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {file.encrypted && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 4, background: '#1a2018', color: '#6B7F5E', fontSize: 9 }}>
            <Lock size={8} />
            Encrypted
          </span>
        )}
        {ext && (
          <span style={{ padding: '1px 5px', borderRadius: 4, background: '#1e1a10', color: '#c07d3a', fontSize: 9 }}>
            {ext}
          </span>
        )}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   Bottom Bar Section
   ──────────────────────────────────────────── */
const BottomBarSection: React.FC<{
  currentFolder: string;
  onFileCreated: () => void;
  onUploadComplete: (f: FileItemType) => void;
  createDisabled: boolean;
  onCreateBlocked?: () => void;
}> = ({ currentFolder, onFileCreated, onUploadComplete, createDisabled, onCreateBlocked }) => {
  return (
    <div
      style={{
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        borderTop: '0.5px solid #191b16',
        background: '#0C0D09',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CreateUploadSegmented
          currentFolder={currentFolder}
          onFileCreated={onFileCreated}
          onUploadComplete={onUploadComplete}
          disabled={createDisabled}
          onDisabledClick={onCreateBlocked}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#444', fontSize: 11 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6B7F5E' }} />
        SquidCloud · Free
      </div>
    </div>
  );
};

export default SquidDashboardUI;
