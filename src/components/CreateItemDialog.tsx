import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import UnifiedLoader from '@/components/ui/UnifiedLoader';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type CreateMode = 'file' | 'folder';

interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createMode: CreateMode;
  fileName: string;
  onFileNameChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  creating: boolean;
  currentPath?: string;
}

const CreateItemDialog: React.FC<CreateItemDialogProps> = ({
  open,
  onOpenChange,
  createMode,
  fileName,
  onFileNameChange,
  onSubmit,
  creating,
  currentPath,
}) => {
  const isMobile = useIsMobile();
  
  const handleClose = (nextOpen: boolean) => {
    if (!creating) {
      onOpenChange(nextOpen);
    }
  };

  const handleSubmit = async () => {
    await onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "sm:max-w-[425px]",
        isMobile && "bg-[#0d1117]/95 backdrop-blur-2xl border-blue-500/20 rounded-3xl"
      )}>
        <DialogHeader>
          <DialogTitle className={cn(isMobile && "text-blue-50")}>
            Create New {createMode === 'folder' ? 'Folder' : 'File'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="mobile-create-name" className={cn(isMobile && "text-blue-200/70")}>
              {createMode === 'folder' ? 'Folder' : 'File'} name
            </Label>
            <Input
              id="mobile-create-name"
              value={fileName}
              onChange={(e) => onFileNameChange(e.target.value)}
              placeholder={`Enter ${createMode} name...`}
              disabled={creating}
              className={cn(
                isMobile && "bg-blue-500/10 border-blue-500/20 text-blue-50 placeholder:text-blue-300/40 rounded-xl focus:ring-blue-500/50 focus:border-blue-500/40"
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) {
                  void handleSubmit();
                }
              }}
            />
          </div>
          {currentPath && (
            <div className={cn("text-sm", isMobile ? "text-blue-200/50" : "text-muted-foreground")}>
              Will be created in: {currentPath}
            </div>
          )}
           <div className="flex justify-end gap-2">
             <Button
               variant="outline"
               onClick={() => handleClose(false)}
               disabled={creating}
               className={cn(
                 isMobile && "bg-transparent border-blue-500/20 text-blue-500 hover:bg-blue-500/5 rounded-xl transition-none"
               )}
             >
               Cancel
             </Button>
             <Button 
               onClick={() => void handleSubmit()} 
               disabled={!fileName.trim() || creating}
               className={cn(
                 isMobile && "bg-transparent border-blue-500 text-blue-500 hover:bg-blue-500/5 rounded-xl transition-none"
               )}
             >
               {creating ? (
                 <div className="flex items-center gap-2">
                   <UnifiedLoader size="small" />
                   Creating...
                 </div>
               ) : (
                 'Create'
               )}
             </Button>
           </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateItemDialog;
