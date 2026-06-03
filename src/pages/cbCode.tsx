
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { downloadFileWithRes54, uploadFileWithRes54 } from '@/lib/res54';
import MonacoEditor from '@/components/MonacoEditor';
import {
  DEFAULT_CBCODE_PREFERENCES,
  DEFAULT_CBCODE_SESSION_STATE,
  loadCbCodeBootstrap,
  resolveCbCodeWorkspaceId,
  saveCbCodePreferences,
  saveCbCodeSessionState,
  saveCbCodeSnapshot,
  toMonacoOptions,
  type CbCodeIDEPreferences,
  type CbCodeSessionState,
} from '@/services/cbcodeIDEService';
import {
  ArrowLeft,
  FileText,
  Folder,
  Play,
  Save,
  Download,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Code,
  FileJson,
  FileCode,
  FolderPlus,
  FilePlus,
  Trash2,
  Search,
  Sun,
  Moon,
  RefreshCw
} from '@/lib/icon-map';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface EditorTab {
  id: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  filePath: string;
  fileId?: string;
  realFile?: any;
}

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  expanded?: boolean;
  content?: string;
  parentPath: string;
  realFile?: any;
}

const CbCode = () => {
  const { folderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'folder'>('file');
  const [createName, setCreateName] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [currentProject, setCurrentProject] = useState<string>('');
  const [realFiles, setRealFiles] = useState<any[]>([]);
  const [realFolders, setRealFolders] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [idePreferences, setIdePreferences] = useState<CbCodeIDEPreferences>(DEFAULT_CBCODE_PREFERENCES);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const monacoOptions = useMemo(() => ({
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', monospace",
    automaticLayout: true,
    ...toMonacoOptions(idePreferences),
  }), [idePreferences]);

  useEffect(() => {
    const resolveWorkspace = async () => {
      if (!user?.id) return;
      const workspaceId = await resolveCbCodeWorkspaceId(user.id);
      setActiveWorkspaceId(workspaceId);
    };

    void resolveWorkspace();
  }, [user?.id]);

  useEffect(() => {
    initializeProject();
  }, [folderId, activeWorkspaceId, user?.id]);

  useEffect(() => {
    const hydrateSession = async () => {
      if (!user?.id || !activeWorkspaceId) return;

      const { preferences, sessionState } = await loadCbCodeBootstrap(user.id, activeWorkspaceId);
      setIdePreferences(preferences);
      setShowTerminal(Boolean(sessionState.showTerminal));
      setSearchQuery(sessionState.searchQuery || '');
      setSessionHydrated(true);
    };

    void hydrateSession();
  }, [user?.id, activeWorkspaceId]);

  useEffect(() => {
    if (!user?.id || !activeWorkspaceId || !sessionHydrated) return;

    const timer = window.setTimeout(() => {
      void saveCbCodePreferences(user.id, activeWorkspaceId, idePreferences);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [idePreferences, user?.id, activeWorkspaceId, sessionHydrated]);

  const initializeProject = async () => {
    if (!user) return;
    
    setLoading(true);
    
    try {
      if (folderId && folderId !== 'current') {
        await loadRealFolder(folderId);
      } else {
        await loadCurrentFolder();
      }
    } catch (error) {
      console.error('Failed to initialize project:', error);
      toast({
        title: "Load Error",
        description: "Failed to load project files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRealFolder = async (folderId: string) => {
    try {
      let filesQuery: any = supabase
        .from('files')
        .select('*')
        .eq('parent_folder', folderId);

      let foldersQuery: any = supabase
        .from('folders')
        .select('*')
        .eq('parent_folder', folderId);

      if (activeWorkspaceId) {
        filesQuery = filesQuery.eq('workspace_id', activeWorkspaceId);
        foldersQuery = foldersQuery.eq('workspace_id', activeWorkspaceId);
      }

      const { data: files, error: filesError } = await filesQuery;

      const { data: folders, error: foldersError } = await foldersQuery;

      const { data: currentFolderMeta } = await supabase
        .from('folders')
        .select('name, path')
        .eq('id', folderId)
        .maybeSingle();

      if (filesError) {
        console.error('Files error:', filesError);
        throw filesError;
      }
      if (foldersError) {
        console.error('Folders error:', foldersError);
        throw foldersError;
      }

      setRealFiles(files || []);
      setRealFolders(folders || []);
      setCurrentProject(currentFolderMeta?.name || 'Workspace Folder');
      setSelectedPath(currentFolderMeta?.path || '');
      sessionStorage.setItem('cbcode_last_folder', folderId);

      // Convert to file tree structure
      const treeNodes: FileNode[] = [];
      
      // Add folders
      (folders || []).forEach(folder => {
        treeNodes.push({
          id: folder.id,
          name: folder.name,
          type: 'folder',
          expanded: false,
          parentPath: folder.parent_folder || '',
          children: [],
          realFile: folder
        });
      });

      // Add files
      (files || []).forEach(file => {
        treeNodes.push({
          id: file.id,
          name: file.name,
          type: 'file',
          parentPath: file.parent_folder || '',
          realFile: file
        });
      });

      setFileTree(treeNodes);

      // Auto-open specific file if specified in URL
      const targetFile = searchParams.get('file');
      if (targetFile) {
        const fileNode = treeNodes.find(node => 
          node.type === 'file' && node.name === targetFile
        );
        if (fileNode) {
          await openRealFileInEditor(fileNode);
        }
      }

    } catch (error) {
      console.error('Failed to load real folder:', error);
    }
  };

  const loadCurrentFolder = async () => {
    try {
      let filesQuery: any = supabase
        .from('files')
        .select('*')
        .is('parent_folder', null);

      let foldersQuery: any = supabase
        .from('folders')
        .select('*')
        .is('parent_folder', null);

      if (activeWorkspaceId) {
        filesQuery = filesQuery.eq('workspace_id', activeWorkspaceId);
        foldersQuery = foldersQuery.eq('workspace_id', activeWorkspaceId);
      }

      const { data: files, error: filesError } = await filesQuery;

      const { data: folders, error: foldersError } = await foldersQuery;

      if (filesError) {
        console.error('Files error:', filesError);
        throw filesError;
      }
      if (foldersError) {
        console.error('Folders error:', foldersError);
        throw foldersError;
      }

      setRealFiles(files || []);
      setRealFolders(folders || []);
      setCurrentProject('Workspace Root');
      setSelectedPath('');

      // Convert to file tree structure
      const treeNodes: FileNode[] = [];
      
      // Add folders
      (folders || []).forEach(folder => {
        treeNodes.push({
          id: folder.id,
          name: folder.name,
          type: 'folder',
          expanded: false,
          parentPath: '',
          children: [],
          realFile: folder
        });
      });

      // Add files
      (files || []).forEach(file => {
        treeNodes.push({
          id: file.id,
          name: file.name,
          type: 'file',
          parentPath: '',
          realFile: file
        });
      });

      setFileTree(treeNodes);

    } catch (error) {
      console.error('Failed to load current folder:', error);
    }
  };

  const openRealFileInEditor = async (file: FileNode) => {
    if (file.type !== 'file' || !file.realFile) return;

    const existingTab = tabs.find(tab => tab.fileId === file.realFile.id);
    if (existingTab) {
      setActiveTab(existingTab.id);
      return;
    }

    try {
      let content = '';
      
      // Check if file uses Res54 encryption
      if (file.realFile.encrypted && file.realFile.storage_path === 'res54_distributed') {
        try {
          const blob = await downloadFileWithRes54(file.realFile.id, {
            reason: 'editor',
            fileName: file.name,
          });
          content = await blob.text();
        } catch (error) {
          console.error('Failed to decrypt Res54 file:', error);
          toast({
            title: "Decryption Error",
            description: `Failed to decrypt ${file.name}. Please try again.`,
            variant: "destructive",
          });
          return;
        }
      } else {
        // Standard storage file
        const { data, error } = await supabase.storage
          .from('files')
          .download(file.realFile.storage_path);

        if (error) {
          console.error('Storage download error:', error);
          throw error;
        }

        content = await data.text();
      }

      const newTab: EditorTab = {
        id: file.id,
        name: file.name,
        content: content,
        language: getLanguageFromFilename(file.name),
        isDirty: false,
        filePath: getFullPath(file),
        fileId: file.realFile.id,
        realFile: file.realFile
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);

    } catch (error) {
      console.error('Failed to load file content:', error);
      toast({
        title: "Load Error",
        description: `Failed to load ${file.name}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'py': 'python',
      'md': 'markdown',
      'txt': 'plaintext',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'java': 'java',
      'sql': 'sql'
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  const getFullPath = (node: FileNode): string => {
    return node.parentPath ? `${node.parentPath}/${node.name}` : node.name;
  };

  const closeTab = (tabId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    const tab = tabs.find(t => t.id === tabId);
    if (tab?.isDirty) {
      if (!confirm(`${tab.name} has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);
    
    if (activeTab === tabId) {
      if (newTabs.length > 0) {
        setActiveTab(newTabs[newTabs.length - 1].id);
      } else {
        setActiveTab('');
      }
    }
  };

  const saveFile = useCallback(async (
    tabId: string,
    saveReason: 'manual' | 'autosave' | 'run' = 'manual'
  ) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.realFile) return;

    try {
      // Check if file uses Res54 encryption
      if (tab.realFile.encrypted && tab.realFile.storage_path === 'res54_distributed') {
        // Create a File object from the content
        const blob = new Blob([tab.content], { type: 'text/plain' });
        const file = new File([blob], tab.name, { type: 'text/plain' });
        
        try {
          // Upload with Res54 encryption
          await uploadFileWithRes54(file, () => {});
          
          // Play success sound
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0FMIzS9N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0FLIHg8tsJNgcYZbrk6qNTDAl6mdLH8dmJPgcZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0FLIHg8tsJNgcYZbrk6qNTDAl6mdLH8dmJPgcZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0F');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore audio errors
          } catch {}
          
        } catch (error) {
          console.error('Failed to save encrypted file:', error);
          throw error;
        }
      } else {
        // Standard storage file
        const blob = new Blob([tab.content], { type: 'text/plain' });
        
        const { error } = await supabase.storage
          .from('files')
          .update(tab.realFile.storage_path, blob, {
            contentType: 'text/plain',
            upsert: true
          });

        if (error) {
          console.error('Storage update error:', error);
          throw error;
        }
      }

      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isDirty: false } : t));

      if (user?.id && activeWorkspaceId && tab.realFile?.id) {
        await saveCbCodeSnapshot({
          userId: user.id,
          workspaceId: activeWorkspaceId,
          fileId: tab.realFile.id,
          language: tab.language,
          content: tab.content,
          reason: saveReason,
          metadata: {
            fileName: tab.name,
            encrypted: Boolean(tab.realFile.encrypted),
            filePath: tab.filePath,
          },
        });
      }
      
      if (saveReason === 'manual') {
        toast({
          title: "File Saved",
          description: `${tab.name} saved successfully ✅`,
        });
      }

    } catch (error) {
      console.error('Failed to save file:', error);
      toast({
        title: "Save Error",
        description: `Failed to save ${tab.name}. Please try again.`,
        variant: "destructive",
      });
    }
  }, [tabs, toast, user?.id, activeWorkspaceId]);

  const saveAllFiles = useCallback(async () => {
    const dirtyTabs = tabs.filter(tab => tab.isDirty);
    if (dirtyTabs.length === 0) {
      toast({
        title: 'Nothing to save',
        description: 'All open files are already up to date.',
      });
      return;
    }

    for (const tab of dirtyTabs) {
      await saveFile(tab.id, 'manual');
    }
  }, [tabs, toast, saveFile]);

  const handleCreateItem = useCallback(async () => {
    if (!user) return;

    const trimmedName = createName.trim();
    if (!trimmedName) {
      toast({
        title: 'Name required',
        description: 'Please provide a valid name.',
        variant: 'destructive',
      });
      return;
    }

    const parentFolderId = folderId && folderId !== 'current' ? folderId : null;

    try {
      if (createType === 'folder') {
        const folderData: any = {
          name: trimmedName,
          path: selectedPath ? `${selectedPath}/${trimmedName}` : trimmedName,
          parent_folder: parentFolderId,
          user_id: user.id,
        };

        if (activeWorkspaceId) {
          folderData.workspace_id = activeWorkspaceId;
        }

        const { error } = await supabase
          .from('folders')
          .insert(folderData);

        if (error) throw error;

        toast({
          title: 'Folder created',
          description: `${trimmedName} is ready in explorer.`,
        });
      } else {
        const fileName = /\.[A-Za-z0-9]+$/.test(trimmedName) ? trimmedName : `${trimmedName}.txt`;
        const ext = fileName.split('.').pop()?.toLowerCase() || 'txt';

        const defaultContentByExt: Record<string, string> = {
          js: '// New JavaScript file\n',
          ts: '// New TypeScript file\n',
          py: '# New Python file\n',
          html: '<!doctype html>\n<html>\n  <head></head>\n  <body></body>\n</html>\n',
          css: '/* New stylesheet */\n',
          json: '{\n  "name": "new-file"\n}\n',
          md: '# New Markdown File\n',
        };

        const content = defaultContentByExt[ext] || '';
        const contentType = ext === 'json' ? 'application/json' : 'text/plain';
        const storagePath = `${user.id}/cbcode/${Date.now()}-${fileName}`;
        const blob = new Blob([content], { type: contentType });

        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(storagePath, blob, {
            contentType,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const fileData: any = {
          name: fileName,
          type: contentType,
          size: blob.size,
          storage_path: storagePath,
          parent_folder: parentFolderId,
          user_id: user.id,
          encrypted: false,
          shared: false,
        };

        if (activeWorkspaceId) {
          fileData.workspace_id = activeWorkspaceId;
        }

        const { data: createdFile, error: insertError } = await supabase
          .from('files')
          .insert(fileData)
          .select('*')
          .single();

        if (insertError) throw insertError;

        toast({
          title: 'File created',
          description: `${fileName} created and opened in editor.`,
        });

        if (createdFile) {
          const createdNode: FileNode = {
            id: createdFile.id,
            name: createdFile.name,
            type: 'file',
            parentPath: createdFile.parent_folder || '',
            realFile: createdFile,
          };
          await openRealFileInEditor(createdNode);
        }
      }

      setCreateName('');
      setShowCreateDialog(false);
      await initializeProject();
    } catch (error: any) {
      console.error('Create item failed:', error);
      toast({
        title: 'Create failed',
        description: error.message || 'Unable to create item right now.',
        variant: 'destructive',
      });
    }
  }, [
    user,
    createName,
    createType,
    selectedPath,
    folderId,
    activeWorkspaceId,
    toast,
  ]);

  const handleEditorChange = (value: string) => {
    if (!activeTab) return;
    
    setTabs(prev => prev.map(tab => 
      tab.id === activeTab 
        ? { ...tab, content: value, isDirty: true }
        : tab
    ));
  };

  const runJavaScriptInWorker = (source: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const workerSource = `
        self.onmessage = async (event) => {
          const code = event.data?.code || '';
          const logs = [];
          const safeConsole = {
            log: (...args) => logs.push(args.map((arg) => String(arg)).join(' '))
          };

          try {
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            const runner = new AsyncFunction('console', '"use strict";\\n' + code);
            await runner(safeConsole);
            self.postMessage({ type: 'result', logs });
          } catch (error) {
            self.postMessage({ type: 'error', error: error?.message || String(error), logs });
          }
        };
      `;

      const blob = new Blob([workerSource], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      const cleanup = () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Execution timed out'));
      }, 5000);

      worker.onmessage = (event) => {
        clearTimeout(timeout);
        const payload = event.data || {};
        cleanup();

        if (payload.type === 'error') {
          const output = Array.isArray(payload.logs) ? payload.logs : [];
          output.push(`Error: ${payload.error || 'Execution failed'}`);
          resolve(output);
          return;
        }

        resolve(Array.isArray(payload.logs) ? payload.logs : []);
      };

      worker.onerror = (event) => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(event.message || 'Execution failed'));
      };

      worker.postMessage({ code: source });
    });
  };

  const runCode = async () => {
    const currentTab = tabs.find(tab => tab.id === activeTab);
    if (!currentTab) return;

    if (currentTab.isDirty && idePreferences?.formatOnSave) {
      await saveFile(currentTab.id, 'run');
    }

    setConsoleOutput(prev => [...prev, `> Running ${currentTab.name}...`]);
    setShowTerminal(true);

    try {
      if (currentTab.language === 'javascript') {
        const logs = await runJavaScriptInWorker(currentTab.content);
        
        if (logs.length > 0) {
          setConsoleOutput(prev => [...prev, ...logs]);
        } else {
          setConsoleOutput(prev => [...prev, 'Code executed successfully (no output)']);
        }
      } else {
        setConsoleOutput(prev => [...prev, `Execution not supported for ${currentTab.language} files`]);
      }
    } catch (error: any) {
      setConsoleOutput(prev => [...prev, `Error: ${error.message}`]);
    }
  };

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();

      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          void saveAllFiles();
          return;
        }
        if (activeTab) {
          void saveFile(activeTab, 'manual');
        }
      }

      if (key === 'p') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (key === 'n') {
        event.preventDefault();
        setCreateType(event.shiftKey ? 'folder' : 'file');
        setCreateName('');
        setShowCreateDialog(true);
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [activeTab, saveAllFiles, saveFile]);

  useEffect(() => {
    if (!user?.id || !activeWorkspaceId || !sessionHydrated) return;

    const sessionState: CbCodeSessionState = {
      ...DEFAULT_CBCODE_SESSION_STATE,
      activeFileId: activeTab || null,
      openTabs: tabs.map(tab => ({
        id: tab.id,
        name: tab.name,
        language: tab.language,
        fileId: tab.fileId,
      })),
      showTerminal,
      searchQuery,
      layout: {
        sidebarWidth: 300,
        terminalHeight: showTerminal ? 220 : 0,
      },
    };

    const timer = window.setTimeout(() => {
      void saveCbCodeSessionState(user.id, activeWorkspaceId, sessionState);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    user?.id,
    activeWorkspaceId,
    sessionHydrated,
    activeTab,
    tabs,
    showTerminal,
    searchQuery,
  ]);

  useEffect(() => {
    if (!idePreferences?.autosaveEnabled) return;

    const interval = window.setInterval(() => {
      const dirtyActiveTab = tabs.find(tab => tab.id === activeTab && tab.isDirty);
      const fallbackDirtyTab = tabs.find(tab => tab.isDirty);
      const tabToSave = dirtyActiveTab || fallbackDirtyTab;

      if (tabToSave) {
        void saveFile(tabToSave.id, 'autosave');
      }
    }, Math.max(5000, idePreferences.autosaveIntervalMs || 30000));

    return () => window.clearInterval(interval);
  }, [
    tabs,
    activeTab,
    idePreferences?.autosaveEnabled,
    idePreferences?.autosaveIntervalMs,
    saveFile,
  ]);

  const getFileIcon = (filename: string, isFolder: boolean, expanded?: boolean) => {
    if (isFolder) {
      return expanded ? 
        <ChevronDown className="w-4 h-4 text-primary/80" /> : 
        <ChevronRight className="w-4 h-4 text-primary/80" />;
    }
    
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return <FileCode className="w-4 h-4 text-amber-500" />;
      case 'ts':
      case 'tsx':
        return <FileCode className="w-4 h-4 text-sky-500" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-emerald-500" />;
      case 'md':
        return <FileText className="w-4 h-4 text-muted-foreground" />;
      case 'html':
        return <FileCode className="w-4 h-4 text-orange-500" />;
      case 'css':
      case 'scss':
        return <FileCode className="w-4 h-4 text-violet-500" />;
      case 'py':
        return <FileCode className="w-4 h-4 text-lime-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes
      .filter(node => 
        searchQuery === '' || 
        node.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map(node => (
        <div key={node.id}>
          <div
            className={`flex items-center gap-2 p-2 text-sm rounded-lg cursor-pointer group transition-colors ${
              activeTab === node.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <div 
              className="flex items-center gap-2 flex-1"
              onClick={() => {
                if (node.type === 'folder') {
                  sessionStorage.setItem('cbcode_last_folder', node.id);
                  navigate(`/cbcode/${node.id}`);
                } else {
                  openRealFileInEditor(node);
                }
              }}
            >
              {node.type === 'folder' && (
                <Folder className="w-4 h-4 text-primary/80" />
              )}
              {getFileIcon(node.name, node.type === 'folder', node.expanded)}
              <span className="truncate flex-1">{node.name}</span>
            </div>
          </div>
        </div>
      ));
  };

  const currentTab = tabs.find(tab => tab.id === activeTab);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Code className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading cbCode IDE...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background p-4 lg:p-6">
      <div className="mx-auto grid h-full w-full max-w-[1800px] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-border/50 bg-card/70 shadow-sm backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between border-b border-border/50 px-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">cbCode IDE</p>
              <p className="truncate text-xs text-muted-foreground">{currentProject || 'Workspace Root'}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="h-8 w-8 p-0"
              title="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="border-b border-border/50 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search files in workspace"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 rounded-xl border-border/60 pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg"
              onClick={() => {
                setCreateType('file');
                setCreateName('');
                setShowCreateDialog(true);
              }}
            >
              <FilePlus className="mr-1.5 h-3.5 w-3.5" />
              File
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg"
              onClick={() => {
                setCreateType('folder');
                setCreateName('');
                setShowCreateDialog(true);
              }}
            >
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
              Folder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8 w-8 p-0"
              onClick={initializeProject}
              title="Refresh explorer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-2">
            {fileTree.length > 0 ? (
              renderFileTree(fileTree)
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                No files yet. Create a file or folder to start coding.
              </div>
            )}
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-border/50 bg-card/60 shadow-sm backdrop-blur-xl">
          <div className="flex h-12 items-center justify-between border-b border-border/50 px-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                {currentProject || 'Workspace Root'}
              </Badge>
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                Autosave {idePreferences?.autosaveEnabled ? 'On' : 'Off'}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => setShowTerminal(prev => !prev)}
              >
                {showTerminal ? 'Hide Console' : 'Console'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={runCode}
                title="Run current file"
              >
                <Play className="h-4 w-4" />
              </Button>
              {tabs.some(tab => tab.isDirty) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={() => void saveAllFiles()}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Save all
                </Button>
              )}
              {currentTab && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={() => void saveFile(currentTab.id, 'manual')}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Save
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={toggleTheme}
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {tabs.length > 0 && (
            <div className="flex h-10 items-center overflow-x-auto border-b border-border/50 bg-muted/20 px-2">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  role="button"
                  tabIndex={0}
                  className={`group mr-1 inline-flex h-8 min-w-0 items-center gap-2 rounded-lg px-2.5 text-xs transition-colors ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveTab(tab.id);
                    }
                  }}
                >
                  {getFileIcon(tab.name, false)}
                  <span className="max-w-[170px] truncate">{tab.name}</span>
                  {tab.isDirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                  <button
                    type="button"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                    aria-label={`Close ${tab.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative flex-1 min-h-0">
            {currentTab ? (
              <MonacoEditor
                value={currentTab.content}
                language={currentTab.language}
                theme={theme}
                onChange={handleEditorChange}
                options={monacoOptions}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted/20">
                <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center">
                  <Code className="mx-auto mb-4 h-12 w-12 text-primary/70" />
                  <h3 className="text-lg font-semibold">cbCode IDE</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open a file to start editing with autosave, snapshots, and session restore.
                  </p>
                </div>
              </div>
            )}
          </div>

          {showTerminal && (
            <div className="h-56 border-t border-border/60 bg-background/70">
              <div className="flex h-8 items-center justify-between border-b border-border/50 px-3">
                <p className="text-xs font-medium text-muted-foreground">Console</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded-md px-2 text-xs"
                    onClick={() => setConsoleOutput([])}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowTerminal(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="h-[calc(100%-2rem)] overflow-auto p-3 font-mono text-xs text-muted-foreground">
                {consoleOutput.length === 0 ? (
                  <p>Console output will appear here...</p>
                ) : (
                  consoleOutput.map((line, index) => (
                    <div key={index} className="mb-1">
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex h-7 items-center justify-between border-t border-border/50 px-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>cbCode Ready</span>
              {currentTab && (
                <>
                  <span>•</span>
                  <span>{currentTab.language}</span>
                  {currentTab.isDirty && (
                    <>
                      <span>•</span>
                      <span className="text-orange-500">Unsaved</span>
                    </>
                  )}
                </>
              )}
            </div>
            <span>SquidCloud cbCode v6.2.0</span>
          </div>
        </section>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md border border-border/60 bg-card/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              {createType === 'file' ? <FilePlus className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
              {createType === 'file' ? 'Create New File' : 'Create New Folder'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input
                autoFocus
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleCreateItem();
                  }
                }}
                className="mt-1.5 border-border/60"
                placeholder={createType === 'file' ? 'example.ts' : 'new-folder'}
              />
            </div>

            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Location: {selectedPath || 'Workspace root'}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleCreateItem()}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CbCode;
