/**
 * PIN Setup Dialog
 * For creating a new PIN with confirmation
 */

import React, { useState, useEffect } from 'react';
import { Shield, Check, X, AlertCircle } from '@/lib/icon-map';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { pinAuthService } from '@/services/pinAuthService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PINSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const PINSetupDialog: React.FC<PINSetupDialogProps> = ({
  open,
  onClose,
  onComplete
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'enter' | 'confirm' | 'settings'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  
  // Settings
  const [requireOnStartup, setRequireOnStartup] = useState(false);
  const [requireForShares, setRequireForShares] = useState(true);
  const [requireForSettings, setRequireForSettings] = useState(true);
  const [requireForVault, setRequireForVault] = useState(true);

  useEffect(() => {
    if (open) {
      setStep('enter');
      setPin('');
      setConfirmPin('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (step === 'enter' && pin.length === 6) {
      // Auto-advance to confirm step
      setTimeout(() => {
        setStep('confirm');
      }, 200);
    }
  }, [pin, step]);

  useEffect(() => {
    if (step === 'confirm' && confirmPin.length === 6) {
      // Auto-verify match
      handleVerifyMatch();
    }
  }, [confirmPin, step]);

  const handleVerifyMatch = () => {
    if (pin === confirmPin) {
      setStep('settings');
    } else {
      setShake(true);
      setError('PINs do not match. Try again.');
      setConfirmPin('');
      setTimeout(() => {
        setShake(false);
        setStep('enter');
        setPin('');
      }, 1000);
    }
  };

  const handleNumberClick = (num: number) => {
    if (step === 'enter' && pin.length < 6) {
      setPin(prev => prev + num);
      setError('');
    } else if (step === 'confirm' && confirmPin.length < 6) {
      setConfirmPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    if (step === 'enter') {
      setPin(prev => prev.slice(0, -1));
    } else if (step === 'confirm') {
      setConfirmPin(prev => prev.slice(0, -1));
    }
    setError('');
  };

  const handleComplete = async () => {
    if (!user) return;

    const success = await pinAuthService.createPIN(user.id, pin, {
      requirePinOnStartup: requireOnStartup,
      requirePinForShares: requireForShares,
      requirePinForSettings: requireForSettings,
      requirePinForVault: requireForVault,
      pinTimeout: 5,
      biometricEnabled: false
    });

    if (success) {
      toast({
        title: 'PIN Created Successfully',
        description: 'Your PIN has been set up and is ready to use',
      });
      onComplete();
      onClose();
    } else {
      toast({
        title: 'Setup Failed',
        description: 'Failed to create PIN. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const currentPin = step === 'confirm' ? confirmPin : pin;
  const title = step === 'enter' ? 'Create PIN' : step === 'confirm' ? 'Confirm PIN' : 'PIN Settings';
  const description = step === 'enter' 
    ? 'Enter a 6-digit PIN' 
    : step === 'confirm'
    ? 'Re-enter your PIN to confirm'
    : 'Configure when PIN is required';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-md border-none shadow-2xl backdrop-blur-md bg-background/95 supports-[backdrop-filter]:bg-background/80"
        style={{
          animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {step !== 'settings' ? (
          <div className="flex flex-col items-center py-6">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Shield className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {/* PIN Dots */}
            <div 
              className={cn(
                "flex gap-3 mb-8 transition-transform duration-200",
                shake && "animate-shake"
              )}
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full transition-all duration-200",
                    currentPin.length > i
                      ? step === 'confirm'
                        ? "bg-green-500 scale-110 shadow-lg shadow-green-500/50"
                        : "bg-blue-500 scale-110 shadow-lg shadow-blue-500/50"
                      : "bg-gray-300 dark:bg-gray-700"
                  )}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="w-full max-w-xs">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <Button
                    key={num}
                    variant="ghost"
                    size="lg"
                    className="h-16 text-2xl font-light rounded-2xl hover:bg-blue-500/10 active:scale-95 transition-all"
                    onClick={() => handleNumberClick(num)}
                  >
                    {num}
                  </Button>
                ))}

                <div /> {/* Empty space */}

                <Button
                  variant="ghost"
                  size="lg"
                  className="h-16 text-2xl font-light rounded-2xl hover:bg-blue-500/10 active:scale-95 transition-all"
                  onClick={() => handleNumberClick(0)}
                >
                  0
                </Button>

                <Button
                  variant="ghost"
                  size="lg"
                  className="h-16 rounded-2xl hover:bg-red-500/10 active:scale-95 transition-all"
                  onClick={handleDelete}
                  disabled={currentPin.length === 0}
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg w-full max-w-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                PIN Settings
              </DialogTitle>
            </DialogHeader>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require on App Startup</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter PIN when opening the app
                  </p>
                </div>
                <Switch checked={requireOnStartup} onCheckedChange={setRequireOnStartup} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require for Sharing</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter PIN before creating file shares
                  </p>
                </div>
                <Switch checked={requireForShares} onCheckedChange={setRequireForShares} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require for Settings</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter PIN to view security settings
                  </p>
                </div>
                <Switch checked={requireForSettings} onCheckedChange={setRequireForSettings} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require for SquidVault</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter PIN to open SquidVault
                  </p>
                </div>
                <Switch checked={requireForVault} onCheckedChange={setRequireForVault} />
              </div>

              <div className="pt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('enter')}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleComplete}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Complete Setup
                </Button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
            20%, 40%, 60%, 80% { transform: translateX(10px); }
          }
          
          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
};

export default PINSetupDialog;
