import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Save, 
  Download, 
  Share2, 
  Search, 
  RotateCcw, 
  RotateCw, 
  Type,
  Eye,
  Edit3,
  Loader2,
  Bold,
  Italic,
  Underline,
  Code,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Settings,
  FileText,
  Palette,
  Monitor,
  MoreHorizontal,
  History,
  CheckCircle,
  Table,
  ListOrdered,
  Quote,
  Link,
  Image,
  Columns
} from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import EnhancedMarkdownPreview from './EnhancedMarkdownPreview';

// Editor Theme Types
export type EditorTheme = 'default' | 'vim' | 'vscode' | 'monokai' | 'github';
export type EditorMode = 'normal' | 'vim' | 'emacs';
export type EncodingType = 'utf-8' | 'utf-16' | 'ascii' | 'iso-8859-1' | 'windows-1252';

interface EditorSettings {
  theme: EditorTheme;
  mode: EditorMode;
  encoding: EncodingType;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // seconds
}

interface AdvancedTextEditorProps {
  file: any;
  content: string;
  onSave?: (content: string, overwrite?: boolean) => Promise<void>;
  onDownload?: () => void;
  onShare?: () => void;
  onVersionHistory?: () => void;
  readonly?: boolean;
  initialSettings?: Partial<EditorSettings>;
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

const DEFAULT_SETTINGS: EditorSettings = {
  theme: 'default',
  mode: 'normal',
  encoding: 'utf-8',
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  minimap: false,
  autoSave: true,
  autoSaveInterval: 30
};

const THEME_STYLES = {
  default: {
    background: 'bg-background',
    text: 'text-foreground',
    accent: 'text-blue-600',
    border: 'border-border'
  },
  vim: {
    background: 'bg-gray-900',
    text: 'text-green-400',
    accent: 'text-yellow-400',
    border: 'border-green-600'
  },
  vscode: {
    background: 'bg-[#1e1e1e]',
    text: 'text-[#d4d4d4]',
    accent: 'text-[#4fc3f7]',
    border: 'border-[#3e3e3e]'
  },
  monokai: {
    background: 'bg-[#272822]',
    text: 'text-[#f8f8f2]',
    accent: 'text-[#a6e22e]',
    border: 'border-[#49483e]'
  },
  github: {
    background: 'bg-white',
    text: 'text-gray-900',
    accent: 'text-blue-600',
    border: 'border-gray-300'
  }
};

const AdvancedTextEditor: React.FC<AdvancedTextEditorProps> = ({
  file,
  content: initialContent,
  onSave,
  onDownload,
  onShare,
  onVersionHistory,
  readonly = false,
  initialSettings = {},
  fullscreen = false,
  onFullscreenChange
}) => {
  const [content, setContent] = useState(initialContent);
  const [originalContent, setOriginalContent] = useState(initialContent);
  const [settings, setSettings] = useState<EditorSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [autoSaveCountdown, setAutoSaveCountdown] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout>();
  const autoSaveCountdownTimer = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  // Initialize content
  useEffect(() => {
    setContent(initialContent);
    setOriginalContent(initialContent);
  }, [initialContent]);

  // Track changes
  useEffect(() => {
    const hasContentChanged = content !== originalContent;
    setHasChanges(hasContentChanged);
    
    // Auto-save timer
    if (hasContentChanged && settings.autoSave && !readonly) {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      
      // Start countdown
      setAutoSaveCountdown(settings.autoSaveInterval);
      if (autoSaveCountdownTimer.current) {
        clearInterval(autoSaveCountdownTimer.current);
      }
      
      autoSaveCountdownTimer.current = setInterval(() => {
        setAutoSaveCountdown(prev => {
          if (prev <= 1) {
            handleAutoSave();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      autoSaveTimer.current = setTimeout(() => {
        handleAutoSave();
      }, settings.autoSaveInterval * 1000);
    }
    
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (autoSaveCountdownTimer.current) clearInterval(autoSaveCountdownTimer.current);
    };
  }, [content, originalContent, settings.autoSave, settings.autoSaveInterval]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'f':
            e.preventDefault();
            setShowFind(true);
            break;
          case '=':
          case '+':
            e.preventDefault();
            handleZoomIn();
            break;
          case '-':
            e.preventDefault();
            handleZoomOut();
            break;
          case 'z':
            if (e.shiftKey) {
              e.preventDefault();
              handleRedo();
            } else {
              e.preventDefault();
              handleUndo();
            }
            break;
          case 'b':
            if (!readonly) {
              e.preventDefault();
              handleBold();
            }
            break;
          case 'i':
            if (!readonly) {
              e.preventDefault();
              handleItalic();
            }
            break;
          case 'u':
            if (!readonly) {
              e.preventDefault();
              handleUnderline();
            }
            break;
        }
      }
      
      if (e.key === 'Escape') {
        setShowFind(false);
        setShowSettings(false);
      }
      
      if (e.key === 'F11') {
        e.preventDefault();
        onFullscreenChange?.(!fullscreen);
      }
    };

    // Mouse wheel zoom
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [readonly, fullscreen, onFullscreenChange]);

  // Update cursor position
  const updateCursorPosition = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const textBeforeCursor = content.substring(0, start);
      const lines = textBeforeCursor.split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      
      setCursorPosition({ line, column });
      
      // Update selected text
      const selectedText = content.substring(textarea.selectionStart, textarea.selectionEnd);
      setSelectedText(selectedText);
    }
  }, [content]);

  // Get file language for syntax highlighting
  const getFileLanguage = useCallback(() => {
    const ext = file.name?.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python', 'html': 'html', 'css': 'css', 'scss': 'scss', 'sass': 'scss',
      'json': 'json', 'md': 'markdown', 'xml': 'xml', 'sql': 'sql',
      'yaml': 'yaml', 'yml': 'yaml', 'toml': 'toml', 'ini': 'ini',
      'sh': 'bash', 'bash': 'bash', 'zsh': 'bash', 'fish': 'bash',
      'php': 'php', 'rb': 'ruby', 'go': 'go', 'rs': 'rust',
      'c': 'c', 'cpp': 'cpp', 'h': 'c', 'hpp': 'cpp',
      'java': 'java', 'kt': 'kotlin', 'swift': 'swift',
      'vue': 'vue', 'svelte': 'svelte', 'astro': 'astro'
    };
    
    return languageMap[ext || ''] || 'text';
  }, [file.name]);

  // Auto-save handler
  const handleAutoSave = async () => {
    if (hasChanges && onSave && !saving) {
      try {
        setSaving(true);
        await onSave(content, true); // overwrite = true for auto-save
        setOriginalContent(content);
        setHasChanges(false);
        setAutoSaveCountdown(0);
        
        toast({
          title: "Auto-saved",
          description: "Changes saved automatically",
          duration: 2000,
        });
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setSaving(false);
      }
    }
  };

  // Manual save handler
  const handleSave = async (overwrite = false) => {
    if (!onSave || saving || !hasChanges) return;

    setSaving(true);
    try {
      await onSave(content, overwrite);
      setOriginalContent(content);
      setHasChanges(false);
      setAutoSaveCountdown(0);
      
      toast({
        title: "File Saved Successfully ✅",
        description: `${file.name} has been saved.`,
      });
    } catch (error: any) {
      console.error('Save failed:', error);
      toast({
        title: "Save Failed ❌",
        description: error.message || "Failed to save file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Text formatting functions
  const insertAtCursor = (before: string, after: string = '') => {
    if (!textareaRef.current || readonly) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    
    const newText = before + selectedText + after;
    const newContent = content.substring(0, start) + newText + content.substring(end);
    
    setContent(newContent);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const handleBold = () => insertAtCursor('**', '**');
  const handleItalic = () => insertAtCursor('*', '*');
  const handleUnderline = () => insertAtCursor('<u>', '</u>');
  const handleCode = () => insertAtCursor('`', '`');

  // Editor actions
  const handleUndo = () => {
    if (textareaRef.current) {
      document.execCommand('undo');
    }
  };

  const handleRedo = () => {
    if (textareaRef.current) {
      document.execCommand('redo');
    }
  };

  const handleZoomIn = () => {
    setSettings(prev => ({
      ...prev,
      fontSize: Math.min(prev.fontSize + 1, 24)
    }));
  };

  const handleZoomOut = () => {
    setSettings(prev => ({
      ...prev,
      fontSize: Math.max(prev.fontSize - 1, 8)
    }));
  };

  // Download handler
  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Encode content based on selected encoding
      let blob: Blob;
      switch (settings.encoding) {
        case 'utf-16':
          blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-16' });
          break;
        case 'ascii':
          blob = new Blob([content], { type: 'text/plain;charset=us-ascii' });
          break;
        case 'iso-8859-1':
          blob = new Blob([content], { type: 'text/plain;charset=iso-8859-1' });
          break;
        case 'windows-1252':
          blob = new Blob([content], { type: 'text/plain;charset=windows-1252' });
          break;
        default: // utf-8
          blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Find and replace
  const handleFind = () => {
    setShowFind(!showFind);
    if (!showFind) {
      setTimeout(() => findInputRef.current?.focus(), 100);
    }
  };

  const handleReplace = () => {
    if (!findTerm || readonly) return;
    
    const newContent = content.replace(new RegExp(findTerm, 'g'), replaceTerm);
    setContent(newContent);
  };

  const handleReplaceAll = () => {
    if (!findTerm || readonly) return;
    
    const regex = new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newContent = content.replace(regex, replaceTerm);
    setContent(newContent);
  };

  // Generate line numbers
  const generateLineNumbers = () => {
    const lines = content.split('\n');
    return lines.map((_, index) => (
      <div 
        key={index} 
        className={cn(
          "text-right pr-2 select-none leading-relaxed",
          THEME_STYLES[settings.theme].text,
          "opacity-60"
        )}
        style={{ fontSize: settings.fontSize - 2 }}
      >
        {index + 1}
      </div>
    ));
  };

  const themeStyles = THEME_STYLES[settings.theme];

  return (
    <div className={cn(
      "flex flex-col h-full",
      themeStyles.background,
      themeStyles.text,
      fullscreen && "fixed inset-0 z-50"
    )}>
      {/* Main Toolbar */}
      <div className={cn(
        "flex items-center justify-between p-3 border-b",
        themeStyles.border,
        "bg-opacity-80 backdrop-blur-sm"
      )}>
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Mode Toggle */}
          <div className="flex items-center rounded-md border flex-shrink-0">
            <Button
              variant={!isPreviewMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsPreviewMode(false)}
              className="h-8 px-3 rounded-r-none"
            >
              <Edit3 className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <Button
              variant={isPreviewMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsPreviewMode(true)}
              className="h-8 px-3 rounded-l-none border-l"
            >
              <Eye className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
          </div>

          {/* Formatting Tools */}
          {!readonly && !isPreviewMode && (
            <>
              <div className="w-px h-6 bg-border flex-shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBold}
                className="h-8 px-2 flex-shrink-0"
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleItalic}
                className="h-8 px-2 flex-shrink-0"
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnderline}
                className="h-8 px-2 flex-shrink-0"
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCode}
                className="h-8 px-2 flex-shrink-0"
                title="Code"
              >
                <Code className="w-4 h-4" />
              </Button>
            </>
          )}

          {/* Editor Controls */}
          {!readonly && !isPreviewMode && (
            <>
              <div className="w-px h-6 bg-border flex-shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                className="h-8 px-2 flex-shrink-0"
                title="Undo (Ctrl+Z)"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                className="h-8 px-2 flex-shrink-0"
                title="Redo (Ctrl+Shift+Z)"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFind}
                className="h-8 px-2 flex-shrink-0"
                title="Find (Ctrl+F)"
              >
                <Search className="w-4 h-4" />
              </Button>
            </>
          )}

          {/* View Controls */}
          <div className="w-px h-6 bg-border flex-shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-8 px-2 flex-shrink-0"
            title="Zoom Out (Ctrl+-)"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs px-2">{settings.fontSize}px</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-8 px-2 flex-shrink-0"
            title="Zoom In (Ctrl++)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Auto-save countdown */}
          {settings.autoSave && autoSaveCountdown > 0 && hasChanges && (
            <Badge variant="secondary" className="text-xs">
              Auto-save in {autoSaveCountdown}s
            </Badge>
          )}
          
          {hasChanges && !settings.autoSave && (
            <span className="text-xs text-muted-foreground mr-2 hidden sm:inline">
              Unsaved changes
            </span>
          )}
          
          {/* Settings */}
          <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Settings className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-xs font-medium">Theme</label>
                  <Select
                    value={settings.theme}
                    onValueChange={(theme: EditorTheme) => 
                      setSettings(prev => ({ ...prev, theme }))
                    }
                  >
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="vim">Vim</SelectItem>
                      <SelectItem value="vscode">VS Code</SelectItem>
                      <SelectItem value="monokai">Monokai</SelectItem>
                      <SelectItem value="github">GitHub</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-xs font-medium">Encoding</label>
                  <Select
                    value={settings.encoding}
                    onValueChange={(encoding: EncodingType) => 
                      setSettings(prev => ({ ...prev, encoding }))
                    }
                  >
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utf-8">UTF-8</SelectItem>
                      <SelectItem value="utf-16">UTF-16</SelectItem>
                      <SelectItem value="ascii">ASCII</SelectItem>
                      <SelectItem value="iso-8859-1">ISO-8859-1</SelectItem>
                      <SelectItem value="windows-1252">Windows-1252</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <DropdownMenuSeparator />
                
                <div className="flex items-center justify-between">
                  <span className="text-xs">Auto-save</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSettings(prev => ({ ...prev, autoSave: !prev.autoSave }))}
                    className="h-6 px-2"
                  >
                    {settings.autoSave ? <CheckCircle className="w-3 h-3 text-green-500" /> : <div className="w-3 h-3 border rounded-sm" />}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs">Line numbers</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSettings(prev => ({ ...prev, lineNumbers: !prev.lineNumbers }))}
                    className="h-6 px-2"
                  >
                    {settings.lineNumbers ? <CheckCircle className="w-3 h-3 text-green-500" /> : <div className="w-3 h-3 border rounded-sm" />}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs">Word wrap</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSettings(prev => ({ ...prev, wordWrap: !prev.wordWrap }))}
                    className="h-6 px-2"
                  >
                    {settings.wordWrap ? <CheckCircle className="w-3 h-3 text-green-500" /> : <div className="w-3 h-3 border rounded-sm" />}
                  </Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Main Actions */}
          <div className="w-px h-6 bg-border" />
          
          {onFullscreenChange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFullscreenChange(!fullscreen)}
              className="h-8 px-2"
              title="Toggle Fullscreen (F11)"
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          )}
          
          {onVersionHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onVersionHistory}
              className="h-8 px-2"
              title="Version History"
            >
              <History className="w-4 h-4" />
            </Button>
          )}
          
          {!readonly && (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={saving || !hasChanges}
              className="h-8 px-3"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              <span className="hidden sm:inline">Save</span>
            </Button>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </DropdownMenuItem>
              {onShare && (
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </DropdownMenuItem>
              )}
              {!readonly && hasChanges && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleSave(true)}>
                    <Save className="w-4 h-4 mr-2" />
                    Save & Overwrite
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Find/Replace Bar */}
      {showFind && !isPreviewMode && (
        <div className={cn(
          "flex items-center gap-2 p-2 border-b",
          themeStyles.border,
          "bg-opacity-50"
        )}>
          <input
            ref={findInputRef}
            type="text"
            placeholder="Find..."
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            className="flex-1 px-3 py-1 text-sm border rounded-md bg-background max-w-48"
          />
          <input
            type="text"
            placeholder="Replace..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="flex-1 px-3 py-1 text-sm border rounded-md bg-background max-w-48"
          />
          <Button variant="ghost" size="sm" onClick={handleReplace} className="h-7 px-2">
            Replace
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReplaceAll} className="h-7 px-2">
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFind(false)}
            className="h-7 px-2"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        {settings.lineNumbers && !isPreviewMode && (
          <div className={cn(
            "flex flex-col border-r text-xs font-mono py-3 min-w-[3rem] overflow-hidden",
            themeStyles.border,
            "bg-opacity-30"
          )}>
            <div className="overflow-y-auto">
              {generateLineNumbers()}
            </div>
          </div>
        )}

        {/* Editor or Preview */}
        <div className="flex-1 relative overflow-auto">
          {isPreviewMode ? (
            // Enhanced Preview Mode with LaTeX, code blocks, tables support
            <div className="p-6 overflow-auto h-full liquid-glass-surface m-2 rounded-xl">
              {getFileLanguage() === 'markdown' || getFileLanguage() === 'text' ? (
                <EnhancedMarkdownPreview 
                  content={content} 
                  className="animate-fade-in"
                />
              ) : (
                <div className="liquid-glass-code rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/50">
                    <span className="text-xs font-medium text-muted-foreground">{getFileLanguage()}</span>
                  </div>
                  <pre className={cn(
                    "p-4 font-mono text-sm overflow-auto",
                    settings.wordWrap ? "whitespace-pre-wrap" : "whitespace-pre"
                  )}>
                    <code>{content}</code>
                  </pre>
                </div>
              )}
            </div>
          ) : (
            // Edit Mode
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onSelect={updateCursorPosition}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              className={cn(
                "w-full h-full p-4 font-mono bg-transparent border-none outline-none resize-none",
                "placeholder:text-muted-foreground",
                settings.wordWrap ? "whitespace-pre-wrap" : "whitespace-pre",
                "leading-relaxed",
                themeStyles.background,
                themeStyles.text,
                "selection:bg-blue-200 dark:selection:bg-blue-800",
                "touch-none overscroll-behavior-none"
              )}
              placeholder={readonly ? "File content will appear here..." : "Start typing..."}
              readOnly={readonly}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-gramm="false"
              inputMode="text"
              enterKeyHint="enter"
              style={{
                fontSize: `${settings.fontSize}px`,
                tabSize: settings.tabSize,
                fontFamily: 'JetBrains Mono, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2 border-t text-xs",
        themeStyles.border,
        "bg-opacity-80 backdrop-blur-sm"
      )}>
        <div className="flex items-center gap-4">
          <span>Language: {getFileLanguage()}</span>
          <span>Line {cursorPosition.line}, Column {cursorPosition.column}</span>
          <span>Lines: {content.split('\n').length}</span>
          <span>Characters: {content.length}</span>
          {selectedText && <span>Selected: {selectedText.length}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span>Theme: {settings.theme}</span>
          <span>Encoding: {settings.encoding.toUpperCase()}</span>
          {hasChanges && (
            <Badge variant="secondary" className="text-xs">
              {settings.autoSave ? 'Auto-save enabled' : 'Modified'}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedTextEditor;