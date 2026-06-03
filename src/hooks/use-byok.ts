/**
 * BYOK Hook - React hook for encryption key management
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  deriveKeyWithArgon2id,
  verifyKeyHash,
  createKeyVerificationHash,
  base64ToArrayBuffer,
} from '@/services/byok-encryption';
import { sessionKeyManager, type SessionKey } from '@/services/session-key-manager';

export interface BYOKSettings {
  isEnabled: boolean;
  encryptionMode: 'account' | 'per-file' | 'hybrid';
  hasAccountKey: boolean;
  strictMode: boolean;
  allowDefaultFallback: boolean;
  promptEveryDecrypt: boolean;
  createdAt?: string;
  lastRotated?: string;
}

export function useBYOK() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<BYOKSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSessionKey, setHasSessionKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Subscribe to session key changes
  useEffect(() => {
    const unsubscribe = sessionKeyManager.subscribe(() => {
      setHasSessionKey(sessionKeyManager.hasAccountKey());
    });
    
    setHasSessionKey(sessionKeyManager.hasAccountKey());
    
    return unsubscribe;
  }, []);

  // Load BYOK settings from database
  const loadSettings = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_encryption_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const settingsData = data.settings as any;
        setSettings({
          isEnabled: settingsData?.byok_enabled ?? false,
          encryptionMode: settingsData?.encryption_mode ?? 'account',
          hasAccountKey: !!settingsData?.account_key_hash,
          strictMode: settingsData?.strict_mode ?? true,
          allowDefaultFallback: settingsData?.allow_default_fallback ?? true,
          promptEveryDecrypt: settingsData?.prompt_every_decrypt ?? true,
          createdAt: data.created_at,
          lastRotated: settingsData?.last_rotated,
        });
      } else {
        setSettings({
          isEnabled: false,
          encryptionMode: 'account',
          hasAccountKey: false,
          strictMode: true,
          allowDefaultFallback: true,
          promptEveryDecrypt: true,
        });
      }
    } catch (error) {
      console.error('Failed to load BYOK settings:', error);
      setSettings({
        isEnabled: false,
        encryptionMode: 'account',
        hasAccountKey: false,
        strictMode: true,
        allowDefaultFallback: true,
        promptEveryDecrypt: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const upsertSettingsPatch = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data: currentData } = await supabase
        .from('user_encryption_settings')
        .select('settings')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentSettings = (currentData?.settings as Record<string, unknown>) || {};

      const { error } = await supabase
        .from('user_encryption_settings')
        .upsert({
          user_id: user.id,
          settings: {
            ...currentSettings,
            ...patch,
          },
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      await loadSettings();
      return true;
    } catch (error) {
      console.error('Failed to update BYOK settings patch:', error);
      return false;
    }
  }, [user, loadSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  /**
   * Setup account-level encryption key
   */
  const setupAccountKey = async (password: string): Promise<boolean> => {
    if (!user) return false;
    
    setIsLoading(true);
    try {
      // Create verification hash (password is never stored)
      const { hash, salt } = await createKeyVerificationHash(password);

      // Derive the key and store in session
      const { key, keyHash, salt: saltBytes } = await deriveKeyWithArgon2id(
        password,
        base64ToArrayBuffer(salt)
      );

      // Store settings in database (only hash, never the key)
      const { error } = await supabase
        .from('user_encryption_settings')
        .upsert({
          user_id: user.id,
          settings: {
            byok_enabled: true,
            encryption_mode: 'account',
            account_key_hash: hash,
            account_key_salt: salt,
            strict_mode: true,
            allow_default_fallback: true,
            prompt_every_decrypt: true,
            created_at: new Date().toISOString(),
          },
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // Store key in session memory
      sessionKeyManager.setAccountKey(key, keyHash, saltBytes);

      toast({
        title: 'Encryption key set up',
        description: 'Your account encryption key has been configured.',
      });

      await loadSettings();
      return true;
    } catch (error: any) {
      console.error('Failed to setup account key:', error);
      toast({
        title: 'Setup failed',
        description: error.message || 'Failed to set up encryption key',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Verify and unlock account key
   */
  const unlockAccountKey = async (password: string): Promise<boolean> => {
    if (!user || !settings?.hasAccountKey) return false;

    // Check rate limit
    const rateLimit = sessionKeyManager.checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      const remainingTime = Math.ceil((rateLimit.lockedUntil! - Date.now()) / 1000 / 60);
      toast({
        title: 'Too many attempts',
        description: `Please wait ${remainingTime} minutes before trying again.`,
        variant: 'destructive',
      });
      return false;
    }

    setIsVerifying(true);
    try {
      // Get stored hash and salt
      const { data, error } = await supabase
        .from('user_encryption_settings')
        .select('settings')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      const settingsData = data.settings as any;
      const storedHash = settingsData?.account_key_hash;
      const storedSalt = settingsData?.account_key_salt;

      if (!storedHash || !storedSalt) {
        throw new Error('No encryption key configured');
      }

      const saltBytes = base64ToArrayBuffer(storedSalt);

      // Verify the key
      const isValid = await verifyKeyHash(password, saltBytes, storedHash);

      if (!isValid) {
        sessionKeyManager.recordFailedAttempt(user.id);
        const remaining = sessionKeyManager.checkRateLimit(user.id);
        
        toast({
          title: 'Invalid key',
          description: remaining.remainingAttempts > 0
            ? `${remaining.remainingAttempts} attempts remaining`
            : 'Account temporarily locked',
          variant: 'destructive',
        });
        return false;
      }

      // Derive and store the key in session
      const { key, keyHash } = await deriveKeyWithArgon2id(password, saltBytes);
      sessionKeyManager.setAccountKey(key, keyHash, saltBytes);
      sessionKeyManager.resetRateLimit(user.id);

      toast({
        title: 'Key unlocked',
        description: 'Your encryption key is now available.',
      });

      return true;
    } catch (error: any) {
      console.error('Failed to unlock account key:', error);
      toast({
        title: 'Unlock failed',
        description: error.message || 'Failed to verify encryption key',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * Lock account key (clear from session)
   */
  const lockAccountKey = () => {
    sessionKeyManager.clearAccountKey();
    toast({
      title: 'Key locked',
      description: 'Encryption key cleared from session.',
    });
  };

  /**
   * Change/rotate account key
   */
  const rotateAccountKey = async (
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> => {
    if (!user) return false;

    setIsLoading(true);
    try {
      // First verify current key
      const unlocked = await unlockAccountKey(currentPassword);
      if (!unlocked) return false;

      // Create new key hash
      const { hash, salt } = await createKeyVerificationHash(newPassword);

      // Update in database
      const { data: currentData } = await supabase
        .from('user_encryption_settings')
        .select('settings')
        .eq('user_id', user.id)
        .single();

      const currentSettings = (currentData?.settings as any) || {};

      const { error } = await supabase
        .from('user_encryption_settings')
        .upsert({
          user_id: user.id,
          settings: {
            ...currentSettings,
            account_key_hash: hash,
            account_key_salt: salt,
            last_rotated: new Date().toISOString(),
          },
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // Update session with new key
      const { key, keyHash, salt: saltBytes } = await deriveKeyWithArgon2id(
        newPassword,
        base64ToArrayBuffer(salt)
      );
      sessionKeyManager.setAccountKey(key, keyHash, saltBytes);

      toast({
        title: 'Key rotated',
        description: 'Your encryption key has been updated.',
      });

      await loadSettings();
      return true;
    } catch (error: any) {
      console.error('Failed to rotate key:', error);
      toast({
        title: 'Rotation failed',
        description: error.message || 'Failed to rotate encryption key',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update encryption mode
   */
  const setEncryptionMode = async (
    mode: 'account' | 'per-file' | 'hybrid'
  ): Promise<boolean> => {
    return upsertSettingsPatch({ encryption_mode: mode });
  };

  const updateSecurityPolicy = async (policy: {
    strictMode?: boolean;
    allowDefaultFallback?: boolean;
    promptEveryDecrypt?: boolean;
  }): Promise<boolean> => {
    return upsertSettingsPatch({
      ...(policy.strictMode !== undefined ? { strict_mode: policy.strictMode } : {}),
      ...(policy.allowDefaultFallback !== undefined ? { allow_default_fallback: policy.allowDefaultFallback } : {}),
      ...(policy.promptEveryDecrypt !== undefined ? { prompt_every_decrypt: policy.promptEveryDecrypt } : {}),
    });
  };

  /**
   * Disable BYOK
   */
  const disableBYOK = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      sessionKeyManager.clearAll();

      const { error } = await supabase
        .from('user_encryption_settings')
        .update({
          settings: {
            byok_enabled: false,
            encryption_mode: 'account',
            account_key_hash: null,
            account_key_salt: null,
            strict_mode: true,
            allow_default_fallback: true,
            prompt_every_decrypt: true,
          },
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'BYOK disabled',
        description: 'Custom encryption has been disabled.',
      });

      await loadSettings();
      return true;
    } catch (error) {
      console.error('Failed to disable BYOK:', error);
      return false;
    }
  };

  /**
   * Get current session key for encryption/decryption
   */
  const getSessionKey = (): SessionKey | null => {
    return sessionKeyManager.getAccountKey();
  };

  return {
    settings,
    isLoading,
    isVerifying,
    hasSessionKey,
    setupAccountKey,
    unlockAccountKey,
    lockAccountKey,
    rotateAccountKey,
    setEncryptionMode,
    updateSecurityPolicy,
    disableBYOK,
    getSessionKey,
    reload: loadSettings,
  };
}
