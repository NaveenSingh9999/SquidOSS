import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { initializeMasterKey } from '@/services/secure-key-manager';
import { Lock, Key, Shield } from '@/lib/icon-map';

interface MasterKeySetupModalProps {
  open: boolean;
  onComplete: () => void;
}

export const MasterKeySetupModal: React.FC<MasterKeySetupModalProps> = ({ open, onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSetup = async () => {
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Master password must be at least 8 characters",
        variant: "destructive"
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await initializeMasterKey(password);
      toast({
        title: "Master Key Initialized",
        description: "Your encryption keys are now secure"
      });
      onComplete();
    } catch (error: any) {
      console.error('Master key setup error:', error);
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to initialize master key",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Secure Your Account
          </DialogTitle>
          <DialogDescription>
            Set up your master password to enable zero-knowledge encryption for all your files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <Lock className="w-5 h-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Why this matters:</p>
              <p className="text-muted-foreground mt-1">
                Your master password encrypts all file keys. Even we can't access your files without it.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="master-password">Master Password</Label>
            <Input
              id="master-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a strong password"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              disabled={loading}
            />
          </div>

          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
            <Key className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-400">Important:</p>
              <p className="text-amber-700 dark:text-amber-500 mt-1">
                Store this password safely. If you lose it, your encrypted files cannot be recovered.
              </p>
            </div>
          </div>

          <Button
            onClick={handleSetup}
            disabled={loading || !password || !confirmPassword}
            className="w-full"
          >
            {loading ? "Setting up..." : "Initialize Master Key"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
