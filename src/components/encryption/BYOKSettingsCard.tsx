/**
 * BYOK Settings Card Component
 * Displays encryption settings and key management UI
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Key,
  Lock,
  Unlock,
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Info,
} from '@/lib/icon-map';
import { useBYOK } from '@/hooks/use-byok';
import { cn } from '@/lib/utils';

interface BYOKSettingsCardProps {
  className?: string;
}

export function BYOKSettingsCard({ className }: BYOKSettingsCardProps) {
  const {
    settings,
    isLoading,
    isVerifying,
    hasSessionKey,
    setupAccountKey,
    unlockAccountKey,
    lockAccountKey,
    rotateAccountKey,
    updateSecurityPolicy,
    disableBYOK,
  } = useBYOK();

  const [showSetup, setShowSetup] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const resetForms = () => {
    setPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setShowPassword(false);
  };

  const handleSetup = async () => {
    if (password !== confirmPassword) {
      return;
    }
    if (password.length < 8) {
      return;
    }
    
    const success = await setupAccountKey(password);
    if (success) {
      setShowSetup(false);
      resetForms();
    }
  };

  const handleUnlock = async () => {
    const success = await unlockAccountKey(password);
    if (success) {
      setShowUnlock(false);
      resetForms();
    }
  };

  const handleRotate = async () => {
    if (newPassword.length < 8) {
      return;
    }
    
    const success = await rotateAccountKey(currentPassword, newPassword);
    if (success) {
      setShowRotate(false);
      resetForms();
    }
  };

  const handleDisable = async () => {
    const success = await disableBYOK();
    if (success) {
      setShowDisable(false);
    }
  };

  const handlePolicyToggle = async (
    key: 'strictMode' | 'allowDefaultFallback' | 'promptEveryDecrypt',
    value: boolean
  ) => {
    setUpdatingPolicy(true);
    try {
      await updateSecurityPolicy({ [key]: value });
    } finally {
      setUpdatingPolicy(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={cn('border-white/10 bg-white/5', className)}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn('border-white/10 bg-white/5', className)}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Key className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-white flex items-center gap-2">
                Bring Your Own Key
                {settings?.isEnabled && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                    Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-white/50">
                Zero-knowledge encryption with your personal key
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Status Display */}
          {settings?.isEnabled ? (
            <>
              {/* Key Status */}
              <div className={cn(
                'p-4 rounded-xl border',
                hasSessionKey
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-amber-500/10 border-amber-500/20'
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {hasSessionKey ? (
                      <Unlock className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Lock className="h-5 w-5 text-amber-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {hasSessionKey ? 'Key Unlocked' : 'Key Locked'}
                      </p>
                      <p className="text-xs text-white/50">
                        {hasSessionKey
                          ? 'Encryption key is active in session'
                          : 'Enter your key to access encrypted files'}
                      </p>
                    </div>
                  </div>
                  <Badge className={cn(
                    'text-xs',
                    hasSessionKey
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  )}>
                    {hasSessionKey ? 'Active' : 'Locked'}
                  </Badge>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {hasSessionKey ? (
                  <Button
                    variant="outline"
                    className="flex-1 h-11 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                    onClick={lockAccountKey}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Lock Key
                  </Button>
                ) : (
                  <Button
                    className="flex-1 h-11 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
                    onClick={() => setShowUnlock(true)}
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Unlock Key
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-11 bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={() => setShowRotate(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rotate
                </Button>
              </div>

              {/* Settings Info */}
              <div className="p-4 bg-black/20 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Encryption Mode</span>
                  <span className="text-white font-medium capitalize">
                    {settings.encryptionMode}
                  </span>
                </div>
                {settings.createdAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Created</span>
                    <span className="text-white">
                      {new Date(settings.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {settings.lastRotated && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Last Rotated</span>
                    <span className="text-white">
                      {new Date(settings.lastRotated).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
                <p className="text-xs uppercase tracking-wide text-white/50">Security Policy</p>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">Strict mode</p>
                    <p className="text-xs text-white/50">Enforce key checks for protected actions</p>
                  </div>
                  <Switch
                    checked={settings?.strictMode ?? true}
                    onCheckedChange={(checked) => void handlePolicyToggle('strictMode', checked)}
                    disabled={updatingPolicy}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">Allow SquidCloud fallback key</p>
                    <p className="text-xs text-white/50">Try default key when BYOK decryption fails</p>
                  </div>
                  <Switch
                    checked={settings?.allowDefaultFallback ?? true}
                    onCheckedChange={(checked) => void handlePolicyToggle('allowDefaultFallback', checked)}
                    disabled={updatingPolicy}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">Prompt key every decrypt</p>
                    <p className="text-xs text-white/50">Never reuse key for preview/download operations</p>
                  </div>
                  <Switch
                    checked={settings?.promptEveryDecrypt ?? true}
                    onCheckedChange={(checked) => void handlePolicyToggle('promptEveryDecrypt', checked)}
                    disabled={updatingPolicy}
                  />
                </div>
              </div>

              {/* Disable Button */}
              <Button
                variant="ghost"
                className="w-full h-11 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => setShowDisable(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Disable BYOK
              </Button>
            </>
          ) : (
            <>
              {/* Setup Prompt */}
              <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white mb-1">
                      Enhanced Security Available
                    </p>
                    <p className="text-xs text-white/60">
                      Set up your own encryption key for zero-knowledge file protection. 
                      Only you can decrypt your files.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                className="w-full h-12 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
                onClick={() => setShowSetup(true)}
              >
                <Key className="h-4 w-4 mr-2" />
                Set Up Encryption Key
              </Button>

              {/* Info Box */}
              <div className="p-4 bg-black/20 rounded-xl">
                <p className="text-xs text-white/40 mb-2 font-medium flex items-center gap-2">
                  <Info className="h-3 w-3" />
                  How BYOK Works
                </p>
                <ul className="text-xs text-white/40 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Your key is never stored on our servers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Files are encrypted before upload</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Zero-knowledge architecture</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                    <span>Lost key = permanent data loss</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <AlertDialog open={showSetup} onOpenChange={setShowSetup}>
        <AlertDialogContent className="bg-[#1a1a2e] border-white/10 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-400" />
              Set Up Encryption Key
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Create a strong encryption key. This key will protect all your files.
              <span className="block mt-2 text-amber-400 font-medium">
                ⚠️ This key cannot be recovered if lost.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/70">Encryption Key</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a strong key (min 8 characters)"
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
                placeholder="Confirm your key"
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
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              onClick={resetForms}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleSetup}
              disabled={isLoading || password.length < 8 || password !== confirmPassword}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Set Up Key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlock Dialog */}
      <AlertDialog open={showUnlock} onOpenChange={setShowUnlock}>
        <AlertDialogContent className="bg-[#1a1a2e] border-white/10 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Unlock className="h-5 w-5 text-amber-400" />
              Unlock Encryption Key
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Enter your encryption key to access your protected files.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
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
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              onClick={resetForms}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleUnlock}
              disabled={isVerifying || !password}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isVerifying ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Unlock
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate Dialog */}
      <AlertDialog open={showRotate} onOpenChange={setShowRotate}>
        <AlertDialogContent className="bg-[#1a1a2e] border-white/10 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-400" />
              Rotate Encryption Key
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Change your encryption key. You'll need your current key to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/70">Current Key</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current key"
                className="bg-black/20 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">New Key</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new key (min 8 characters)"
                className="bg-black/20 border-white/10 text-white"
              />
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-amber-400">
                  Key must be at least 8 characters
                </p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              onClick={resetForms}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleRotate}
              disabled={isLoading || !currentPassword || newPassword.length < 8}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Rotate Key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Dialog */}
      <AlertDialog open={showDisable} onOpenChange={setShowDisable}>
        <AlertDialogContent className="bg-[#1a1a2e] border-white/10 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Disable BYOK Encryption
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              This will disable your custom encryption key. Files encrypted with this key 
              will no longer be accessible unless you set up the same key again.
              <span className="block mt-2 text-red-400 font-medium">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleDisable}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Disable BYOK
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
