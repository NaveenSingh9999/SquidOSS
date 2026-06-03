/**
 * Secure Logger Utility
 * 
 * Prevents sensitive data from being logged to console.
 * Use this instead of console.log/error/warn when dealing with
 * authentication, user data, or API responses.
 */

interface LogData {
  [key: string]: any;
}

const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'credential',
  'passkey_credential_id',
  'authorization',
  'auth',
  'session',
  'cookie',
  'private_key',
  'encryption_key',
  'salt',
  'hash'
];

/**
 * Recursively sanitize an object by removing sensitive fields
 */
function sanitizeObject(obj: any, depth: number = 0): any {
  if (depth > 10) return '[Max Depth Reached]';
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  const sanitized: any = {};
  
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(sensitiveKey => 
      lowerKey.includes(sensitiveKey)
    );
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeObject(obj[key], depth + 1);
    }
  }
  
  return sanitized;
}

/**
 * Secure console.log that sanitizes sensitive data
 */
export function secureLog(...args: any[]): void {
  if (process.env.NODE_ENV === 'production') {
    // In production, don't log anything
    return;
  }
  
  const sanitized = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return sanitizeObject(arg);
    }
    return arg;
  });
  
  console.log(...sanitized);
}

/**
 * Secure console.error that sanitizes sensitive data
 */
export function secureError(message: string, error?: any): void {
  if (process.env.NODE_ENV === 'production') {
    // In production, only log the message, not the error details
    console.error(message);
    return;
  }
  
  console.error(message, error ? sanitizeObject(error) : '');
}

/**
 * Secure console.warn that sanitizes sensitive data
 */
export function secureWarn(...args: any[]): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  
  const sanitized = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return sanitizeObject(arg);
    }
    return arg;
  });
  
  console.warn(...sanitized);
}

/**
 * Log API response safely (removes sensitive headers and data)
 */
export function logAPIResponse(endpoint: string, response: any): void {
  if (process.env.NODE_ENV === 'production') return;
  
  const sanitizedResponse = sanitizeObject(response);
  console.log(`API Response [${endpoint}]:`, sanitizedResponse);
}

/**
 * Log error with context but without sensitive data
 */
export function logErrorWithContext(context: string, error: any, additionalData?: LogData): void {
  const sanitizedData = additionalData ? sanitizeObject(additionalData) : {};
  
  if (process.env.NODE_ENV === 'production') {
    // In production, minimal logging
    console.error(`Error in ${context}`);
  } else {
    console.error(`Error in ${context}:`, {
      message: error?.message || 'Unknown error',
      ...sanitizedData
    });
  }
}

/**
 * Development-only debug log
 */
export function debugLog(...args: any[]): void {
  if (process.env.NODE_ENV === 'development') {
    const sanitized = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return sanitizeObject(arg);
      }
      return arg;
    });
    console.log('[DEBUG]', ...sanitized);
  }
}

// Export a secure logger object for easy replacement
export const logger = {
  log: secureLog,
  error: secureError,
  warn: secureWarn,
  debug: debugLog,
  api: logAPIResponse,
  errorWithContext: logErrorWithContext
};

export default logger;
