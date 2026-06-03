import { isNativePlatform } from '@/utils/mobile';

const DEFAULT_PUBLIC_APP_ORIGIN = (
  import.meta.env.VITE_PUBLIC_APP_URL || 'https://squidcloud.vercel.app'
).replace(/\/+$/, '');

const NATIVE_APP_SCHEME = 'live.squidcloud.app://';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2']);

const isLocalHost = (hostname: string): boolean => {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.local');
};

export const getPublicAppOrigin = (): string => {
  if (typeof window === 'undefined') {
    return DEFAULT_PUBLIC_APP_ORIGIN;
  }

  if (isNativePlatform()) {
    return DEFAULT_PUBLIC_APP_ORIGIN;
  }

  if (isLocalHost(window.location.hostname)) {
    return DEFAULT_PUBLIC_APP_ORIGIN;
  }

  return window.location.origin.replace(/\/+$/, '');
};

export const buildPublicUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getPublicAppOrigin()}/`).toString();
};

export const getOAuthRedirectUrl = (): string => {
  // Always use HTTPS redirect URL for OAuth, even on mobile
  // This ensures OAuth state validation works correctly
  // The HTTPS URL will be caught by Android App Links / iOS Universal Links
  // and opened in the native app instead of the browser
  return buildPublicUrl('/oauth/callback');
};

export const getPasswordRecoveryRedirectUrl = (): string => {
  if (isNativePlatform()) {
    return `${NATIVE_APP_SCHEME}auth?type=recovery`;
  }

  return buildPublicUrl('/auth?type=recovery');
};

export const resolveRouteFromDeepLink = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol === 'live.squidcloud.app:') {
      const routePrefix = parsed.hostname ? `/${parsed.hostname}` : '';
      const routePath = `${routePrefix}${parsed.pathname}`.replace(/\/+/g, '/');
      const route = routePath === '/' ? '/dashboard' : routePath;
      return `${route}${parsed.search}${parsed.hash}`;
    }

    if (parsed.protocol === 'https:' && parsed.hostname === 'squidcloud.vercel.app') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return null;
  } catch (_error) {
    return null;
  }
};
