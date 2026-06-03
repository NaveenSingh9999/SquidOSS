/**
 * RecencyFadeWrapper
 *
 * Wraps any file card and applies:
 *   - CSS opacity fade based on file age
 *   - CSS saturate() filter for additional visual dimming
 *   - A "new" green dot for files uploaded < 24h ago
 *   - Title tooltip showing human-readable age on hover
 *
 * All transitions use CSS so React doesn't re-render on scroll.
 * The wrapper adds ZERO layout — it's purely a `<div>` with
 * `position: relative` so the fresh dot can be positioned.
 *
 * Usage:
 *   <RecencyFadeWrapper file={file} disabled={selectionMode}>
 *     <FileItem ... />
 *   </RecencyFadeWrapper>
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useRecencyFade } from '@/hooks/useRecencyFade';
import type { FileItem as FileItemType } from '@/lib/api';

interface RecencyFadeWrapperProps {
  file: FileItemType;
  children: React.ReactNode;
  /** Set true when file is selected or in selection mode — keeps full opacity */
  disabled?: boolean;
  className?: string;
}

// CSS transition spec — slow enough to be graceful, not distracting
const TRANSITION = 'opacity 400ms ease, filter 400ms ease';

export const RecencyFadeWrapper: React.FC<RecencyFadeWrapperProps> = ({
  file,
  children,
  disabled = false,
  className,
}) => {
  const fade = useRecencyFade(file.created_at);

  // When disabled (selection mode, hover preview, etc.) — full opacity
  const opacity  = disabled ? 1    : fade.opacity;
  const saturate = disabled ? 1    : fade.saturate;

  const style: React.CSSProperties = {
    position:   'relative',
    opacity,
    filter:     `saturate(${saturate})`,
    transition: TRANSITION,
  };

  return (
    <div
      style={style}
      className={cn('contents-wrapper', className)}
      // Native tooltip with age — no extra component needed
      title={fade.label ? `Uploaded ${fade.label}` : undefined}
    >
      {children}

      {/* ── Fresh dot — only for files < 24h old ── */}
      {fade.isFresh && !disabled && (
        <FreshDot />
      )}
    </div>
  );
};

// ── Fresh dot ──────────────────────────────────────────────

const FreshDot: React.FC = () => (
  <span
    aria-label="New upload"
    style={{
      position:        'absolute',
      top:             6,
      right:           6,
      width:           6,
      height:          6,
      borderRadius:    '50%',
      background:      '#22c55e',
      boxShadow:       '0 0 0 2px hsl(var(--card))',
      pointerEvents:   'none',
      zIndex:          10,
      // Subtle pulse via animation class defined in squircle.css / index.css
      animation:       'freshPulse 2.4s ease-in-out infinite',
    }}
  />
);

export default RecencyFadeWrapper;
