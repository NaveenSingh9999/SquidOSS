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
import { Shield, Loader2, Check } from '@/lib/icon-map';
import { usePinAuth } from '@/hooks/use-pin-auth';

interface PinSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PinSetupModal: React.FC<PinSetupModalProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setupPin } = usePinAuth();

  const handleSetup = async () => {
    setError('');

    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    const success = await setupPin(pin);
    setLoading(false);

    if (success) {
      onSuccess();
      onClose();
    }
  };

  const handleClose = () => {
    setPin('');
    setConfirmPin('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">Set Up Security PIN</DialogTitle>
          <DialogDescription className="text-center">
            Create a 6-digit PIN to secure sensitive actions
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-pin">Enter PIN</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              placeholder="Enter 6-digit PIN"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-pin">Confirm PIN</Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              placeholder="Confirm 6-digit PIN"
            />
            {pin.length === 6 && confirmPin.length === 6 && pin === confirmPin && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" />
                PINs match
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetup}
              className="flex-1"
              disabled={loading || pin.length !== 6 || pin !== confirmPin}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                'Setup PIN'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};