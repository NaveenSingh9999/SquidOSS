import React from 'react';
import { cn } from '@/lib/utils';

interface AppleLoaderProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
  color?: 'primary' | 'white' | 'dark';
}

const AppleLoader: React.FC<AppleLoaderProps> = ({ 
  size = 'medium', 
  className,
  color = 'primary'
}) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8', 
    large: 'w-12 h-12'
  };

  const dotSizes = {
    small: 'w-0.5 h-0.5',
    medium: 'w-1 h-1',
    large: 'w-1.5 h-1.5'
  };

  const colorClasses = {
    primary: 'bg-primary',
    white: 'bg-white',
    dark: 'bg-gray-800'
  };

  // Generate 12 dots around the circle
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30) * (Math.PI / 180); // 30 degrees apart
    const radius = size === 'small' ? 6 : size === 'medium' ? 12 : 18;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    return (
      <div
        key={i}
        className={cn(
          "absolute rounded-full apple-loader-dot",
          dotSizes[size],
          colorClasses[color]
        )}
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
          animationDelay: `${i * 0.1}s`,
        }}
      />
    );
  });

  return (
    <div 
      className={cn(
        "relative inline-block apple-loader",
        sizeClasses[size],
        className
      )}
    >
      {dots}
    </div>
  );
};

export default AppleLoader;