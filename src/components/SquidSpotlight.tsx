import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, ArrowRight, Folder, File, Zap, X } from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import { squidAI } from '@/services/squid-ai';
import { SquidAITools } from '@/services/squid-ai-tools';
import { useToast } from '@/hooks/use-toast';

interface SquidSpotlightProps {
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

export const SquidSpotlight: React.FC<SquidSpotlightProps> = ({
  isOpen,
  onClose,
  files = [],
  currentFolder = '',
  context,
  onActionComplete
}) => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [suggestions] = useState([
    { icon: Zap, text: 'Organize my files', action: 'organize' },
    { icon: Folder, text: 'Create a new folder', action: 'create_folder' },
    { icon: File, text: 'Generate README', action: 'generate_readme' },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      initializeAI();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setInput('');
      setResponse('');
    }
  }, [isOpen]);

  const initializeAI = async () => {
    try {
      const success = await squidAI.initialize();
      setIsInitialized(success);

      if (!success) {
        toast({
          title: 'Squid AI Unavailable',
          description:
            'Squid AI could not be initialized. Ensure your Gemini API key is available via SUPABASE secrets (GEMINI_API_KEY).',
          variant: 'destructive'
        });
      }
      return success;
    } catch (err: any) {
      console.error('initializeAI error:', err);
      toast({
        title: 'Squid AI Error',
        description: err?.message || 'Unexpected error while initializing Squid AI.',
        variant: 'destructive'
      });
      setIsInitialized(false);
      return false;
    }
  };

  const handleSubmit = async (message?: string) => {
    const query = message || input.trim();
    if (!query || !isInitialized) return;

    setIsLoading(true);
    setResponse('');

    try {
      const result = await squidAI.chat(query, context);
      setResponse(result.message);

      if (result.action) {
        await handleAction(result.action);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      setResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: any) => {
    try {
      switch (action.action) {
        case 'ORGANIZE_FILES':
          const result = await SquidAITools.organizeFilesByType(files, currentFolder);
          toast({
            title: 'Files Organized! 🎉',
            description: result.summary
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
              title: 'Folder Created! 📁',
              description: `Created "${action.parameters.folderName}"`
            });
            onActionComplete?.();
            setTimeout(onClose, 1500);
          }
          break;

        case 'MOVE_FILES':
          const moved = await SquidAITools.moveFilesToFolder(
            action.parameters.fileIds,
            action.parameters.targetFolder
          );
          toast({
            title: 'Files Moved! ✨',
            description: `Moved ${moved} files`
          });
          onActionComplete?.();
          setTimeout(onClose, 1500);
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

  const handleSuggestionClick = (suggestion: typeof suggestions[0]) => {
    setInput(suggestion.text);
    handleSubmit(suggestion.text);
  };

  const clearInput = () => {
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-slate-900/92 backdrop-blur-[10px] border border-slate-800/40 shadow-2xl overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/40 bg-gradient-to-r from-slate-900/60 to-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Squid AI Spotlight</h3>
              <p className="text-xs text-slate-400">Quick search & file actions — Press Esc to close</p>
            </div>
          </div>
          <div className="text-xs text-slate-500">Tip: <kbd className="px-2 py-1 bg-slate-800/60 rounded text-slate-400">⌘K</kbd></div>
        </div>

        {/* Input */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-800/40 rounded-full px-3 py-2 w-full gap-3">
              <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder={isInitialized ? 'Ask Squid AI anything — e.g. "Organize my files"' : 'Squid AI is unavailable'}
                className="border-0 bg-transparent text-lg text-white placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                disabled={!isInitialized || isLoading}
                aria-label="Squid AI input"
              />
              <div className="flex items-center gap-2">
                {input && (
                  <button onClick={clearInput} className="p-1 rounded-full hover:bg-slate-800/60">
                    <X className="w-4 h-4 text-slate-300" />
                  </button>
                )}
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                ) : (
                  <button
                    onClick={() => handleSubmit()}
                    disabled={!isInitialized || !input}
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium transition-all',
                      !isInitialized || !input ? 'bg-slate-800/30 text-slate-500' : 'bg-blue-500 hover:bg-blue-600 text-white'
                    )}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
          {!isInitialized && (
            <div className="mt-3 px-3 py-2 rounded-md bg-red-900/20 border border-red-900/10 text-sm text-red-200">
              Squid AI is not configured. Set <span className="font-mono">GEMINI_API_KEY</span> in Supabase secrets.
            </div>
          )}
        </div>

        {/* Response */}
        {response && (
          <div className="px-6 py-4 bg-slate-800/30 border-t border-slate-800/40">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="rounded-lg bg-slate-900/60 p-3">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{response}</p>
                </div>
                <div className="mt-2 text-xs text-slate-500">Response generated by Squid AI</div>
              </div>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {!response && !isLoading && (
          <div className="px-6 py-4 space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">
              Quick Actions
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-all',
                    !isInitialized ? 'bg-slate-800/30 text-slate-500' : 'bg-slate-800/40 text-slate-200 hover:bg-slate-800/60'
                  )}
                  disabled={!isInitialized}
                >
                  <suggestion.icon className="w-4 h-4 text-blue-400" />
                  <span>{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keyboard Hint */}
        <div className="px-6 py-3 border-t border-slate-800/50 bg-slate-900/60">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              <kbd className="px-2 py-1 bg-slate-800/60 rounded text-slate-400">⌘K</kbd> or{' '}
              <kbd className="px-2 py-1 bg-slate-800/60 rounded text-slate-400">Ctrl+K</kbd> to open
            </span>
            <span>
              <kbd className="px-2 py-1 bg-slate-800/60 rounded text-slate-400">Enter</kbd> to send
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
