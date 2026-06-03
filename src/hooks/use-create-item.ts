import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createFolder, uploadFile } from '@/lib/api';
import type { Icon } from '@/lib/icon-map';
import { Code, Database, File as FileIcon, FileText } from '@/lib/icon-map';

type CreateMode = 'file' | 'folder';

export interface CreateFileType {
  name: string;
  extension: string;
  icon: Icon;
  editor: string;
}

interface UseCreateItemOptions {
  currentPath?: string;
  onItemCreated?: () => void;
}

export const useCreateItem = ({
  currentPath = '',
  onItemCreated,
}: UseCreateItemOptions = {}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>('file');

  const fileTypes = useMemo<CreateFileType[]>(
    () => [
      { name: 'Text File', extension: '.txt', icon: FileText, editor: 'text' },
      { name: 'Document', extension: '.docx', icon: FileIcon, editor: 'document' },
      { name: 'JavaScript', extension: '.js', icon: Code, editor: 'cbcode' },
      { name: 'TypeScript', extension: '.ts', icon: Code, editor: 'cbcode' },
      { name: 'Python', extension: '.py', icon: Code, editor: 'cbcode' },
      { name: 'HTML', extension: '.html', icon: Code, editor: 'cbcode' },
      { name: 'CSS', extension: '.css', icon: Code, editor: 'cbcode' },
      { name: 'JSON', extension: '.json', icon: Database, editor: 'cbcode' },
    ],
    [],
  );

  const openFolderDialog = useCallback(() => {
    setCreateMode('folder');
    setFileType('');
    setFileName('New Folder');
    setDialogOpen(true);
  }, []);

  const openFileDialog = useCallback((type: CreateFileType) => {
    setCreateMode('file');
    setFileType(type.extension);
    setFileName(`untitled${type.extension}`);
    setDialogOpen(true);
  }, []);

  const resetState = useCallback(() => {
    setDialogOpen(false);
    setFileName('');
    setFileType('');
    setCreating(false);
  }, []);

  const submit = useCallback(async () => {
    if (!fileName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please provide a name before continuing.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You need to be signed in to create files or folders.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);

    try {
      if (createMode === 'folder') {
        await createFolder(fileName.trim(), currentPath || '');

        toast({
          title: 'Folder created',
          description: `${fileName} created successfully ✅`,
        });
      } else {
        const finalFileName = fileName.endsWith(fileType) ? fileName : `${fileName}${fileType}`;

        let content = '';
        switch (fileType) {
          case '.js':
            content = '// New JavaScript file\nconsole.log("Hello World!");';
            break;
          case '.ts':
            content = '// New TypeScript file\nconsole.log("Hello World!");';
            break;
          case '.py':
            content = '# New Python file\nprint("Hello World!")';
            break;
          case '.html':
            content = '<!DOCTYPE html>\n<html>\n<head>\n    <title>New Document</title>\n</head>\n<body>\n    <h1>Hello World!</h1>\n</body>\n</html>';
            break;
          case '.css':
            content = '/* New CSS file */\nbody {\n    margin: 0;\n    padding: 0;\n}';
            break;
          case '.json':
            content = '{\n    "name": "new-file",\n    "version": "1.0.0"\n}';
            break;
          case '.docx':
            content = 'New document\n\nStart writing here...';
            break;
          default:
            content = 'New file\n\nStart writing here...';
        }

        const fileObject = new window.File([content], finalFileName, {
          type: 'text/plain',
          lastModified: Date.now(),
        });

        await uploadFile(fileObject, currentPath || '', () => {});

        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0FMIzS9N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0FLIHg8tsJNgcYZbrk6qNTDAl6mdLH8dmJPgcZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0FLIHg8tsJNgcYZbrk6qNTDAl6mdLH8dmJPgcZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMfCj2a2+/EeB0F');
          audio.volume = 0.3;
          audio.play().catch(() => {});
        } catch (error) {
          console.warn('Audio playback failed', error);
        }

        toast({
          title: 'File created',
          description: `${finalFileName} created successfully ✅`,
        });
      }

      onItemCreated?.();
      resetState();
    } catch (error: unknown) {
      console.error('Failed to create item:', error);
      toast({
        title: 'Creation failed',
        description: `Failed to create ${createMode}. Please try again.`,
        variant: 'destructive',
      });
      setCreating(false);
    }
  }, [
    createMode,
    currentPath,
    fileName,
    fileType,
    onItemCreated,
    resetState,
    toast,
    user,
  ]);

  return {
    fileTypes,
    dialogOpen,
    setDialogOpen,
    fileName,
    setFileName,
    createMode,
    creating,
    openFileDialog,
    openFolderDialog,
    submit,
  };
};
