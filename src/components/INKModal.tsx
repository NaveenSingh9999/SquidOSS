import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2 } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface INKModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileContext?: {
    fileName?: string;
    fileType?: string;
    inPreview?: boolean;
  };
}

interface INKResponse {
  message: string;
  operations?: Array<{
    type: string;
    params: any;
  }>;
}

export const INKModal: React.FC<INKModalProps> = ({ isOpen, onClose, fileContext }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const executeOperations = async (operations: Array<{ type: string; params: any }>) => {
    for (const op of operations) {
      try {
        if (op.type === 'organize_files_by_type') {
          await organizeFilesByType(op.params.fileTypes);
        } else if (op.type === 'create_file_with_content') {
          await createFileWithContent(op.params.fileName, op.params.content, op.params.mimeType);
        } else if (op.type === 'move_files_to_folder') {
          await moveFilesToFolder(op.params.folderName, op.params.fileNames);
        }
      } catch (error: unknown) {
        console.error(`Error executing operation ${op.type}:`, error);
        toast({
          title: "Operation Failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    }
  };

  const organizeFilesByType = async (fileTypes: string[]) => {
    const { data: files } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user?.id);

    if (!files) return;

    const typeMap: Record<string, string[]> = {
      images: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
      videos: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
      documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
      code: ['text/javascript', 'text/typescript', 'text/html', 'text/css', 'application/json', 'text/x-python', 'text/x-java'],
      audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
      archives: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip'],
    };

    for (const category of fileTypes) {
      const mimeTypes = typeMap[category.toLowerCase()] || [];
      const categoryFiles = files.filter(f => mimeTypes.some(mime => f.type?.includes(mime)));

      if (categoryFiles.length > 0) {
        // Create folder if it doesn't exist
        const { data: existingFolder } = await supabase
          .from('folders')
          .select('*')
          .eq('user_id', user?.id)
          .eq('name', category)
          .single();

        if (!existingFolder) {
          await supabase.from('folders').insert({
            user_id: user?.id,
            name: category,
            path: category,
          });
        }

        // Move files to folder
        for (const file of categoryFiles) {
          await supabase
            .from('files')
            .update({ parent_folder: category })
            .eq('id', file.id);
        }
      }
    }

    toast({
      title: "Files Organized",
      description: `Organized ${files.length} files into ${fileTypes.length} categories`,
    });
  };

  const createFileWithContent = async (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    const formData = new FormData();
    formData.append('file', file);

    // Upload file
    const { data, error } = await supabase
      .from('files')
      .insert({
        user_id: user?.id,
        name: fileName,
        type: mimeType,
        size: blob.size,
        storage_path: `temp/${fileName}`,
      })
      .select()
      .single();

    if (error) throw error;

    toast({
      title: "File Created",
      description: `Created ${fileName}`,
    });
  };

  const moveFilesToFolder = async (folderName: string, fileNames: string[]) => {
    // Create folder if it doesn't exist
    const { data: existingFolder } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', user?.id)
      .eq('name', folderName)
      .single();

    if (!existingFolder) {
      await supabase.from('folders').insert({
        user_id: user?.id,
        name: folderName,
        path: folderName,
      });
    }

    // Move files
    for (const fileName of fileNames) {
      await supabase
        .from('files')
        .update({ parent_folder: folderName })
        .eq('user_id', user?.id)
        .eq('name', fileName);
    }

    toast({
      title: "Files Moved",
      description: `Moved ${fileNames.length} files to ${folderName}`,
    });
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ink-ai', {
        body: {
          prompt: userMessage,
          fileContext: fileContext
        }
      });

      if (error) throw error;

      const response = data as INKResponse;
      setMessages(prev => [...prev, { role: 'assistant', content: response.message }]);

      // Execute operations if any
      if (response.operations && response.operations.length > 0) {
        await executeOperations(response.operations);
      }

    } catch (error: unknown) {
      console.error('INK AI error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process request",
        variant: "destructive",
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl mx-4 bg-gradient-to-br from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                INK AI
              </h2>
              <p className="text-xs text-muted-foreground">Your intelligent file assistant</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="h-96 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Ask me to organize files, create content, or manage your storage!</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                    : 'bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 border-t border-white/10 dark:border-white/5">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask INK anything..."
              className="flex-1 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm"
              disabled={loading}
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              Send
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Ctrl+Q to open • Powered by Lovable AI
          </p>
        </div>
      </div>
    </div>
  );
};
