
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Save, 
  Download, 
  Maximize,
  Minimize,
  X,
  Type,
  Code,
  FileText,
  Copy,
  Check
} from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface TextEditorProps {
  file: {
    id: string;
    name: string;
    type: string;
    size: number;
  };
  content: string;
  open: boolean;
  onClose: () => void;
  onSave?: (content: string) => void;
  onDownload?: () => void;
  readOnly?: boolean;
}

const TextEditor: React.FC<TextEditorProps> = ({
  file,
  content: initialContent,
  open,
  onClose,
  onSave,
  onDownload,
  readOnly = false
}) => {
  const [content, setContent] = useState<string>('');
  const [isModified, setIsModified] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      setContent(initialContent);
      setIsModified(false);
      setIsFullscreen(false);
      setFontSize(isMobile ? 12 : 14);
    }
  }, [open, initialContent, isMobile]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setIsModified(newContent !== initialContent);
  };

  const handleSave = async () => {
    if (onSave && isModified && !saving) {
      setSaving(true);
      try {
        await onSave(content);
        setIsModified(false);
        toast({
          title: "File saved",
          description: `${file.name} has been saved successfully.`,
        });
      } catch (error) {
        toast({
          title: "Save failed",
          description: "Failed to save the file. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "File content has been copied.",
      });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Failed to copy content to clipboard.",
        variant: "destructive",
      });
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          handleSave();
          break;
        case 'Enter':
          e.preventDefault();
          toggleFullscreen();
          break;
        case '=':
          e.preventDefault();
          setFontSize(prev => Math.min(prev + 2, 24));
          break;
        case '-':
          e.preventDefault();
          setFontSize(prev => Math.max(prev - 2, 10));
          break;
      }
    }

    if (e.key === 'Escape' && isFullscreen) {
      e.preventDefault();
      setIsFullscreen(false);
    }
  };

  const getFileIcon = () => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'json':
      case 'html':
      case 'css':
      case 'xml':
        return <Code className="h-4 w-4" />;
      case 'md':
      case 'markdown':
        return <Type className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getLanguage = () => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'JavaScript';
      case 'ts':
      case 'tsx':
        return 'TypeScript';
      case 'json':
        return 'JSON';
      case 'html':
        return 'HTML';
      case 'css':
        return 'CSS';
      case 'md':
      case 'markdown':
        return 'Markdown';
      case 'xml':
        return 'XML';
      case 'log':
        return 'Log';
      default:
        return 'Text';
    }
  };

  const lineCount = content.split('\n').length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`${isFullscreen ? 'max-w-full w-screen h-screen' : 'max-w-6xl w-[95vw] h-[90vh]'} p-0 flex flex-col`}>
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getFileIcon()}
              <span className="truncate">{file.name}</span>
              <span className="text-xs bg-muted px-2 py-1 rounded">{getLanguage()}</span>
              {isModified && <span className="text-xs text-amber-500">• Modified</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              {onDownload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {!isMobile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Line Numbers */}
          {showLineNumbers && !isMobile && (
            <div 
              className="bg-muted/30 border-r px-2 py-4 text-xs text-muted-foreground select-none overflow-hidden flex-shrink-0"
              style={{ fontSize: `${fontSize - 2}px`, lineHeight: `${fontSize + 6}px` }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1} className="text-right pr-2 min-w-[30px]">
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 p-4 overflow-hidden">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={readOnly ? "This file is read-only..." : "Start typing..."}
              readOnly={readOnly}
              className={`w-full h-full resize-none border-0 bg-transparent focus:ring-0 font-mono ${
                readOnly ? 'cursor-default' : ''
              }`}
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: `${fontSize + 6}px`,
                minHeight: '100%'
              }}
            />
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div className="border-t p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Lines: {lineCount}</span>
              <span>Characters: {content.length}</span>
              <span>Size: {(content.length / 1024).toFixed(1)} KB</span>
            </div>

            <div className="flex items-center gap-2">
              {!isMobile && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(prev - 2, 10))}
                  >
                    A-
                  </Button>
                  <span className="text-xs min-w-8 text-center">{fontSize}px</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(prev + 2, 24))}
                  >
                    A+
                  </Button>
                </>
              )}

              {onSave && !readOnly && (
                <Button
                  onClick={handleSave}
                  disabled={!isModified || saving}
                  size="sm"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-2 text-center">
            {!readOnly && 'Ctrl+S to save • '}Ctrl+Enter for fullscreen • Ctrl+/- to resize font
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TextEditor;
