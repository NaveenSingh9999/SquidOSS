import React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  fallback,
  size = 'md',
  className,
  ...props
}) => {
  const [imageError, setImageError] = React.useState(false);

  const getFallbackText = () => {
    if (fallback) return fallback;
    if (alt) return alt.slice(0, 2).toUpperCase();
    return '?';
  };

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        'rounded-full bg-gradient-to-br from-squid-blue-500 to-squid-blue-600',
        'text-white font-semibold',
        'overflow-hidden',
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={alt || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{getFallbackText()}</span>
      )}
    </div>
  );
};
