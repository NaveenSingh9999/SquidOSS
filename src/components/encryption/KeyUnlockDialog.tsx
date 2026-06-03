/**
 * Key Unlock Dialog
 * Prompts user to enter encryption key when needed
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Unlock, Eye, EyeOff, Loader2, AlertTriangle } from '@/lib/icon-map';
import { useBYOK } from '@/hooks/use-byok';
import { sessionKeyManager } from '@/services/session-key-manager';

interface KeyUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  fileId?: string; // For per-file key prompts
}

export function KeyUnlockDialog({
  open,
  onOpenChange,
  onSuccess,
  onCancel,
  title = 'Unlock Encryption Key',
  description = 'Enter your encryption key to access this file.',
  fileId,
}: KeyUnlockDialogProps) {
  const { unlockAccountKey, isVerifying } = useBYOK();
  
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsInfo, setAttemptsInfo] = useState<{
    remaining: number;
    lockedUntil?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
      updateAttemptsInfo();
    }
  }, [open]);

  const updateAttemptsInfo = () => {
    const rateLimit = sessionKeyManager.checkRateLimit(fileId || 'account');
    if (!rateLimit.allowed) {
      setAttemptsInfo({
        remaining: 0,
        lockedUntil: rateLimit.lockedUntil,
      });
    } else if (rateLimit.remainingAttempts < 5) {
      setAttemptsInfo({
        remaining: rateLimit.remainingAttempts,
      });
    } else {
      setAttemptsInfo(null);
    }
  };

  const handleUnlock = async () => {
    if (!password) return;
    
    setError(null);
    const success = await unlockAccountKey(password);
    
    if (success) {
      onSuccess?.();
      onOpenChange(false);
    } else {
      updateAttemptsInfo();
      setError('Invalid encryption key');
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const isLocked = attemptsInfo?.lockedUntil && attemptsInfo.lockedUntil > Date.now();
  const lockTimeRemaining = isLocked
    ? Math.ceil((attemptsInfo!.lockedUntil! - Date.now()) / 1000 / 60)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-400" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLocked ? (
            <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-white">
                    Too many failed attempts
                  </p>
                  <p className="text-xs text-white/60">
                    Please wait {lockTimeRemaining} minute{lockTimeRemaining !== 1 ? 's' : ''} before trying again.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-white/70">Encryption Key</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your encryption key"
                    className="bg-black/20 border-white/10 text-white pr-10"
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    autoFocus
                    disabled={isVerifying}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-white/50 hover:text-white"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              {attemptsInfo && attemptsInfo.remaining < 5 && (
                <p className="text-xs text-amber-400">
                  {attemptsInfo.remaining} attempt{attemptsInfo.remaining !== 1 ? 's' : ''} remaining
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
            onClick={handleUnlock}
            disabled={isVerifying || !password || isLocked}
          >
            {isVerifying ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Unlock className="h-4 w-4 mr-2" />
            )}
            Unlock
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
