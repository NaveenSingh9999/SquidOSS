import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MaintenanceMode {
  enabled: boolean;
  message: string;
}

export const useMaintenanceMode = () => {
  const channelNameRef = useRef(
    `system_settings_changes_${Math.random().toString(36).slice(2)}_${Date.now()}`
  );
  const [maintenanceMode, setMaintenanceMode] = useState<MaintenanceMode>({
    enabled: false,
    message: 'System is under maintenance. Please check back later.'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMaintenanceMode();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: 'setting_key=eq.maintenance_mode'
        },
        (payload) => {
          if (payload.new && 'setting_value' in payload.new) {
            const value = payload.new.setting_value as unknown;
            if (typeof value === 'object' && value !== null && 'enabled' in value && 'message' in value) {
              setMaintenanceMode(value as MaintenanceMode);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Maintenance mode realtime subscription failed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMaintenanceMode = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'maintenance_mode')
        .single();

      if (error) throw error;

      if (data?.setting_value) {
        const value = data.setting_value as unknown;
        if (typeof value === 'object' && value !== null && 'enabled' in value && 'message' in value) {
          setMaintenanceMode(value as MaintenanceMode);
        }
      }
    } catch (error) {
      console.error('Error fetching maintenance mode:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateMaintenanceMode = async (enabled: boolean, message?: string) => {
    try {
      const newValue = {
        enabled,
        message: message || maintenanceMode.message
      };

      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: newValue,
          updated_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('setting_key', 'maintenance_mode');

      if (error) throw error;

      setMaintenanceMode(newValue);
      return true;
    } catch (error) {
      console.error('Error updating maintenance mode:', error);
      return false;
    }
  };

  return {
    maintenanceMode,
    loading,
    updateMaintenanceMode,
    isMaintenanceMode: maintenanceMode.enabled
  };
};
