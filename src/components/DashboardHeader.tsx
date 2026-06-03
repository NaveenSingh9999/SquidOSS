import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Bell } from '@/lib/icon-map';

interface DashboardHeaderProps {
  title: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  actions?: React.ReactNode;
  showStats?: boolean;
  stats?: Array<{
    label: string;
    value: string;
    icon: React.ReactNode;
    color: string;
  }>;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  searchQuery = '',
  onSearchChange,
  actions,
  showStats = false,
  stats = [],
}) => {
  return (
    <div className="space-y-4 px-8 pt-6 pb-4">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {actions}
      </div>

      {/* Search and Tools Row */}
      <div className="flex items-center gap-3">
        {/* Search Input */}
        {onSearchChange && (
          <div className="flex-1 max-w-md relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 h-9 rounded-lg border-border/50 bg-accent/30 text-sm placeholder:text-muted-foreground/70 transition-all focus:bg-accent/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
        )}

        {/* Notifications */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-lg border border-border/50 hover:bg-accent/50"
        >
          <Bell className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Stats Row */}
      {showStats && stats.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="group relative overflow-hidden rounded-lg border border-border/50 bg-card/50 px-4 py-3 backdrop-blur transition-all duration-200 hover:border-border/70 hover:bg-card/70"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center bg-accent/50',
                  stat.color
                )}>
                  {stat.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="text-lg font-semibold text-foreground truncate">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardHeader;
