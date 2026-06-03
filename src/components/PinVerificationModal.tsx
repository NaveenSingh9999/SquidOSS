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
import { Shield, Loader2 } from '@/lib/icon-map';
import { usePinAuth } from '@/hooks/use-pin-auth';

interface PinVerificationModalProps {
  open: boolean;
  onVerified: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({
  open,
  onVerified,
  onCancel,
  title = "PIN Required",
  description = "Please enter your security PIN to continue"
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { verifyPin, isChecking } = usePinAuth();

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);

  const handleVerify = async () => {
    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    const isValid = await verifyPin(pin);
    
    if (isValid) {
      onVerified();
    } else {
      setError('Invalid PIN. Please try again.');
      setPin('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pin">Security PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter 6-digit PIN"
              className={error ? 'border-destructive' : ''}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1"
              disabled={isChecking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              className="flex-1"
              disabled={isChecking || pin.length !== 6}
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};