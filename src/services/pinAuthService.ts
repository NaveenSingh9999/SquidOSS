/**
 * PIN Authentication Service
 * Handles PIN verification, timeout management, and security features
 */

import { supabase } from '@/integrations/supabase/client';
import logger from '@/lib/secureLogger';

export type SecurityOperation = 
  | 'open_vault'
  | 'create_share'
  | 'revoke_share'
  | 'view_security_settings'
  | 'app_startup'
  | 'delete_files'
  | 'export_data';

export interface PINSettings {
  pinEnabled: boolean;
  requirePinOnStartup: boolean;
  requirePinForShares: boolean;
  requirePinForSettings: boolean;
  requirePinForVault: boolean;
  pinTimeout: number; // minutes
  lastPinAuth: string | null;
  pinLockedUntil: string | null;
  pinAttempts: number;
  biometricEnabled: boolean;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  lockedUntil?: number;
  attemptsRemaining?: number;
}

class PINAuthService {
  private readonly MAX_ATTEMPTS = 3;
  private readonly LOCK_DURATION = 5; // minutes

  // Cache to prevent duplicate queries
  private settingsCache: Map<string, { settings: PINSettings | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 5 seconds cache

  /**
   * Get user's PIN settings (with caching)
   * This replaces both hasPIN and getSettings to avoid duplicate queries
   */
  async getSettings(userId: string): Promise<PINSettings | null> {
    try {
      // Check cache first
      const cached = this.settingsCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.settings;
      }

      const { data, error } = await supabase
        .from('user_security_settings' as any)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        this.settingsCache.set(userId, { settings: null, timestamp: Date.now() });
        return null;
      }

      const settings = data as any;
      const pinSettings: PINSettings = {
        pinEnabled: settings.pin_enabled,
        requirePinOnStartup: settings.require_pin_on_startup,
        requirePinForShares: settings.require_pin_for_shares,
        requirePinForSettings: settings.require_pin_for_settings,
        requirePinForVault: settings.require_pin_for_vault,
        pinTimeout: settings.pin_timeout,
        lastPinAuth: settings.last_pin_auth,
        pinLockedUntil: settings.pin_locked_until,
        pinAttempts: settings.pin_attempts,
        biometricEnabled: settings.biometric_enabled,
      };

      // Cache the result
      this.settingsCache.set(userId, { settings: pinSettings, timestamp: Date.now() });
      return pinSettings;
    } catch (error) {
      logger.errorWithContext('getSettings', error);
      return null;
    }
  }

  /**
   * Check if user has PIN enabled
   * Uses getSettings internally to avoid duplicate queries
   */
  async hasPIN(userId: string): Promise<boolean> {
    try {
      const settings = await this.getSettings(userId);
      return settings?.pinEnabled ?? false;
    } catch (error) {
      logger.errorWithContext('hasPIN', error);
      return false;
    }
  }

  /**
   * Clear cache for a user (call after updates)
   */
  private clearCache(userId: string): void {
    this.settingsCache.delete(userId);
  }

  /**
   * Check if PIN is required for an operation
   */
  async requiresPIN(userId: string, operation: SecurityOperation): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('requires_pin_auth' as any, {
          user_id_param: userId,
          operation_type: operation
        });

      if (error) {
        logger.errorWithContext('requiresPIN', error);
        return true; // Fail secure - require PIN if error
      }

      return data as boolean;
    } catch (error) {
      logger.errorWithContext('requiresPIN', error);
      return true;
    }
  }

  /**
   * Create PIN for user
   */
  async createPIN(userId: string, pin: string, options?: Partial<PINSettings>): Promise<boolean> {
    try {
      const pinHash = await this.hashPIN(pin);

      // Use upsert to handle both new and existing records
      const { error } = await supabase
        .from('user_security_settings' as any)
        .upsert({
          user_id: userId,
          pin_hash: pinHash,
          pin_enabled: true,
          require_pin_on_startup: options?.requirePinOnStartup ?? false,
          require_pin_for_shares: options?.requirePinForShares ?? true,
          require_pin_for_settings: options?.requirePinForSettings ?? true,
          require_pin_for_vault: options?.requirePinForVault ?? true,
          pin_timeout: options?.pinTimeout ?? 5,
          biometric_enabled: options?.biometricEnabled ?? false,
          pin_attempts: 0,
          pin_locked_until: null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        logger.errorWithContext('createPIN', error);
        return false;
      }

      // Clear cache after update
      this.clearCache(userId);
      return true;
    } catch (error) {
      logger.errorWithContext('createPIN', error);
      return false;
    }
  }

  /**
   * Verify PIN
   */
  async verifyPIN(userId: string, pin: string): Promise<AuthResult> {
    try {
      const { data: settings, error: fetchError } = await supabase
        .from('user_security_settings' as any)
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError || !settings) {
        return { success: false, error: 'PIN not configured' };
      }

      const settingsData = settings as any;

      // Check if locked
      if (settingsData.pin_locked_until) {
        const lockTime = new Date(settingsData.pin_locked_until).getTime();
        if (Date.now() < lockTime) {
          return {
            success: false,
            error: `Locked for ${Math.ceil((lockTime - Date.now()) / 60000)} minutes`,
            lockedUntil: lockTime
          };
        }
      }

      // Verify PIN
      const pinHash = await this.hashPIN(pin);
      const isValid = pinHash === settingsData.pin_hash;

      if (isValid) {
        // Reset attempts and update last auth
        await supabase.rpc('reset_pin_attempts' as any, { user_id_param: userId });
        
        // Log success
        await this.logAttempt(userId, 'success');

        return { success: true };
      } else {
        // Increment attempts
        const { data: newAttempts } = await supabase.rpc('increment_pin_attempts' as any, { 
          user_id_param: userId 
        });

        const attempts = newAttempts as number;

        // Log failure
        await this.logAttempt(userId, 'failed', { attempts });

        // Lock if too many attempts
        if (attempts >= this.MAX_ATTEMPTS) {
          await supabase.rpc('lock_pin' as any, { 
            user_id_param: userId,
            lock_duration_minutes: this.LOCK_DURATION
          });
          
          await this.logAttempt(userId, 'locked');

          const lockUntil = Date.now() + (this.LOCK_DURATION * 60 * 1000);
          return {
            success: false,
            error: `Too many attempts. Locked for ${this.LOCK_DURATION} minutes.`,
            lockedUntil: lockUntil
          };
        }

        return {
          success: false,
          error: `Incorrect PIN`,
          attemptsRemaining: this.MAX_ATTEMPTS - attempts
        };
      }
    } catch (error) {
      logger.errorWithContext('verifyPIN', error);
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Mark a successful startup authentication timestamp
   */
  async markAppStartupAuth(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('mark_app_startup_auth' as any, {
        user_id_param: userId,
      });

      if (error) {
        logger.errorWithContext('markAppStartupAuth', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.errorWithContext('markAppStartupAuth', error);
      return false;
    }
  }

  /**
   * Update PIN
   */
  async updatePIN(userId: string, oldPin: string, newPin: string): Promise<boolean> {
    try {
      // Verify old PIN first
      const verification = await this.verifyPIN(userId, oldPin);
      if (!verification.success) {
        return false;
      }

      // Hash new PIN
      const newPinHash = await this.hashPIN(newPin);

      // Update PIN
      const { error } = await supabase
        .from('user_security_settings' as any)
        .update({ 
          pin_hash: newPinHash,
          pin_attempts: 0,
          pin_locked_until: null
        })
        .eq('user_id', userId);

      if (error) {
        logger.errorWithContext('updatePIN', error);
        return false;
      }

      // Clear cache after update
      this.clearCache(userId);
      return true;
    } catch (error) {
      logger.errorWithContext('updatePIN', error);
      return false;
    }
  }

  /**
   * Update PIN settings
   */
  async updateSettings(userId: string, settings: Partial<PINSettings>): Promise<boolean> {
    try {
      const updates: any = {};

      if (settings.requirePinOnStartup !== undefined) {
        updates.require_pin_on_startup = settings.requirePinOnStartup;
      }
      if (settings.requirePinForShares !== undefined) {
        updates.require_pin_for_shares = settings.requirePinForShares;
      }
      if (settings.requirePinForSettings !== undefined) {
        updates.require_pin_for_settings = settings.requirePinForSettings;
      }
      if (settings.requirePinForVault !== undefined) {
        updates.require_pin_for_vault = settings.requirePinForVault;
      }
      if (settings.pinTimeout !== undefined) {
        updates.pin_timeout = settings.pinTimeout;
      }
      if (settings.biometricEnabled !== undefined) {
        updates.biometric_enabled = settings.biometricEnabled;
      }

      const { error } = await supabase
        .from('user_security_settings' as any)
        .update(updates)
        .eq('user_id', userId);

      if (error) {
        logger.errorWithContext('updateSettings', error);
        return false;
      }

      // Clear cache after update
      this.clearCache(userId);
      return true;
    } catch (error) {
      logger.errorWithContext('updateSettings', error);
      return false;
    }
  }

  /**
   * Disable PIN
   */
  async disablePIN(userId: string, pin: string): Promise<boolean> {
    try {
      // Verify PIN first
      const verification = await this.verifyPIN(userId, pin);
      if (!verification.success) {
        return false;
      }

      const { error } = await supabase
        .from('user_security_settings' as any)
        .update({ pin_enabled: false })
        .eq('user_id', userId);

      if (error) {
        logger.errorWithContext('disablePIN', error);
        return false;
      }

      // Clear cache after update
      this.clearCache(userId);
      return true;
    } catch (error) {
      logger.errorWithContext('disablePIN', error);
      return false;
    }
  }

  /**
   * Hash PIN using SHA-256
   */
  private async hashPIN(pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Log PIN attempt
   */
  private async logAttempt(
    userId: string, 
    attemptType: 'success' | 'failed' | 'locked',
    metadata?: any
  ): Promise<void> {
    try {
      await supabase
        .from('pin_attempt_logs' as any)
        .insert({
          user_id: userId,
          attempt_type: attemptType,
          ip_address: 'unknown',
          user_agent: navigator.userAgent,
          metadata: metadata || {}
        });
    } catch (error) {
      // Silent fail - don't block auth flow
    }
  }
}

// Export singleton instance
export const pinAuthService = new PINAuthService();
export default pinAuthService;
