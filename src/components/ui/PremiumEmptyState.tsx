/**
 * Premium Empty State Components
 * Intentional, calm, and helpful empty states
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  FileQuestion, 
  FolderOpen, 
  Search, 
  Inbox,
  Share2,
  Trash2,
  Plus,
  Upload
} from "@/lib/icon-map";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      "py-16 px-6 animate-fade-up",
      className
    )}>
      {icon && (
        <div className={cn(
          "w-16 h-16 rounded-2xl mb-6",
          "bg-muted/50 border border-border/50",
          "flex items-center justify-center",
          "text-muted-foreground/60"
        )}>
          {icon}
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-sm text-muted-foreground max-w-[280px] mb-6 leading-relaxed">
          {description}
        </p>
      )}
      
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button 
              onClick={action.onClick}
              variant={action.variant || "default"}
              className="gap-2"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button 
              onClick={secondaryAction.onClick}
              variant="ghost"
              className="text-muted-foreground"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/* Preset Empty States */

interface PresetEmptyStateProps {
  onAction?: () => void;
  className?: string;
}

const EmptyFiles: React.FC<PresetEmptyStateProps> = ({ onAction, className }) => (
  <EmptyState
    icon={<FolderOpen className="w-7 h-7" strokeWidth={1.5} />}
    title="No files yet"
    description="Upload files or create folders to get started with your cloud storage."
    action={onAction ? { label: "Upload files", onClick: onAction } : undefined}
    className={className}
  />
);

const EmptySearch: React.FC<PresetEmptyStateProps & { query?: string }> = ({ query, className }) => (
  <EmptyState
    icon={<Search className="w-7 h-7" strokeWidth={1.5} />}
    title="No results found"
    description={query 
      ? `No files or folders match "${query}". Try a different search term.`
      : "Try adjusting your search or filter to find what you're looking for."
    }
    className={className}
  />
);

const EmptyShared: React.FC<PresetEmptyStateProps> = ({ onAction, className }) => (
  <EmptyState
    icon={<Share2 className="w-7 h-7" strokeWidth={1.5} />}
    title="No shared files"
    description="Files you share with others will appear here. Share a file to get started."
    action={onAction ? { label: "Share a file", onClick: onAction } : undefined}
    className={className}
  />
);

const EmptyTrash: React.FC<PresetEmptyStateProps> = ({ className }) => (
  <EmptyState
    icon={<Trash2 className="w-7 h-7" strokeWidth={1.5} />}
    title="Trash is empty"
    description="Deleted files will appear here. They'll be permanently removed after 30 days."
    className={className}
  />
);

const EmptyInbox: React.FC<PresetEmptyStateProps> = ({ className }) => (
  <EmptyState
    icon={<Inbox className="w-7 h-7" strokeWidth={1.5} />}
    title="All caught up"
    description="You don't have any new notifications right now."
    className={className}
  />
);

const EmptyFolder: React.FC<PresetEmptyStateProps> = ({ onAction, className }) => (
  <EmptyState
    icon={<FolderOpen className="w-7 h-7" strokeWidth={1.5} />}
    title="This folder is empty"
    description="Add files or create subfolders to organize your content."
    action={onAction ? { label: "Add files", onClick: onAction } : undefined}
    className={className}
  />
);

export {
  EmptyState,
  EmptyFiles,
  EmptySearch,
  EmptyShared,
  EmptyTrash,
  EmptyInbox,
  EmptyFolder,
};
