import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
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
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Settings,
  FileText,
  Code,
  GitBranch,
  Clock,
  Keyboard
} from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { downloadFileWithRes54 } from '@/lib/res54';
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
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// Editor theme types
type EditorTheme = 'default' | 'vim' | 'vscode' | 'dark' | 'light';
type EditorMode = 'normal' | 'vim';
type EncodingType = 'utf-8' | 'utf-16' | 'ascii' | 'iso-8859-1' | 'windows-1252';

interface EnhancedTextEditorProps {
  file: any;
  decodedBlob: Blob | null;
  onSave?: (newContent: string) => Promise<void>;
  onDownload?: () => void;
  onShare?: () => void;
  onVersionCreate?: (content: string) => Promise<void>;
  readonly?: boolean;
  onToggleFullscreen?: () => void;
  initialTheme?: EditorTheme;
  onThemeChange?: (theme: EditorTheme) => void;
  className?: string;
}

const EnhancedTextEditor: React.FC<EnhancedTextEditorProps> = ({
  file,
  decodedBlob,
  onSave,
  onDownload,
  onShare,
  onVersionCreate,
  readonly = false,
  onToggleFullscreen,
  initialTheme = 'default',
  onThemeChange,
  className
}) => {
  const isMobile = useIsMobile();
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [showFind, setShowFind] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [lineNumbers, setLineNumbers] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // New enhanced features
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(initialTheme);
  const [editorMode, setEditorMode] = useState<EditorMode>('normal');
  const [encoding, setEncoding] = useState<EncodingType>('utf-8');
  const [fontSize, setFontSize] = useState(isMobile ? 16 : 15);
  const [fontFamily, setFontFamily] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveDelay, setAutoSaveDelay] = useState(2000); // 2 seconds
  const [showSettings, setShowSettings] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [selectedText, setSelectedText] = useState('');
  const [isVimMode, setIsVimMode] = useState(false);
  const [vimCommand, setVimCommand] = useState('');
  const [showVimCommand, setShowVimCommand] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const isLargeDocument = content.length > 180000;
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Load initial content
  useEffect(() => {
    const loadTextContent = async () => {
      if (!decodedBlob) {
        setError('No decoded content available');
        setLoading(false);
        return;
      }

      try {
        const text = await decodedBlob.text();
        
        if (!text && text !== '') {
          setError('File appears to be empty or binary');
        } else {
          setContent(text);
          setOriginalContent(text);
        }
      } catch (error) {
        console.error('Failed to read text content:', error);
        setError('Failed to decode text content. The file may be corrupted.');
      } finally {
        setLoading(false);
      }
    };

    loadTextContent();
  }, [decodedBlob]);

  // Track changes and auto-save
  useEffect(() => {
    const hasChangedFromOriginal = content !== originalContent;
    setHasChanges(hasChangedFromOriginal);
    
    // Auto-save logic
    if (autoSave && hasChangedFromOriginal && !readonly) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleAutoSave();
      }, autoSaveDelay);
    }
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [content, originalContent, autoSave, autoSaveDelay, readonly]);

  // Auto-save function
  const handleAutoSave = async () => {
    if (!onSave || saving || !hasChanges || readonly) return;
    
    try {
      await onSave(content);
      setOriginalContent(content);
      setHasChanges(false);
      setLastSaved(new Date());
      
      toast({
        title: "Auto-saved ✅",
        description: "File automatically saved",
      });
    } catch (error: any) {
      console.error('Auto-save failed:', error);
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    setFontSize(prev => Math.min(prev + 2, 32));
  };

  const handleZoomOut = () => {
    setFontSize(prev => Math.max(prev - 2, 8));
  };

  const handleZoomReset = () => {
    setFontSize(14);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '=':
          case '+':
            e.preventDefault();
            handleZoomIn();
            break;
          case '-':
            e.preventDefault();
            handleZoomOut();
            break;
          case '0':
            e.preventDefault();
            handleZoomReset();
            break;
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'f':
            e.preventDefault();
            handleFind();
            break;
        }
      }
      
      // Vim mode shortcuts
      if (isVimMode && e.key === 'Escape') {
        setShowVimCommand(false);
        setVimCommand('');
      }
      if (isVimMode && e.key === ':' && !showVimCommand) {
        e.preventDefault();
        setShowVimCommand(true);
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [isVimMode, showVimCommand]);

  // Mouse wheel zoom
  useEffect(() => {
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

    const textArea = textareaRef.current;
    if (textArea) {
      textArea.addEventListener('wheel', handleWheel, { passive: false });
      return () => textArea.removeEventListener('wheel', handleWheel);
    }
  }, []);

  // Text formatting functions
  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    
    const newText = content.substring(0, start) + before + selectedText + after + content.substring(end);
    setContent(newText);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selectedText.length;
      textarea.focus();
    }, 0);
  };

  const formatBold = () => insertText('**', '**');
  const formatItalic = () => insertText('*', '*');
  const formatUnderline = () => insertText('<u>', '</u>');
  const formatCode = () => insertText('`', '`');
  const formatCodeBlock = () => insertText('```\n', '\n```');

  // Version control
  const handleCreateVersion = async () => {
    if (!onVersionCreate) return;
    
    try {
      await onVersionCreate(content);
      toast({
        title: "Version Created",
        description: "New version saved successfully",
      });
    } catch (error: any) {
      toast({
        title: "Version Creation Failed",
        description: error.message || "Failed to create version",
        variant: "destructive",
      });
    }
  };

  // Theme handling
  const handleThemeChange = (theme: EditorTheme) => {
    setEditorTheme(theme);
    if (onThemeChange) {
      onThemeChange(theme);
    }
    
    // Apply vim mode if selected
    if (theme === 'vim') {
      setIsVimMode(true);
      setEditorMode('vim');
    } else {
      setIsVimMode(false);
      setEditorMode('normal');
    }
  };

  // Get theme-specific classes
  const getThemeClasses = () => {
    switch (editorTheme) {
      case 'vim':
        return 'bg-black text-green-400 font-mono border-green-700 selection:bg-green-800';
      case 'vscode':
        return 'bg-[#1e1e1e] text-[#d4d4d4] border-[#3e3e42] selection:bg-[#264f78]';
      case 'dark':
        return 'bg-gray-900 text-gray-100 border-gray-700 selection:bg-blue-800';
      case 'light':
        return 'bg-white text-gray-900 border-gray-300 selection:bg-blue-200';
      default:
        return 'bg-background text-foreground border-border selection:bg-blue-200 dark:selection:bg-blue-800';
    }
  };

  // Get syntax highlighting for code
  const getSyntaxHighlightedContent = () => {
    const language = getFileLanguage();

    // Large files use lightweight mode for smooth typing and scrolling.
    if (isLargeDocument) {
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    
    // Don't highlight text or markdown files in edit mode
    if (language === 'text' || language === 'markdown') {
      return content;
    }

    // If no content, return empty string
    if (!content || content.trim() === '') {
      return '';
    }

    // Escape HTML entities first
    let highlightedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Get VS Code-like colors based on theme
    const getColors = () => {
      if (editorTheme === 'vscode' || editorTheme === 'dark') {
        return {
          keyword: '#569cd6',      // Blue
          string: '#ce9178',       // Orange
          comment: '#6a9955',      // Green
          number: '#b5cea8',       // Light green
          boolean: '#569cd6',      // Blue
          function: '#dcdcaa',     // Yellow
          operator: '#d4d4d4',     // White
          punctuation: '#cccccc',  // Light gray
        };
      } else if (editorTheme === 'light') {
        return {
          keyword: '#0000ff',      // Blue
          string: '#a31515',       // Red
          comment: '#008000',      // Green
          number: '#098658',       // Dark green
          boolean: '#0000ff',      // Blue
          function: '#795e26',     // Brown
          operator: '#000000',     // Black
          punctuation: '#000000',  // Black
        };
      } else {
        return {
          keyword: '#8b5cf6',      // Purple
          string: '#10b981',       // Green
          comment: '#6b7280',      // Gray
          number: '#f59e0b',       // Amber
          boolean: '#8b5cf6',      // Purple
          function: '#3b82f6',     // Blue
          operator: '#374151',     // Dark gray
          punctuation: '#4b5563',  // Gray
        };
      }
    };

    const colors = getColors();
    
    // JavaScript/TypeScript syntax highlighting
    if (language === 'javascript' || language === 'typescript') {
      // Comments first (to avoid highlighting keywords inside comments)
      highlightedContent = highlightedContent
        .replace(/\/\/.*$/gm, 
          `<span style="color: ${colors.comment}; font-style: italic;">$&</span>`)
        .replace(/\/\*[\s\S]*?\*\//g, 
          `<span style="color: ${colors.comment}; font-style: italic;">$&</span>`)
        // Strings (before keywords to avoid highlighting keywords in strings)
        .replace(/"([^"\\]|\\.)*"/g, 
          `<span style="color: ${colors.string};">"$1"</span>`)
        .replace(/'([^'\\]|\\.)*'/g, 
          `<span style="color: ${colors.string};">'$1'</span>`)
        .replace(/`([^`\\]|\\.)*`/g, 
          `<span style="color: ${colors.string};">\`$1\`</span>`)
        // Keywords
        .replace(/\b(const|let|var|function|return|if|else|for|while|class|interface|type|import|export|from|default|async|await|try|catch|finally|new|this|super|extends|implements|public|private|protected|static)\b/g, 
          `<span style="color: ${colors.keyword}; font-weight: 600;">$1</span>`)
        // Functions (word followed by opening parenthesis)
        .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, 
          `<span style="color: ${colors.function};">$1</span>`)
        // Boolean and null
        .replace(/\b(true|false|null|undefined)\b/g, 
          `<span style="color: ${colors.boolean};">$1</span>`)
        // Numbers
        .replace(/\b(\d+\.?\d*)\b/g, 
          `<span style="color: ${colors.number};">$1</span>`);
    }
    
    // Python syntax highlighting
    else if (language === 'python') {
      highlightedContent = highlightedContent
        // Comments first
        .replace(/#.*$/gm, 
          `<span style="color: ${colors.comment}; font-style: italic;">$&</span>`)
        // Strings
        .replace(/"([^"\\]|\\.)*"/g, 
          `<span style="color: ${colors.string};">"$1"</span>`)
        .replace(/'([^'\\]|\\.)*'/g, 
          `<span style="color: ${colors.string};">'$1'</span>`)
        // Keywords
        .replace(/\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|lambda|yield|global|nonlocal|and|or|not|in|is|pass|break|continue)\b/g, 
          `<span style="color: ${colors.keyword}; font-weight: 600;">$1</span>`)
        // Functions
        .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, 
          `<span style="color: ${colors.function};">$1</span>`)
        // Boolean and None
        .replace(/\b(True|False|None)\b/g, 
          `<span style="color: ${colors.boolean};">$1</span>`)
        // Numbers
        .replace(/\b(\d+\.?\d*)\b/g, 
          `<span style="color: ${colors.number};">$1</span>`);
    }

    // CSS syntax highlighting
    else if (language === 'css') {
      highlightedContent = highlightedContent
        // Comments first
        .replace(/\/\*[\s\S]*?\*\//g, 
          `<span style="color: ${colors.comment}; font-style: italic;">$&</span>`)
        // Properties
        .replace(/([a-zA-Z-]+)(?=\s*:)/g, 
          `<span style="color: ${colors.keyword};">$1</span>`)
        // Values
        .replace(/:([^;]+);/g, 
          `: <span style="color: ${colors.string};">$1</span>;`)
        // Colors
        .replace(/#[a-fA-F0-9]{3,6}/g, 
          `<span style="color: ${colors.number};">$&</span>`);
    }

    // JSON syntax highlighting
    else if (language === 'json') {
      highlightedContent = highlightedContent
        // Keys
        .replace(/"([^"]+)":/g, 
          `<span style="color: ${colors.keyword};">"$1"</span>:`)
        // String values
        .replace(/:\s*"([^"]*)"/g, 
          `: <span style="color: ${colors.string};">"$1"</span>`)
        // Boolean and null
        .replace(/:\s*(true|false|null)/g, 
          `: <span style="color: ${colors.boolean};">$1</span>`)
        // Numbers
        .replace(/:\s*(\d+\.?\d*)/g, 
          `: <span style="color: ${colors.number};">$1</span>`);
    }

    return highlightedContent;
  };

  // Cursor position tracking
  const updateCursorPosition = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const lines = content.substring(0, textarea.selectionStart).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    
    setCursorPosition({ line, column });
    
    // Update selected text
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      setSelectedText(content.substring(start, end));
    } else {
      setSelectedText('');
    }
  };

  // Get file language for syntax highlighting classes
  const getFileLanguage = useCallback(() => {
    const ext = file.name?.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': return 'javascript';
      case 'ts': case 'tsx': return 'typescript';
      case 'py': return 'python';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'scss': case 'sass': return 'scss';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'xml': return 'xml';
      case 'sql': return 'sql';
      case 'yaml': case 'yml': return 'yaml';
      default: return 'text';
    }
  }, [file.name]);

  // Get appropriate font family based on file type
  const getOptimalFontFamily = useCallback(() => {
    const lang = getFileLanguage();
    
    // Use Google Docs-like fonts for text and document files
    if (lang === 'text' || lang === 'markdown') {
      return '"Arial", "Helvetica Neue", Helvetica, sans-serif';
    }
    
    // Use JetBrains Mono for code files
    return '"JetBrains Mono", "SF Mono", Monaco, "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace';
  }, [getFileLanguage]);

  // Initialize font family based on file type
  useEffect(() => {
    if (!fontFamily) {
      setFontFamily(getOptimalFontFamily());
    }
  }, [fontFamily, getOptimalFontFamily]);

  // Save handler with file overwrite functionality
  const handleSave = async () => {
    if (!onSave || saving || !hasChanges) return;

    setSaving(true);
    try {
      await onSave(content);
      setOriginalContent(content);
      setHasChanges(false);
      setLastSaved(new Date());
      
      toast({
        title: "File Saved Successfully ✅",
        description: `${file.name} has been updated and saved.`,
      });
    } catch (error: any) {
      console.error('Save failed:', error);
      toast({
        title: "Save Failed ❌",
        description: error.message || "Failed to save file. Please try again.",
        variant: "destructive",
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSave}
            disabled={saving}
          >
            Retry
          </Button>
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  // Download handler
  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Download current content
      const blob = new Blob([content], { type: 'text/plain' });
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

  // Undo/Redo functionality
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

  // Find functionality
  const handleFind = () => {
    setShowFind(!showFind);
    if (!showFind) {
      setTimeout(() => findInputRef.current?.focus(), 100);
    }
  };

  // Content change handler with optimized performance
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setIsTyping(true);
    updateCursorPosition();
    
    // Clear previous typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new typing timeout - very short for instant feedback
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 300);
  };

  // Enhanced keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Handle keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          handleSave();
          break;
        case 'f':
          e.preventDefault();
          handleFind();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleZoomReset();
          break;
        case 'b':
          if (!readonly && (getFileLanguage() === 'markdown' || getFileLanguage() === 'text')) {
            e.preventDefault();
            formatBold();
          }
          break;
        case 'i':
          if (!readonly && (getFileLanguage() === 'markdown' || getFileLanguage() === 'text')) {
            e.preventDefault();
            formatItalic();
          }
          break;
      }
    }

    // Handle Tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = '  '; // 2 spaces
      const newContent = content.substring(0, start) + spaces + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
      }, 0);
    }

    // Handle Enter for auto-indentation
    if (e.key === 'Enter' && !readonly) {
      const lines = content.substring(0, start).split('\n');
      const currentLine = lines[lines.length - 1];
      const indent = currentLine.match(/^\s*/)?.[0] || '';
      
      // Add extra indent for code blocks
      const language = getFileLanguage();
      let extraIndent = '';
      
      if (language === 'javascript' || language === 'typescript' || language === 'css' || language === 'json') {
        if (currentLine.trim().endsWith('{') || currentLine.trim().endsWith('[')) {
          extraIndent = '  ';
        }
      }
      
      if (language === 'python') {
        if (currentLine.trim().endsWith(':')) {
          extraIndent = '    '; // 4 spaces for Python
        }
      }

      e.preventDefault();
      const newIndent = '\n' + indent + extraIndent;
      const newContent = content.substring(0, start) + newIndent + content.substring(end);
      setContent(newContent);
      
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + newIndent.length;
        updateCursorPosition();
      }, 0);
    }

    // Handle Backspace for smart unindent
    if (e.key === 'Backspace' && start === end && start > 0) {
      const beforeCursor = content.substring(0, start);
      const lines = beforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];
      
      // If we're at the beginning of whitespace, remove full indent
      if (currentLine.match(/^\s+$/) && currentLine.length >= 2) {
        e.preventDefault();
        const indentSize = currentLine.length % 2 === 0 ? 2 : 1;
        const newContent = content.substring(0, start - indentSize) + content.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start - indentSize;
          updateCursorPosition();
        }, 0);
      }
    }

    updateCursorPosition();
  };

  // Mouse wheel zoom handler
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };

  // Cursor position change handler
  const handleCursorPositionChange = () => {
    updateCursorPosition();
  };

  // Get preview content for markdown
  const getPreviewContent = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    if (getFileLanguage() === 'markdown') {
      // Escape first, then apply minimal markdown formatting.
      return escapeHtml(content)
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*([^*]+)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/gim, '<em>$1</em>')
        .replace(/`([^`]+)`/gim, '<code>$1</code>')
        .replace(/\n/gim, '<br>');
    }
    return escapeHtml(content);
  };

  // Fullscreen toggle handler
  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        const editorElement = document.querySelector('.enhanced-text-editor') as HTMLElement;
        if (editorElement && editorElement.requestFullscreen) {
          await editorElement.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      // Fallback to CSS fullscreen
      setIsFullscreen(!isFullscreen);
    }
    
    if (onToggleFullscreen) {
      onToggleFullscreen();
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Update syntax highlighting when content or theme changes
  useEffect(() => {
    // Skip updates while actively typing for better performance
    if (isTyping) return;

    const updateSyntaxHighlighting = () => {
      const syntaxLayer = document.querySelector('.syntax-highlighting-layer') as HTMLElement;
      if (syntaxLayer && textareaRef.current) {
        const highlighted = getSyntaxHighlightedContent();
        // Only update if content has actually changed to prevent interference
        if (syntaxLayer.innerHTML !== highlighted && highlighted) {
          syntaxLayer.innerHTML = highlighted;
          // Ensure scroll sync after update
          syntaxLayer.scrollTop = textareaRef.current.scrollTop;
          syntaxLayer.scrollLeft = textareaRef.current.scrollLeft;
        }
      }
    };

    // Immediate update for non-typing scenarios
    const timeoutId = setTimeout(updateSyntaxHighlighting, isLargeDocument ? 220 : 100);
    return () => clearTimeout(timeoutId);
  }, [content, editorTheme, fontSize, fontFamily, isTyping, isLargeDocument]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Find and highlight text
  const highlightMatches = (text: string, term: string) => {
    if (!term) return text;
    
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
  };

  // Generate line numbers
  const generateLineNumbers = () => {
    return Array.from({ length: lineCount }, (_, index) => (
      <div key={index} className="text-right pr-2 text-muted-foreground select-none">
        {index + 1}
      </div>
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading text content...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-destructive mb-2">{error}</p>
        <p className="text-sm text-muted-foreground">
          Try downloading the file to view it in an external application.
        </p>
      </div>
    );
  }

  // Mobile-specific UI
  if (isMobile) {
    return (
      <div 
        className={cn(
          "enhanced-text-editor flex flex-col bg-[#0a0a0f] overflow-hidden h-full",
          isFullscreen ? "fixed inset-0 z-[60]" : "",
          className
        )}
        data-file-type={getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? getFileLanguage() : 'code'}
        data-theme={editorTheme}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-[#0a0a0f]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              {getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? (
                <FileText className="w-4 h-4 text-blue-400" />
              ) : (
                <Code className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{file.name}</h2>
              <p className="text-xs text-gray-500">{getFileLanguage().toUpperCase()} • {lineCount} lines</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {hasChanges && !autoSave && (
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse mr-2" />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleFullscreen}
              className="h-9 w-9 p-0 text-gray-400 hover:text-white hover:bg-white/5"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Mode Toggle Pills */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <button
            onClick={() => setIsPreviewMode(false)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
              !isPreviewMode 
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                : "bg-white/5 text-gray-400 border border-transparent"
            )}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => setIsPreviewMode(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
              isPreviewMode 
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" 
                : "bg-white/5 text-gray-400 border border-transparent"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          
          <div className="flex-1" />
          
          {/* Theme Quick Toggle */}
          <button
            onClick={() => {
              const themes: EditorTheme[] = ['default', 'vscode', 'vim', 'dark', 'light'];
              const currentIndex = themes.indexOf(editorTheme);
              const nextIndex = (currentIndex + 1) % themes.length;
              handleThemeChange(themes[nextIndex]);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-gray-400 border border-transparent"
          >
            <Palette className="w-3.5 h-3.5" />
            {editorTheme}
          </button>
        </div>

        {/* Mobile Find Bar */}
        {showFind && !isPreviewMode && (
          <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-white/5">
            <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <input
              ref={findInputRef}
              type="text"
              placeholder="Find in file..."
              value={findTerm}
              onChange={(e) => setFindTerm(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-white/10 rounded-xl bg-black/30 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFind(false)}
              className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
            >
              ✕
            </Button>
          </div>
        )}

        {/* Editor Content - Mobile Optimized */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {isPreviewMode ? (
            // Preview Mode - Mobile
            <div 
              className={cn(
                "flex-1 p-4 overflow-auto",
                getFileLanguage() === 'text' || getFileLanguage() === 'markdown' 
                  ? "prose prose-sm prose-invert max-w-none" 
                  : "font-mono",
                getThemeClasses()
              )}
              style={{
                fontSize: '16px',
                fontFamily: getOptimalFontFamily(),
                lineHeight: 1.7,
              }}
            >
              {getFileLanguage() === 'markdown' ? (
                <div dangerouslySetInnerHTML={{ __html: getPreviewContent() }} />
              ) : (
                <pre className="whitespace-pre-wrap text-sm">
                  {findTerm ? (
                    <div dangerouslySetInnerHTML={{ 
                      __html: highlightMatches(getSyntaxHighlightedContent(), findTerm) 
                    }} />
                  ) : (
                    <div dangerouslySetInnerHTML={{ 
                      __html: getSyntaxHighlightedContent() 
                    }} />
                  )}
                </pre>
              )}
            </div>
          ) : (
            // Edit Mode - Mobile
            <div className="relative flex-1 overflow-hidden">
              {/* Line numbers */}
              {lineNumbers && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-10 bg-white/5 border-r border-white/5 overflow-hidden text-xs text-gray-600 py-3 text-right pr-2 select-none"
                  style={{
                    fontSize: '14px',
                    fontFamily: getOptimalFontFamily(),
                    lineHeight: 1.6,
                  }}
                >
                  {content.split('\n').map((_, index) => (
                    <div key={index}>{index + 1}</div>
                  ))}
                </div>
              )}
              
              {/* Syntax highlighting layer for code files */}
              {getFileLanguage() !== 'text' && getFileLanguage() !== 'markdown' && (
                <div 
                  className={cn(
                    "syntax-highlighting-layer absolute inset-0 pointer-events-none overflow-hidden",
                    wordWrap ? "whitespace-pre-wrap" : "whitespace-pre overflow-x-auto",
                    getThemeClasses()
                  )}
                  style={{
                    fontSize: '16px',
                    fontFamily: getOptimalFontFamily(),
                    lineHeight: 1.6,
                    padding: '12px',
                    paddingLeft: lineNumbers ? '52px' : '12px',
                    zIndex: 1,
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: getSyntaxHighlightedContent() || content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  }}
                />
              )}
              
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  if (target.value !== content) {
                    setContent(target.value);
                    setIsTyping(true);
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 300);
                  }
                }}
                onKeyDown={handleKeyDown}
                onSelect={handleCursorPositionChange}
                className={cn(
                  "w-full h-full resize-none border-0 bg-transparent focus:outline-none relative z-[2]",
                  getFileLanguage() === 'text' || getFileLanguage() === 'markdown' 
                    ? cn("caret-current selection:bg-blue-500/30", getThemeClasses())
                    : "text-transparent caret-white selection:bg-blue-500/30",
                  wordWrap ? "whitespace-pre-wrap" : "whitespace-pre overflow-x-auto",
                  readonly && "cursor-default",
                  "touch-manipulation"
                )}
                style={{
                  fontSize: '16px',
                  fontFamily: getOptimalFontFamily(),
                  lineHeight: 1.6,
                  padding: '12px',
                  paddingLeft: lineNumbers ? '52px' : '12px',
                }}
                placeholder={readonly ? "File content will appear here..." : "Start typing..."}
                readOnly={readonly}
                spellCheck={getFileLanguage() === 'text' || getFileLanguage() === 'markdown'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                inputMode="text"
                enterKeyHint="enter"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>

        {/* Mobile Bottom Toolbar */}
        <div className="border-t border-white/10 bg-[#0a0a0f] p-2 space-y-2">
          {/* Quick Actions Row */}
          {!readonly && !isPreviewMode && (
            <div className="flex items-center justify-around gap-1 py-1">
              {/* Formatting buttons for text/markdown */}
              {(getFileLanguage() === 'markdown' || getFileLanguage() === 'text') && (
                <>
                  <button
                    onClick={formatBold}
                    className="flex-1 h-10 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/10 text-gray-400 active:text-white transition-colors"
                  >
                    <Bold className="w-5 h-5" />
                  </button>
                  <button
                    onClick={formatItalic}
                    className="flex-1 h-10 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/10 text-gray-400 active:text-white transition-colors"
                  >
                    <Italic className="w-5 h-5" />
                  </button>
                  <button
                    onClick={formatCode}
                    className="flex-1 h-10 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/10 text-gray-400 active:text-white transition-colors"
                  >
                    <Code className="w-5 h-5" />
                  </button>
                </>
              )}
              
              <button
                onClick={handleUndo}
                className="flex-1 h-10 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/10 text-gray-400 active:text-white transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                onClick={handleRedo}
                className="flex-1 h-10 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/10 text-gray-400 active:text-white transition-colors"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                onClick={handleFind}
                className={cn(
                  "flex-1 h-10 flex items-center justify-center rounded-xl active:bg-white/10 transition-colors",
                  showFind ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-gray-400"
                )}
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          )}
          
          {/* View Controls Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWordWrap(!wordWrap)}
                className={cn(
                  "h-9 w-9 flex items-center justify-center rounded-lg transition-colors",
                  wordWrap ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-gray-500"
                )}
              >
                <Type className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLineNumbers(!lineNumbers)}
                className={cn(
                  "h-9 w-9 flex items-center justify-center rounded-lg text-xs font-mono transition-colors",
                  lineNumbers ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-gray-500"
                )}
              >
                #
              </button>
              
              {/* Zoom Controls */}
              <div className="flex items-center gap-0.5 ml-1 bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={handleZoomOut}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400 active:bg-white/10"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 min-w-[36px] text-center">{fontSize}px</span>
                <button
                  onClick={handleZoomIn}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400 active:bg-white/10"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="h-9 px-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
              >
                <Download className="w-4 h-4" />
              </Button>
              
              {!readonly && (
                <Button
                  onClick={handleSave}
                  disabled={saving || (!hasChanges && !autoSave)}
                  className={cn(
                    "h-9 px-4 rounded-lg font-medium text-sm transition-all",
                    hasChanges 
                      ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/20" 
                      : "bg-white/10 text-gray-400"
                  )}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1.5" />
                      Save
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Status Indicator */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5 bg-black/30 text-xs text-gray-500">
          <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          <div className="flex items-center gap-2">
            {autoSave && (
              <span className="flex items-center gap-1 text-green-500">
                <Clock className="w-3 h-3" />
                Auto
              </span>
            )}
            <span>{encoding.toUpperCase()}</span>
          </div>
        </div>
      </div>
    );
  }

  // Desktop UI (original with enhancements)
  return (
    <div 
      className={cn(
        "enhanced-text-editor flex flex-col bg-background border rounded-xl overflow-hidden shadow-lg",
        isFullscreen ? "fixed inset-0 z-[60] rounded-none border-0 h-screen" : "h-full",
        className
      )}
      data-file-type={
        getFileLanguage() === 'text' || getFileLanguage() === 'markdown' 
          ? getFileLanguage() 
          : 'code'
      }
      data-theme={editorTheme}
    >
      {/* Enhanced Desktop Toolbar */}
      <div className="flex items-center justify-between border-b bg-muted/20 backdrop-blur-sm p-2.5">
        <div className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1">
          {/* File Info */}
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/50 flex-shrink-0">
            {getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? (
              <FileText className="w-4 h-4 text-blue-500" />
            ) : (
              <Code className="w-4 h-4 text-purple-500" />
            )}
            <span className="text-sm font-medium text-foreground">{file.name}</span>
            <span className="text-xs text-muted-foreground">({getFileLanguage().toUpperCase()})</span>
          </div>

          <div className="w-px h-6 bg-border flex-shrink-0" />

          {/* Mode Toggle */}
          <div className="flex items-center rounded-lg border overflow-hidden flex-shrink-0">
            <Button
              variant={!isPreviewMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsPreviewMode(false)}
              className="rounded-none h-8 px-3"
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button
              variant={isPreviewMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsPreviewMode(true)}
              className="rounded-none h-8 px-3 border-l"
            >
              <Eye className="w-4 h-4 mr-1.5" />
              Preview
            </Button>
          </div>

          {/* Text Formatting - Only show in edit mode for supported file types */}
          {!readonly && !isPreviewMode && (getFileLanguage() === 'markdown' || getFileLanguage() === 'text') && (
            <>
              <div className="w-px h-6 bg-border flex-shrink-0" />
              <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={formatBold}
                  className="h-7 w-7 p-0 flex-shrink-0 rounded-md"
                  title="Bold (Ctrl+B)"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={formatItalic}
                  className="h-7 w-7 p-0 flex-shrink-0 rounded-md"
                  title="Italic (Ctrl+I)"
                >
                  <Italic className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={formatUnderline}
                  className="h-7 w-7 p-0 flex-shrink-0 rounded-md"
                  title="Underline"
                >
                  <Underline className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={formatCode}
                  className="h-7 w-7 p-0 flex-shrink-0 rounded-md"
                  title="Inline Code"
                >
                  <Code className="w-4 h-4" />
                </Button>
              </div>
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
                title="Redo (Ctrl+Y)"
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

          {/* Zoom Controls */}
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
          <span className="text-xs text-muted-foreground px-2 flex-shrink-0">
            {fontSize}px
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-8 px-2 flex-shrink-0"
            title="Zoom In (Ctrl++)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          {/* View Controls */}
          <div className="w-px h-6 bg-border flex-shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWordWrap(!wordWrap)}
            className="h-8 px-2 flex-shrink-0"
            title="Toggle Word Wrap"
          >
            <Type className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLineNumbers(!lineNumbers)}
            className="h-8 px-2 text-xs flex-shrink-0"
            title="Toggle Line Numbers"
          >
            #
          </Button>

          {/* Theme Selector */}
          <div className="w-px h-6 bg-border flex-shrink-0" />
          <Select value={editorTheme} onValueChange={handleThemeChange}>
            <SelectTrigger className="h-8 w-[110px] flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="vscode">VS Code</SelectItem>
              <SelectItem value="vim">Vim</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {/* Auto-save indicator */}
          {autoSave && lastSaved && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <Clock className="w-3 h-3" />
              <span className="hidden lg:inline">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            </div>
          )}
          
          {hasChanges && !autoSave && (
            <span className="text-xs text-muted-foreground mr-1 hidden lg:inline">Unsaved changes</span>
          )}

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleFullscreen}
            className="h-8 px-2"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>

          {/* Version Control */}
          {!readonly && onVersionCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateVersion}
              className="h-8 px-2"
              title="Create Version"
            >
              <GitBranch className="w-4 h-4" />
            </Button>
          )}

          {/* Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Editor Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <div className="p-2 space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-save" className="text-sm">Auto-save</Label>
                  <Switch
                    id="auto-save"
                    checked={autoSave}
                    onCheckedChange={setAutoSave}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Encoding</Label>
                  <Select value={encoding} onValueChange={(value: EncodingType) => setEncoding(value)}>
                    <SelectTrigger className="h-8">
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

                <div className="space-y-2">
                  <Label className="text-sm">Font Family</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='"Arial", "Helvetica Neue", Helvetica, sans-serif'>Arial (Google Docs)</SelectItem>
                      <SelectItem value='"JetBrains Mono", Monaco, Consolas, monospace'>JetBrains Mono</SelectItem>
                      <SelectItem value='"SF Mono", Monaco, monospace'>SF Mono</SelectItem>
                      <SelectItem value='Monaco, Consolas, monospace'>Monaco</SelectItem>
                      <SelectItem value='Consolas, monospace'>Consolas</SelectItem>
                      <SelectItem value='"Fira Code", monospace'>Fira Code</SelectItem>
                      <SelectItem value='"Source Code Pro", monospace'>Source Code Pro</SelectItem>
                      <SelectItem value='"Cascadia Code", monospace'>Cascadia Code</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {!readonly && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving || (!hasChanges && !autoSave)}
              className="h-8 px-2 ml-1"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden lg:inline ml-1">Save</span>
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8 px-2"
          >
            <Download className="w-4 h-4" />
            <span className="hidden lg:inline ml-1">Download</span>
          </Button>
          
          {onShare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              className="h-8 px-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden lg:inline ml-1">Share</span>
            </Button>
          )}
        </div>
      </div>

      {/* Find Bar */}
      {showFind && !isPreviewMode && (
        <div className="flex items-center gap-2 p-2 border-b bg-muted/20">
          <input
            ref={findInputRef}
            type="text"
            placeholder="Find in file..."
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            className="flex-1 px-3 py-1 text-sm border rounded-md bg-background"
          />
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
      <div className="flex-1 flex overflow-hidden bg-background">
        {/* Line Numbers */}
        {lineNumbers && !isPreviewMode && (
          <div 
            className={cn(
              "line-numbers flex flex-col bg-muted/10 border-r text-xs min-w-[3rem] py-3 text-right pr-3 select-none",
              getThemeClasses()
            )}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: getOptimalFontFamily(),
              lineHeight: 1.6,
            }}
          >
            {generateLineNumbers()}
          </div>
        )}

        {/* Editor or Preview */}
        <div className="flex-1 relative overflow-auto bg-background">
          {isPreviewMode ? (
            // Preview Mode
            <div className={cn(
              "p-6 prose prose-sm max-w-none",
              getFileLanguage() === 'text' || getFileLanguage() === 'markdown' 
                ? "font-sans leading-relaxed" 
                : "font-mono",
              getThemeClasses()
            )}
            style={{
              fontSize: isMobile ? '16px' : `${fontSize}px`,
              fontFamily: getOptimalFontFamily(),
              lineHeight: getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? 1.6 : 1.5,
              maxWidth: getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? '800px' : 'none',
              margin: getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? '0 auto' : '0',
            }}
            >
              {getFileLanguage() === 'markdown' ? (
                <div dangerouslySetInnerHTML={{ __html: getPreviewContent() }} />
              ) : (
                <pre className={cn(
                  "whitespace-pre-wrap overflow-x-auto",
                  getFileLanguage() === 'text' ? "font-sans" : "font-mono text-sm",
                  getThemeClasses()
                )}>
                  {findTerm ? (
                    <div dangerouslySetInnerHTML={{ 
                      __html: highlightMatches(getSyntaxHighlightedContent(), findTerm) 
                    }} />
                  ) : (
                    <div dangerouslySetInnerHTML={{ 
                      __html: getSyntaxHighlightedContent() 
                    }} />
                  )}
                </pre>
              )}
            </div>
          ) : (
            // Edit Mode
            <div className="relative h-full">
              {/* Syntax highlighting background layer */}
              {getFileLanguage() !== 'text' && getFileLanguage() !== 'markdown' ? (
                <div 
                  className={cn(
                    "syntax-highlighting-layer absolute inset-0 pointer-events-none overflow-hidden whitespace-pre font-mono",
                    wordWrap ? "whitespace-pre-wrap" : "whitespace-pre overflow-x-auto",
                    getThemeClasses()
                  )}
                  style={{
                    fontSize: isMobile ? '16px' : `${fontSize}px`,
                    fontFamily: getOptimalFontFamily(),
                    lineHeight: 1.6,
                    letterSpacing: '-0.01em',
                    padding: isMobile ? '12px' : '20px',
                    zIndex: 1,
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: getSyntaxHighlightedContent() || content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  }}
                />
              ) : null}
              
              {/* Transparent textarea overlay */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onInput={(e) => {
                  // Additional safeguard to ensure clean input
                  const target = e.target as HTMLTextAreaElement;
                  if (target.value !== content) {
                    setContent(target.value);
                    setIsTyping(true);
                    
                    // Clear previous typing timeout
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    }
                    
                    // Set new typing timeout - fast response
                    typingTimeoutRef.current = setTimeout(() => {
                      setIsTyping(false);
                    }, 300);
                  }
                }}
                onKeyDown={handleKeyDown}
                onWheel={handleWheelZoom}
                onSelect={handleCursorPositionChange}
                onScroll={(e) => {
                  // Sync scroll with syntax highlighting layer
                  const target = e.target as HTMLTextAreaElement;
                  const syntaxLayer = target.parentElement?.querySelector('.syntax-highlighting-layer') as HTMLElement;
                  if (syntaxLayer) {
                    syntaxLayer.scrollTop = target.scrollTop;
                    syntaxLayer.scrollLeft = target.scrollLeft;
                  }
                }}
                className={cn(
                  "w-full h-full resize-none border-0 bg-transparent focus:outline-none relative",
                  "scroll-smooth",
                  // Show text for text/markdown files, transparent for code files
                  getFileLanguage() === 'text' || getFileLanguage() === 'markdown' 
                    ? cn("caret-current selection:bg-blue-500/30", getThemeClasses())
                    : "text-transparent caret-white selection:bg-blue-500/30",
                  wordWrap ? "whitespace-pre-wrap" : "whitespace-pre overflow-x-auto",
                  readonly && "cursor-default",
                  "placeholder:text-muted-foreground",
                  // Mobile optimizations for fast typing
                  "touch-manipulation"
                )}
                style={{
                  fontSize: isMobile ? '16px' : `${fontSize}px`,
                  fontFamily: getOptimalFontFamily(),
                  lineHeight: 1.6,
                  letterSpacing: getFileLanguage() === 'text' || getFileLanguage() === 'markdown' ? 'normal' : '-0.01em',
                  padding: isMobile ? '12px' : '20px',
                  tabSize: 2,
                  zIndex: 2,
                  // Enhanced rendering for fast typing
                  willChange: isTyping ? 'contents' : 'auto',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                }}
                placeholder={readonly ? "File content will appear here..." : "Start typing..."}
                readOnly={readonly}
                spellCheck={getFileLanguage() === 'text' || getFileLanguage() === 'markdown'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                inputMode="text"
                enterKeyHint="enter"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              />

              {/* Vim Mode Indicator */}
              {editorMode === 'vim' && (
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded z-10">
                  VIM
                </div>
              )}

              {/* Editor Status */}
              <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded z-10">
                {encoding.toUpperCase()} | Line {cursorPosition.line}, Col {cursorPosition.column}
                {hasChanges && !autoSave && <span className="ml-2 text-yellow-600">•</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Language: {getFileLanguage()}</span>
          <span>Lines: {lineCount}</span>
          <span>Characters: {content.length}</span>
          <span>Zoom: {fontSize}px</span>
          {editorMode === 'vim' && <span className="text-primary">VIM</span>}
        </div>
        <div className="flex items-center gap-4">
          {autoSave && (
            <span className="text-green-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Auto-save
            </span>
          )}
          {hasChanges && !autoSave && <span className="text-yellow-600">Modified</span>}
          <span>{encoding.toUpperCase()}</span>
          <span>Line {cursorPosition.line}, Col {cursorPosition.column}</span>
        </div>
      </div>
    </div>
  );
};

export default EnhancedTextEditor;