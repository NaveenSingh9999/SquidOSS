import { useMemo } from 'react';

// ── Age tiers ──────────────────────────────────────────────
//
//  fresh   < 24h     → 1.0  opacity, full saturation
//  recent  < 7d      → 1.0  opacity, full saturation
//  normal  7–30d     → 0.88 opacity, 95% saturation
//  aging   30–90d    → 0.72 opacity, 85% saturation
//  stale   > 90d     → 0.55 opacity, 70% saturation
//
// Opacity transitions via CSS so the change is never jarring.
// ──────────────────────────────────────────────────────────

export type AgeTier = 'fresh' | 'recent' | 'normal' | 'aging' | 'stale';

export interface RecencyFadeValues {
  opacity:    number;
  saturate:   number;   // CSS filter saturate() value (0–1)
  tier:       AgeTier;
  ageMs:      number;
  isFresh:    boolean;  // < 24h — show "new" indicator
  label:      string;   // human-readable age for tooltip
}

function msToLabel(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function getRecencyFade(
  dateStr: string | null | undefined
): RecencyFadeValues {
  if (!dateStr) {
    return { opacity: 1, saturate: 1, tier: 'normal', ageMs: 0, isFresh: false, label: '' };
  }

  const ageMs = Date.now() - new Date(dateStr).getTime();
  const ageD  = ageMs / 86_400_000; // days

  let opacity: number;
  let saturate: number;
  let tier: AgeTier;

  if (ageD < 1) {
    opacity = 1;   saturate = 1;    tier = 'fresh';
  } else if (ageD < 7) {
    opacity = 1;   saturate = 1;    tier = 'recent';
  } else if (ageD < 30) {
    opacity = 0.88; saturate = 0.95; tier = 'normal';
  } else if (ageD < 90) {
    opacity = 0.72; saturate = 0.85; tier = 'aging';
  } else {
    opacity = 0.55; saturate = 0.70; tier = 'stale';
  }

  return {
    opacity,
    saturate,
    tier,
    ageMs,
    isFresh: ageD < 1,
    label: msToLabel(ageMs),
  };
}

// ── Hook form ─────────────────────────────────────────────

export function useRecencyFade(
  dateStr: string | null | undefined
): RecencyFadeValues {
  return useMemo(() => getRecencyFade(dateStr), [dateStr]);
}

// ── Disabled / bypass form (for selected files, etc.) ────

export const RECENCY_FADE_NONE: RecencyFadeValues = {
  opacity: 1, saturate: 1, tier: 'recent', ageMs: 0, isFresh: false, label: '',
};
