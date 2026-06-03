import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Trash2,
  Share2,
  FolderInput,
  X,
  CheckSquare,
  Square,
} from '@/lib/icon-map';
import { cn } from '@/lib/utils';

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDownload: () => void;
  onBulkDelete: () => void;
  onBulkShare: () => void;
  onBulkMove: () => void;
  onClose: () => void;
  isMobile?: boolean;
}

const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkDownload,
  onBulkDelete,
  onBulkShare,
  onBulkMove,
  onClose,
  isMobile = false,
}) => {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div
      className={cn(
        "fixed z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl",
        "animate-in slide-in-from-bottom-5 duration-200",
        isMobile
          ? "bottom-20 left-3 right-3 rounded-2xl"
          : "bottom-8 left-1/2 -translate-x-1/2 rounded-2xl max-w-4xl"
      )}
    >
      <div className={cn(
        "relative",
        isMobile ? "p-3" : "p-4"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {selectedCount} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={allSelected ? onClearSelection : onSelectAll}
              className="h-8 text-xs"
            >
              {allSelected ? (
                <>
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                  Select All
                </>
              )}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Actions */}
        <div
          className={cn(
            "grid gap-2",
            isMobile ? "grid-cols-2" : "grid-cols-4"
          )}
        >
          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={onBulkDownload}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>

          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={onBulkShare}
            className="gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>

          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={onBulkMove}
            className="gap-2"
          >
            <FolderInput className="w-4 h-4" />
            Move
          </Button>

          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={onBulkDelete}
            className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsToolbar;
