/**
 * Per-File Key Dialog
 * For setting unique encryption keys on individual files (Advanced Mode)
 */

import React, { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Key,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import {
  deriveKeyWithArgon2id,
  createKeyVerificationHash,
  generateRandomKey,
} from '@/services/byok-encryption';
import { sessionKeyManager } from '@/services/session-key-manager';

interface PerFileKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  onKeySet: (keyInfo: {
    key: CryptoKey;
    keyHash: string;
    salt: Uint8Array;
    isGenerated: boolean;
  }) => void;
}

export function PerFileKeyDialog({
  open,
  onOpenChange,
  fileId,
  fileName,
  onKeySet,
}: PerFileKeyDialogProps) {
  const [mode, setMode] = useState<'custom' | 'generate'>('custom');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [acknowledgeBackup, setAcknowledgeBackup] = useState(false);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setGeneratedKey(null);
    setKeyCopied(false);
    setAcknowledgeBackup(false);
    setMode('custom');
  };

  const handleGenerateKey = async () => {
    setIsProcessing(true);
    try {
      const { keyString } = await generateRandomKey();
      setGeneratedKey(keyString);
      setPassword(keyString);
      setConfirmPassword(keyString);
    } catch (error) {
      console.error('Failed to generate key:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handleSetKey = async () => {
    if (!password || (mode === 'custom' && password !== confirmPassword)) return;
    if (mode === 'generate' && !acknowledgeBackup) return;

    setIsProcessing(true);
    try {
      // Derive key using Argon2id
      const { key, keyHash, salt } = await deriveKeyWithArgon2id(password);

      // Store in session
      sessionKeyManager.setFileKey(fileId, key, keyHash, salt);

      onKeySet({
        key,
        keyHash,
        salt,
        isGenerated: mode === 'generate',
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to set file key:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const isValid = mode === 'custom'
    ? password.length >= 8 && password === confirmPassword
    : generatedKey && acknowledgeBackup;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Key className="h-5 w-5 text-purple-400" />
            Per-File Encryption
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Set a unique encryption key for <span className="text-white font-medium">{fileName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Selection */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className={cn(
                'flex-1 h-11',
                mode === 'custom'
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              )}
              onClick={() => setMode('custom')}
            >
              <Key className="h-4 w-4 mr-2" />
              Custom Key
            </Button>
            <Button
              variant="outline"
              className={cn(
                'flex-1 h-11',
                mode === 'generate'
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              )}
              onClick={() => setMode('generate')}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate Key
            </Button>
          </div>

          {mode === 'custom' ? (
            <>
              <div className="space-y-2">
                <Label className="text-white/70">Encryption Key</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter encryption key (min 8 characters)"
                    className="bg-black/20 border-white/10 text-white pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-white/50 hover:text-white"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">Confirm Key</Label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm encryption key"
                  className="bg-black/20 border-white/10 text-white"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-400">Keys do not match</p>
                )}
              </div>

              {password.length > 0 && password.length < 8 && (
                <p className="text-xs text-amber-400">
                  Key must be at least 8 characters
                </p>
              )}
            </>
          ) : (
            <>
              {!generatedKey ? (
                <Button
                  className="w-full h-12 bg-purple-600 hover:bg-purple-500"
                  onClick={handleGenerateKey}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Generate Secure Key
                </Button>
              ) : (
                <>
                  <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white/70 text-xs">Generated Key</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-purple-400 hover:text-purple-300"
                        onClick={handleCopyKey}
                      >
                        {keyCopied ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Copied
                          </>
                        ) : (
                          'Copy'
                        )}
                      </Button>
                    </div>
                    <code className="block text-xs text-white font-mono break-all bg-black/30 p-2 rounded">
                      {generatedKey}
                    </code>
                  </div>

                  <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white mb-1">
                          Save This Key Now
                        </p>
                        <p className="text-xs text-white/60">
                          This key will NOT be stored. If you lose it, this file 
                          will be permanently unrecoverable.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-black/20 rounded-xl">
                    <Checkbox
                      id="acknowledge"
                      checked={acknowledgeBackup}
                      onCheckedChange={(checked) => setAcknowledgeBackup(checked === true)}
                      className="border-white/20 data-[state=checked]:bg-purple-600"
                    />
                    <label
                      htmlFor="acknowledge"
                      className="text-xs text-white/70 cursor-pointer"
                    >
                      I have saved this key in a secure location and understand 
                      it cannot be recovered.
                    </label>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10"
            onClick={() => { resetForm(); onOpenChange(false); }}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white"
            onClick={handleSetKey}
            disabled={isProcessing || !isValid}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            Encrypt File
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
