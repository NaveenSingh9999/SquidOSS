/**
 * Session Key Manager
 * Handles secure in-memory key storage with automatic cleanup
 * Keys are NEVER persisted to disk or storage
 */

import { secureClear } from './byok-encryption';

interface SessionKey {
  key: CryptoKey;
  keyHash: string;
  salt: Uint8Array;
  createdAt: number;
  lastAccessedAt: number;
  fileId?: string; // For per-file keys
}

interface RateLimitEntry {
  attempts: number;
  lastAttempt: number;
  lockedUntil?: number;
}

// Session configuration
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes idle timeout
const IDLE_CHECK_INTERVAL = 60 * 1000; // Check every minute
const MAX_KEY_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minute lockout
const LOCKOUT_MULTIPLIER = 2; // Double lockout each time
type TimerId = ReturnType<typeof setInterval>;

class SessionKeyManager {
  private accountKey: SessionKey | null = null;
  private fileKeys: Map<string, SessionKey> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: TimerId | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.startCleanupTimer();
    this.setupEventListeners();
  }

  /**
   * Store account-level encryption key in session
   */
  setAccountKey(key: CryptoKey, keyHash: string, salt: Uint8Array): void {
    // Clear existing key first
    this.clearAccountKey();
    
    this.accountKey = {
      key,
      keyHash,
      salt,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    
    this.notifyListeners();
    console.log('[SessionKeyManager] Account key stored in session');
  }

  /**
   * Get account-level encryption key
   */
  getAccountKey(): SessionKey | null {
    if (this.accountKey) {
      this.accountKey.lastAccessedAt = Date.now();
    }
    return this.accountKey;
  }

  /**
   * Check if account key is available
   */
  hasAccountKey(): boolean {
    return this.accountKey !== null;
  }

  /**
   * Store per-file encryption key
   */
  setFileKey(fileId: string, key: CryptoKey, keyHash: string, salt: Uint8Array): void {
    // Clear existing key for this file first
    this.clearFileKey(fileId);
    
    this.fileKeys.set(fileId, {
      key,
      keyHash,
      salt,
      fileId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
    
    this.notifyListeners();
    console.log(`[SessionKeyManager] File key stored for ${fileId.substring(0, 8)}...`);
  }

  /**
   * Get per-file encryption key
   */
  getFileKey(fileId: string): SessionKey | null {
    const fileKey = this.fileKeys.get(fileId);
    if (fileKey) {
      fileKey.lastAccessedAt = Date.now();
    }
    return fileKey || null;
  }

  /**
   * Check if file key is available
   */
  hasFileKey(fileId: string): boolean {
    return this.fileKeys.has(fileId);
  }

  /**
   * Clear account key from session
   */
  clearAccountKey(): void {
    if (this.accountKey) {
      secureClear(this.accountKey.salt);
      this.accountKey = null;
      this.notifyListeners();
      console.log('[SessionKeyManager] Account key cleared from session');
    }
  }

  /**
   * Clear specific file key from session
   */
  clearFileKey(fileId: string): void {
    const fileKey = this.fileKeys.get(fileId);
    if (fileKey) {
      secureClear(fileKey.salt);
      this.fileKeys.delete(fileId);
      this.notifyListeners();
    }
  }

  /**
   * Clear all keys from session
   */
  clearAll(): void {
    this.clearAccountKey();
    
    this.fileKeys.forEach((fileKey) => {
      secureClear(fileKey.salt);
    });
    this.fileKeys.clear();
    
    this.rateLimits.clear();
    this.notifyListeners();
    
    console.log('[SessionKeyManager] All keys cleared from session');
  }

  /**
   * Check rate limit for key verification attempts
   */
  checkRateLimit(identifier: string = 'account'): {
    allowed: boolean;
    remainingAttempts: number;
    lockedUntil?: number;
  } {
    const entry = this.rateLimits.get(identifier);
    const now = Date.now();
    
    if (!entry) {
      return { allowed: true, remainingAttempts: MAX_KEY_ATTEMPTS };
    }
    
    // Check if locked
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: entry.lockedUntil,
      };
    }
    
    // Reset if lockout expired
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      entry.attempts = 0;
      entry.lockedUntil = undefined;
    }
    
    return {
      allowed: entry.attempts < MAX_KEY_ATTEMPTS,
      remainingAttempts: Math.max(0, MAX_KEY_ATTEMPTS - entry.attempts),
    };
  }

  /**
   * Record a failed key verification attempt
   */
  recordFailedAttempt(identifier: string = 'account'): void {
    const entry = this.rateLimits.get(identifier) || {
      attempts: 0,
      lastAttempt: 0,
    };
    
    entry.attempts++;
    entry.lastAttempt = Date.now();
    
    if (entry.attempts >= MAX_KEY_ATTEMPTS) {
      // Calculate lockout with exponential backoff
      const multiplier = Math.pow(LOCKOUT_MULTIPLIER, Math.floor(entry.attempts / MAX_KEY_ATTEMPTS) - 1);
      entry.lockedUntil = Date.now() + (LOCKOUT_DURATION_MS * multiplier);
    }
    
    this.rateLimits.set(identifier, entry);
  }

  /**
   * Reset rate limit after successful verification
   */
  resetRateLimit(identifier: string = 'account'): void {
    this.rateLimits.delete(identifier);
  }

  /**
   * Subscribe to key state changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get session status
   */
  getSessionStatus(): {
    hasAccountKey: boolean;
    fileKeyCount: number;
    accountKeyAge?: number;
  } {
    return {
      hasAccountKey: this.accountKey !== null,
      fileKeyCount: this.fileKeys.size,
      accountKeyAge: this.accountKey 
        ? Date.now() - this.accountKey.createdAt 
        : undefined,
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredKeys();
    }, IDLE_CHECK_INTERVAL);
  }

  private cleanupExpiredKeys(): void {
    const now = Date.now();
    
    // Check account key timeout
    if (this.accountKey && (now - this.accountKey.lastAccessedAt) > SESSION_TIMEOUT_MS) {
      console.log('[SessionKeyManager] Account key expired due to idle timeout');
      this.clearAccountKey();
    }
    
    // Check file key timeouts
    this.fileKeys.forEach((fileKey, fileId) => {
      if ((now - fileKey.lastAccessedAt) > SESSION_TIMEOUT_MS) {
        console.log(`[SessionKeyManager] File key expired for ${fileId.substring(0, 8)}...`);
        this.clearFileKey(fileId);
      }
    });
  }

  private setupEventListeners(): void {
    // Clear keys on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.clearAll();
      });
      
      // Clear on visibility change (user switches tabs for too long)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // Start a timeout to clear keys if page stays hidden
          setTimeout(() => {
            if (document.hidden) {
              this.clearAll();
            }
          }, SESSION_TIMEOUT_MS);
        }
      });
    }
  }

  /**
   * Destroy the manager and cleanup
   */
  destroy(): void {
    this.clearAll();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const sessionKeyManager = new SessionKeyManager();

// Export types
export type { SessionKey };
