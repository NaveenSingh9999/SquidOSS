import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, Sparkles, Loader2, X } from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import { squidAI } from '@/services/squid-ai';
import { SquidAITools } from '@/services/squid-ai-tools';
import { useToast } from '@/hooks/use-toast';

interface SquidAIChatProps {
  context?: {
    fileName?: string;
    fileType?: string;
    filePath?: string;
    fileContent?: string;
  };
  files?: any[];
  currentFolder?: string;
  onClose?: () => void;
  onActionComplete?: () => void;
}

export const SquidAIChat: React.FC<SquidAIChatProps> = ({
  context,
  files = [],
  currentFolder = '',
  onClose,
  onActionComplete
}) => {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    initializeAI();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeAI = async () => {
    const success = await squidAI.initialize();
    setIsInitialized(success);
    
    if (!success) {
      toast({
        title: 'Squid AI Unavailable',
        description: 'Please configure GEMINI_API_KEY in Supabase secrets',
        variant: 'destructive'
      });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !isInitialized) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await squidAI.chat(userMessage, context);
      
      setMessages(prev => [...prev, { role: 'assistant', content: response.message }]);

      // Handle actions
      if (response.action) {
        await handleAction(response.action);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
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
            title: 'Files Organized',
            description: result.summary
          });
          onActionComplete?.();
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

  return (
    <Card className="flex flex-col h-[500px] bg-slate-900/40 border-slate-800/30">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Squid AI</h3>
            <p className="text-xs text-slate-400">Your intelligent assistant</p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-8">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-blue-500" />
            <p className="font-medium">Hey! I'm Squid AI</p>
            <p className="text-sm mt-2">Try asking me to:</p>
            <ul className="text-sm mt-2 space-y-1">
              <li>• "Organize my files"</li>
              <li>• "Create a README for this project"</li>
              <li>• "Move all images to a folder"</li>
            </ul>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              'flex gap-3',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={cn(
                'rounded-lg px-4 py-2 max-w-[80%]',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/60 text-slate-100'
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="bg-slate-800/60 rounded-lg px-4 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800/30">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Squid AI anything..."
            className="bg-slate-800/60 border-slate-700/50 text-white placeholder:text-slate-500"
            disabled={!isInitialized || isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || !isInitialized || isLoading}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
