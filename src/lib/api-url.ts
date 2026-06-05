export function getApiUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3000'

  const envUrl = import.meta.env.VITE_SQUIDOSS_API_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')

  const host = window.location.hostname
  const origin = window.location.origin

  if (host.includes('app.github.dev')) {
    return origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.').replace(/\/+$/, '')
  }
  if (host.includes('gitpod.io') || host.includes('gitpod.cloud')) {
    return origin.replace(':8080', ':3000').replace(/\/+$/, '')
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    const port = parseInt(window.location.port) || 5173
    return `http://localhost:${port === 8080 || port === 5173 ? 3000 : port}`
  }

  return 'http://localhost:3000'
}

export const API_URL = getApiUrl()
