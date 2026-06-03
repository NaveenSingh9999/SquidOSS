/**
 * SquidCloud UI Components - Matching exact SquidCloud design system
 * Colors, spacing, typography, and interactions identical to main app
 */

import React from 'react';

// SquidCloud Color Palette
export const SquidCloudColors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6', // Primary Blue
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

// SquidCloud Typography
export const SquidCloudTypography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

// SquidCloud Spacing (matches Tailwind scale)
export const SquidCloudSpacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
};

// SquidCloud Border Radius
export const SquidCloudRadius = {
  sm: '0.375rem',  // 6px
  md: '0.5rem',    // 8px
  lg: '0.75rem',   // 12px
  xl: '1rem',      // 16px
  full: '9999px',
};

// SquidCloud Shadows
export const SquidCloudShadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

// Button Component (exact match to SquidCloud)
export interface SQButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const SQButton: React.FC<SQButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  icon,
  fullWidth = false
}) => {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: SquidCloudTypography.fontFamily,
    fontWeight: SquidCloudTypography.fontWeight.medium,
    borderRadius: SquidCloudRadius.md,
    transition: 'all 0.2s ease',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.5 : 1,
    border: 'none',
    outline: 'none',
    width: fullWidth ? '100%' : 'auto',
  };

  const variantStyles = {
    primary: {
      backgroundColor: SquidCloudColors.primary[600],
      color: '#ffffff',
      boxShadow: SquidCloudShadows.sm,
    },
    secondary: {
      backgroundColor: SquidCloudColors.gray[200],
      color: SquidCloudColors.gray[800],
    },
    danger: {
      backgroundColor: SquidCloudColors.error,
      color: '#ffffff',
    },
    success: {
      backgroundColor: SquidCloudColors.success,
      color: '#ffffff',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: SquidCloudColors.gray[700],
    },
    outline: {
      backgroundColor: 'transparent',
      color: SquidCloudColors.primary[600],
      border: `2px solid ${SquidCloudColors.primary[600]}`,
    },
  };

  const sizeStyles = {
    sm: {
      padding: `${SquidCloudSpacing[2]} ${SquidCloudSpacing[3]}`,
      fontSize: SquidCloudTypography.fontSize.sm,
    },
    md: {
      padding: `${SquidCloudSpacing[3]} ${SquidCloudSpacing[4]}`,
      fontSize: SquidCloudTypography.fontSize.base,
    },
    lg: {
      padding: `${SquidCloudSpacing[4]} ${SquidCloudSpacing[6]}`,
      fontSize: SquidCloudTypography.fontSize.lg,
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{ ...baseStyles, ...variantStyles[variant], ...sizeStyles[size] }}
    >
      {loading && (
        <svg
          style={{ marginRight: SquidCloudSpacing[2], animation: 'spin 1s linear infinite' }}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
          <path
            fill="currentColor"
            opacity="0.75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {icon && <span style={{ marginRight: SquidCloudSpacing[2] }}>{icon}</span>}
      {children}
    </button>
  );
};

// Input Component (exact match)
export interface SQInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'url' | 'search';
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  className?: string;
  icon?: React.ReactNode;
  maxLength?: number;
  fullWidth?: boolean;
}

export const SQInput: React.FC<SQInputProps> = ({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  error,
  label,
  required = false,
  className = '',
  icon,
  maxLength,
  fullWidth = true
}) => {
  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }} className={className}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: SquidCloudTypography.fontSize.sm,
            fontWeight: SquidCloudTypography.fontWeight.medium,
            color: SquidCloudColors.gray[700],
            marginBottom: SquidCloudSpacing[1],
            fontFamily: SquidCloudTypography.fontFamily,
          }}
        >
          {label}
          {required && <span style={{ color: SquidCloudColors.error, marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              paddingLeft: SquidCloudSpacing[3],
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: SquidCloudColors.gray[400],
            }}
          >
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          style={{
            display: 'block',
            width: '100%',
            borderRadius: SquidCloudRadius.md,
            border: `1px solid ${error ? SquidCloudColors.error : SquidCloudColors.gray[300]}`,
            paddingLeft: icon ? '2.5rem' : SquidCloudSpacing[4],
            paddingRight: SquidCloudSpacing[4],
            paddingTop: SquidCloudSpacing[2],
            paddingBottom: SquidCloudSpacing[2],
            fontSize: SquidCloudTypography.fontSize.base,
            fontFamily: SquidCloudTypography.fontFamily,
            outline: 'none',
            transition: 'all 0.2s ease',
            backgroundColor: disabled ? SquidCloudColors.gray[100] : '#ffffff',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
      </div>
      {error && (
        <p
          style={{
            marginTop: SquidCloudSpacing[1],
            fontSize: SquidCloudTypography.fontSize.sm,
            color: SquidCloudColors.error,
            fontFamily: SquidCloudTypography.fontFamily,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
};

// Card Component (exact match)
export interface SQCardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

export const SQCard: React.FC<SQCardProps> = ({
  children,
  title,
  subtitle,
  footer,
  className = '',
  hoverable = false,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: SquidCloudRadius.lg,
        border: `1px solid ${SquidCloudColors.gray[200]}`,
        boxShadow: SquidCloudShadows.sm,
        overflow: 'hidden',
        transition: hoverable ? 'box-shadow 0.2s ease' : 'none',
        cursor: hoverable ? 'pointer' : 'default',
      }}
    >
      {(title || subtitle) && (
        <div
          style={{
            padding: `${SquidCloudSpacing[4]} ${SquidCloudSpacing[6]}`,
            borderBottom: `1px solid ${SquidCloudColors.gray[200]}`,
          }}
        >
          {title && (
            <h3
              style={{
                fontSize: SquidCloudTypography.fontSize.lg,
                fontWeight: SquidCloudTypography.fontWeight.semibold,
                color: SquidCloudColors.gray[900],
                fontFamily: SquidCloudTypography.fontFamily,
                margin: 0,
              }}
            >
              {title}
            </h3>
          )}
          {subtitle && (
            <p
              style={{
                fontSize: SquidCloudTypography.fontSize.sm,
                color: SquidCloudColors.gray[600],
                fontFamily: SquidCloudTypography.fontFamily,
                marginTop: SquidCloudSpacing[1],
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div style={{ padding: `${SquidCloudSpacing[4]} ${SquidCloudSpacing[6]}` }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: `${SquidCloudSpacing[3]} ${SquidCloudSpacing[6]}`,
            backgroundColor: SquidCloudColors.gray[50],
            borderTop: `1px solid ${SquidCloudColors.gray[200]}`,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};

// Badge Component (exact match)
export interface SQBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'primary';
  size?: 'sm' | 'md';
  className?: string;
}

export const SQBadge: React.FC<SQBadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = ''
}) => {
  const variantStyles = {
    default: { backgroundColor: SquidCloudColors.gray[200], color: SquidCloudColors.gray[800] },
    success: { backgroundColor: '#d1fae5', color: '#065f46' },
    error: { backgroundColor: '#fee2e2', color: '#991b1b' },
    warning: { backgroundColor: '#fef3c7', color: '#92400e' },
    info: { backgroundColor: '#dbeafe', color: '#1e40af' },
    primary: { backgroundColor: SquidCloudColors.primary[100], color: SquidCloudColors.primary[800] },
  };

  const sizeStyles = {
    sm: {
      padding: `${SquidCloudSpacing[1]} ${SquidCloudSpacing[2]}`,
      fontSize: SquidCloudTypography.fontSize.xs,
    },
    md: {
      padding: `${SquidCloudSpacing[1]} ${SquidCloudSpacing[3]}`,
      fontSize: SquidCloudTypography.fontSize.sm,
    },
  };

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: SquidCloudRadius.full,
        fontWeight: SquidCloudTypography.fontWeight.medium,
        fontFamily: SquidCloudTypography.fontFamily,
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
    >
      {children}
    </span>
  );
};

// Add spin animation keyframes
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
