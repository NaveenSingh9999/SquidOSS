import React, { useState } from 'react';
import { usePinAuth } from '@/hooks/use-pin-auth';
import { PinVerificationModal } from '@/components/PinVerificationModal';

interface PinProtectedActionProps {
  children: (props: { executeAction: () => Promise<void> }) => React.ReactNode;
  onAction: () => Promise<void> | void;
  actionName?: string;
  requirePin?: boolean;
}

/**
 * Wrapper component that requires PIN verification before executing sensitive actions
 * Usage:
 * <PinProtectedAction onAction={handleSensitiveAction}>
 *   {({ executeAction }) => (
 *     <Button onClick={executeAction}>Do Sensitive Thing</Button>
 *   )}
 * </PinProtectedAction>
 */
export const PinProtectedAction: React.FC<PinProtectedActionProps> = ({
  children,
  onAction,
  actionName = 'this action',
  requirePin = true
}) => {
  const { checkPinEnabled, isPinEnabled } = usePinAuth();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);

  const executeAction = async () => {
    if (!requirePin) {
      await onAction();
      return;
    }

    // Check if PIN is enabled
    const pinEnabled = await checkPinEnabled();
    
    if (pinEnabled) {
      // Show PIN verification modal
      setPendingAction(true);
      setShowPinModal(true);
    } else {
      // No PIN enabled, execute directly
      await onAction();
    }
  };

  const handlePinVerified = async () => {
    setShowPinModal(false);
    setPendingAction(false);
    await onAction();
  };

  const handlePinCancelled = () => {
    setShowPinModal(false);
    setPendingAction(false);
  };

  return (
    <>
      {children({ executeAction })}
      
      <PinVerificationModal
        open={showPinModal}
        onVerified={handlePinVerified}
        onCancel={handlePinCancelled}
        title="PIN Verification Required"
        description={`Please enter your PIN to ${actionName}`}
      />
    </>
  );
};
