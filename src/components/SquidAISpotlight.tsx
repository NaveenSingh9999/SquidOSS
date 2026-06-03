import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, ArrowRight, FolderPlus, FileText, MoveHorizontal } from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import { squidAI } from '@/services/squid-ai';
import { SquidAITools } from '@/services/squid-ai-tools';
import { useToast } from '@/hooks/use-toast';

interface SquidAISpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  files?: any[];
  currentFolder?: string;
  context?: {
    fileName?: string;
    fileType?: string;
    filePath?: string;
    fileContent?: string;
  };
  onActionComplete?: () => void;
}

export const SquidAISpotlight: React.FC<SquidAISpotlightProps> = ({
  isOpen,
  onClose,
  files = [],
  currentFolder = '',
  context,
  onActionComplete
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Organize my files into folders',
    'Create a new folder',
    'Move files by type',
    'Generate README file',
    'Show me all images'
  ]);
  const [result, setResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      // Focus input when dialog opens
      setTimeout(() => inputRef.current?.focus(), 100);
      setInput('');
      setResult(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await squidAI.chat(input, context);
      
      setResult(response.message);

      // Handle actions
      if (response.action) {
        await handleAction(response.action);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      });
      setResult('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: any) => {
    try {
      switch (action.action) {
        case 'ORGANIZE_FILES':
          const orgResult = await SquidAITools.organizeFilesByType(files, currentFolder);
          toast({
            title: 'Files Organized! 🎉',
            description: orgResult.summary
          });
          onActionComplete?.();
          setTimeout(onClose, 2000);
          break;

        case 'CREATE_FOLDER':
          const created = await SquidAITools.createFolder(
            action.parameters.folderName,
            action.parameters.parentPath || currentFolder
          );
          if (created) {
            toast({
              title: 'Folder Created',
              description: `Created "${action.parameters.folderName}"`
            });
            onActionComplete?.();
          }
          break;

        case 'MOVE_FILES':
          const moved = await SquidAITools.moveFilesToFolder(
            action.parameters.fileIds,
            action.parameters.targetFolder
          );
          toast({
            title: 'Files Moved',
            description: `Moved ${moved} files`
          });
          onActionComplete?.();
          break;

        default:
          break;
      }
    } catch (error: any) {
      toast({
        title: 'Action Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 bg-slate-900/98 backdrop-blur-2xl border-slate-700/50 shadow-2xl">
        {/* Spotlight Search Bar */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          
          <form onSubmit={handleSubmit}>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Squid AI anything..."
              className="h-16 pl-16 pr-4 text-lg bg-transparent border-0 border-b border-slate-700/50 rounded-none focus-visible:ring-0 text-white placeholder:text-slate-500"
              autoComplete="off"
            />
          </form>
        </div>

        {/* Results or Suggestions */}
        <div className="max-h-[400px] overflow-y-auto">
          {result ? (
            // AI Response
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {result}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <p className="text-xs text-slate-500">Press Esc to close</p>
                <button
                  onClick={onClose}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            // Suggestions
            <div className="p-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-2">
                Suggestions
              </p>
              <div className="space-y-1">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/60 transition-all duration-150 text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-700/60 transition-colors">
                      {idx === 0 && <FolderPlus className="w-4 h-4 text-blue-400" />}
                      {idx === 1 && <FolderPlus className="w-4 h-4 text-purple-400" />}
                      {idx === 2 && <MoveHorizontal className="w-4 h-4 text-green-400" />}
                      {idx === 3 && <FileText className="w-4 h-4 text-orange-400" />}
                      {idx === 4 && <Sparkles className="w-4 h-4 text-pink-400" />}
                    </div>
                    <span className="flex-1 text-sm text-slate-300 group-hover:text-white transition-colors">
                      {suggestion}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Hint */}
        {!result && (
          <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">↵</kbd>
                  Submit
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">Esc</kbd>
                  Close
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">⌘</kbd>
                <kbd className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">K</kbd>
                Reopen
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
