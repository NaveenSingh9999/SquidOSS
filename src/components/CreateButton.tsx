import React, { useMemo } from 'react';
import { Plus, Folder } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CreateItemDialog from '@/components/CreateItemDialog';
import { useCreateItem } from '@/hooks/use-create-item';

import type { CreateFileType } from '@/hooks/use-create-item';

interface CreateButtonProps {
  currentPath?: string;
  onFileCreated?: () => void;
  'data-create-button'?: string;
}

const CreateButton: React.FC<CreateButtonProps> = ({ 
  currentPath = '', 
  onFileCreated,
  'data-create-button': dataCreateButton 
}) => {
  const {
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
  } = useCreateItem({ currentPath, onItemCreated: onFileCreated });

  const documentTypes = useMemo<CreateFileType[]>(() => fileTypes.slice(0, 2), [fileTypes]);
  const codeTypes = useMemo<CreateFileType[]>(() => fileTypes.slice(2), [fileTypes]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2" 
            data-create-button={dataCreateButton}
          >
            <Plus className="w-4 h-4" />
            Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={openFolderDialog}
            className="gap-2"
          >
            <Folder className="w-4 h-4" />
            New Folder
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
            Documents
          </div>
          {documentTypes.map((type) => (
            <DropdownMenuItem
              key={type.extension}
              onClick={() => openFileDialog(type)}
              className="gap-2"
            >
              <type.icon className="w-4 h-4" />
              {type.name}
            </DropdownMenuItem>
          ))}
          
          <DropdownMenuSeparator />
          
          <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
            Code Files
          </div>
          {codeTypes.map((type) => (
            <DropdownMenuItem
              key={type.extension}
              onClick={() => openFileDialog(type)}
              className="gap-2"
            >
              <type.icon className="w-4 h-4" />
              {type.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        createMode={createMode}
        fileName={fileName}
        onFileNameChange={setFileName}
        onSubmit={submit}
        creating={creating}
        currentPath={currentPath}
      />
    </>
  );
};

export default CreateButton;