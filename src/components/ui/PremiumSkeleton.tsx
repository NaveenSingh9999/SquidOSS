/**
 * Premium Skeleton Components
 * Apple-level loading states with shimmer animation
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: number | string;
  height?: number | string;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "rectangular", width, height, style, ...props }, ref) => {
    const variantClasses = {
      text: "rounded-md h-4",
      circular: "rounded-full",
      rectangular: "rounded-lg",
      rounded: "rounded-xl",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "skeleton-shimmer bg-muted",
          variantClasses[variant],
          className
        )}
        style={{
          width: width,
          height: height,
          ...style,
        }}
        {...props}
      />
    );
  }
);
Skeleton.displayName = "Skeleton";

/* Preset Skeleton Components */

const SkeletonCard = ({ className }: { className?: string }) => (
  <div className={cn(
    "premium-card space-y-4 animate-soft-pulse",
    className
  )}>
    <div className="flex items-start gap-4">
      <Skeleton variant="rounded" className="h-12 w-12 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" className="h-4 w-3/4" />
        <Skeleton variant="text" className="h-3 w-1/2" />
      </div>
    </div>
    <Skeleton variant="rectangular" className="h-20 w-full" />
  </div>
);

const SkeletonFileCard = ({ viewMode = "grid" }: { viewMode?: "grid" | "list" }) => {
  if (viewMode === "list") {
    return (
      <div className="flex items-center gap-4 p-4 animate-soft-pulse">
        <Skeleton variant="rounded" className="h-11 w-11 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-48" />
          <Skeleton variant="text" className="h-3 w-24" />
        </div>
        <Skeleton variant="circular" className="h-8 w-8 shrink-0" />
      </div>
    );
  }

  return (
    <div className="premium-card space-y-3 animate-soft-pulse p-4">
      <div className="flex items-start justify-between">
        <Skeleton variant="rounded" className="h-10 w-10" />
        <Skeleton variant="circular" className="h-8 w-8" />
      </div>
      <div className="space-y-2 pt-2">
        <Skeleton variant="text" className="h-4 w-4/5" />
        <Skeleton variant="text" className="h-3 w-1/3" />
      </div>
    </div>
  );
};

const SkeletonTable = ({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) => (
  <div className="space-y-3 animate-soft-pulse">
    {/* Header */}
    <div className="flex gap-4 pb-2 border-b border-border/50">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} variant="text" className="h-4 flex-1" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex gap-4 py-3">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton 
            key={colIndex} 
            variant="text" 
            className={cn(
              "h-4 flex-1",
              colIndex === 0 && "w-1/4",
              colIndex === columns - 1 && "w-16"
            )} 
          />
        ))}
      </div>
    ))}
  </div>
);

const SkeletonAvatar = ({ size = 40 }: { size?: number }) => (
  <Skeleton 
    variant="circular" 
    className="shrink-0"
    style={{ width: size, height: size }}
  />
);

const SkeletonButton = ({ width = 100, height = 36 }: { width?: number; height?: number }) => (
  <Skeleton 
    variant="rounded" 
    style={{ width, height }}
  />
);

const SkeletonParagraph = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-2 animate-soft-pulse">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton 
        key={i} 
        variant="text" 
        className={cn(
          "h-4",
          i === lines - 1 ? "w-2/3" : "w-full"
        )} 
      />
    ))}
  </div>
);

/* Grid skeleton for file grid */
const SkeletonFileGrid = ({ count = 8, viewMode = "grid" }: { count?: number; viewMode?: "grid" | "list" }) => {
  if (viewMode === "list") {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonFileCard key={i} viewMode="list" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonFileCard key={i} viewMode="grid" />
      ))}
    </div>
  );
};

export {
  Skeleton,
  SkeletonCard,
  SkeletonFileCard,
  SkeletonFileGrid,
  SkeletonTable,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonParagraph,
};
