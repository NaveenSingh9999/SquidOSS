/**
 * PIN Authentication Dialog
 * Apple Intelligence-style PIN entry interface
 */

import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Delete, AlertCircle } from '@/lib/icon-map';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pinAuthService, type AuthResult } from '@/services/pinAuthService';
import { useAuth } from '@/contexts/AuthContext';

interface PINAuthDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  description?: string;
  operation?: string;
  allowBiometric?: boolean;
}

const PINAuthDialog: React.FC<PINAuthDialogProps> = ({
  open,
  onClose,
  onSuccess,
  title = 'Enter PIN',
  description = 'Enter your 6-digit PIN to continue',
  operation,
  allowBiometric = true
}) => {
  const { user } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    // Auto-verify when 6 digits entered
    if (pin.length === 6) {
      handleVerify();
    }
  }, [pin]);

  const handleVerify = async () => {
    if (!user || pin.length !== 6) return;

    setIsVerifying(true);
    setError('');

    const result: AuthResult = await pinAuthService.verifyPIN(user.id, pin);

    if (result.success) {
      // Success animation
      await onSuccess(pin);
      // Wait for onSuccess to complete before cleaning up so we don't accidentally trigger a cancellation resolve
    } else {
      // Error animation
      setShake(true);
      setError(result.error || 'Incorrect PIN');
      setPin('');
      
      setTimeout(() => setShake(false), 500);
    }

    setIsVerifying(false);
  };

  const handleNumberClick = (num: number) => {
    if (pin.length < 6 && !isVerifying) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleBiometric = async () => {
    // TODO: Implement biometric authentication
    console.log('Biometric auth');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-md border-none shadow-2xl backdrop-blur-md bg-background/95 supports-[backdrop-filter]:bg-background/80"
        style={{
          animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div className="flex flex-col items-center py-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div 
              className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center"
              style={{
                animation: 'iconScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              }}
            >
              <Lock className="w-8 h-8 text-blue-500" />
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
                  pin.length > i
                    ? "bg-blue-500 scale-110 shadow-lg shadow-blue-500/50"
                    : "bg-gray-300 dark:bg-gray-700"
                )}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="w-full max-w-xs">
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant="ghost"
                  size="lg"
                  className={cn(
                    "h-16 text-2xl font-light rounded-2xl",
                    "hover:bg-blue-500/10 active:scale-95 transition-all",
                    "focus:ring-2 focus:ring-blue-500/50"
                  )}
                  onClick={() => handleNumberClick(num)}
                  disabled={isVerifying}
                >
                  {num}
                </Button>
              ))}

              {/* Biometric Button */}
              <Button
                variant="ghost"
                size="lg"
                className="h-16 rounded-2xl hover:bg-blue-500/10 active:scale-95 transition-all"
                onClick={handleBiometric}
                disabled={!allowBiometric || isVerifying}
              >
                {allowBiometric ? (
                  <Fingerprint className="w-6 h-6 text-blue-500" />
                ) : (
                  <span className="text-2xl font-light text-transparent">0</span>
                )}
              </Button>

              {/* Zero */}
              <Button
                variant="ghost"
                size="lg"
                className="h-16 text-2xl font-light rounded-2xl hover:bg-blue-500/10 active:scale-95 transition-all"
                onClick={() => handleNumberClick(0)}
                disabled={isVerifying}
              >
                0
              </Button>

              {/* Delete */}
              <Button
                variant="ghost"
                size="lg"
                className="h-16 rounded-2xl hover:bg-red-500/10 active:scale-95 transition-all"
                onClick={handleDelete}
                disabled={isVerifying || pin.length === 0}
              >
                <Delete className="w-6 h-6" />
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div 
              className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg w-full max-w-xs"
              style={{
                animation: 'fadeIn 0.2s ease-out forwards',
              }}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* Cancel Button */}
          <Button
            variant="ghost"
            size="sm"
            className="mt-6 text-sm"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>

        {/* Shake Animation */}
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

export default PINAuthDialog;
