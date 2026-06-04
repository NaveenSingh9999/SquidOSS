const STORAGE_KEY = 'squidoss_features'

const DEFAULTS = {
  sharing: false,
  analytics: true,
  workspaces: false,
  versionHistory: true,
  encryption: false,
}

type Features = typeof DEFAULTS

function load(): Features {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

export function useFeatureFlags(): Features {
  return load()
}

export function isFeatureEnabled(key: keyof Features): boolean {
  return load()[key]
}
