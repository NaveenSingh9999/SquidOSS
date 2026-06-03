import React from 'react';
import { useSquidsetTheme } from '@/contexts/SquidsetThemeContext';
import { Button as DefaultButton } from '@/components/ui/button';
import { Button as SquidsetButton } from '@/components/ui/squidset/Button';
import { ButtonProps as DefaultButtonProps } from '@/components/ui/button';
import { ButtonProps as SquidsetButtonProps } from '@/components/ui/squidset/Button';

// Map default button variants to squidset variants
const variantMap: Record<string, SquidsetButtonProps['variant']> = {
  default: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'danger',
  outline: 'secondary',
  link: 'ghost',
};

export const ThemedButton = React.forwardRef<
  HTMLButtonElement,
  DefaultButtonProps
>(({ variant = 'default', size = 'default', ...props }, ref) => {
  const { themeMode } = useSquidsetTheme();

  if (themeMode === 'squidset') {
    const squidsetVariant = variantMap[variant] || 'primary';
    const squidsetSize = size === 'default' ? 'md' : size === 'sm' ? 'sm' : 'lg';
    
    return (
      <SquidsetButton
        ref={ref}
        variant={squidsetVariant}
        size={squidsetSize}
        {...props}
      />
    );
  }

  return <DefaultButton ref={ref} variant={variant} size={size} {...props} />;
});

ThemedButton.displayName = 'ThemedButton';
