import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const usePinAuth = () => {
  const { toast } = useToast();
  const [isPinEnabled, setIsPinEnabled] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Check if PIN is enabled for current user
  const checkPinEnabled = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase
        .from('profiles')
        .select('pin_enabled')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      const enabled = data?.pin_enabled || false;
      setIsPinEnabled(enabled);
      return enabled;
    } catch (error) {
      console.error('Failed to check PIN status:', error);
      return false;
    }
  }, []);

  // Hash PIN using SHA-256
  const hashPin = async (pin: string, salt: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  // Generate random salt
  const generateSalt = (): string => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Set up PIN
  const setupPin = async (pin: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const salt = generateSalt();
      const pinHash = await hashPin(pin, salt);

      const { error } = await supabase
        .from('profiles')
        .update({
          pin_hash: pinHash,
          pin_salt: salt,
          pin_enabled: true
        })
        .eq('id', user.id);

      if (error) throw error;

      setIsPinEnabled(true);
      toast({
        title: "PIN enabled",
        description: "Your security PIN has been set successfully.",
      });
      return true;
    } catch (error: any) {
      console.error('Failed to setup PIN:', error);
      toast({
        title: "PIN setup failed",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  // Verify PIN
  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      setIsChecking(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .rpc('verify_user_pin', {
          p_user_id: user.id,
          p_pin: pin
        });

      if (error) throw error;

      return data || false;
    } catch (error: any) {
      console.error('PIN verification failed:', error);
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  // Disable PIN
  const disablePin = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          pin_hash: null,
          pin_salt: null,
          pin_enabled: false
        })
        .eq('id', user.id);

      if (error) throw error;

      setIsPinEnabled(false);
      toast({
        title: "PIN disabled",
        description: "Your security PIN has been removed.",
      });
      return true;
    } catch (error: any) {
      console.error('Failed to disable PIN:', error);
      toast({
        title: "Failed to disable PIN",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    isPinEnabled,
    isChecking,
    checkPinEnabled,
    setupPin,
    verifyPin,
    disablePin
  };
};