import { supabase } from '@/integrations/supabase/client';

export interface SecurityEvent {
  id: string;
  event_type: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  status: 'success' | 'failure';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

export interface ThreatAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  status: 'active' | 'resolved';
  actions_taken: string[];
}

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
  details: any;
}

export interface EncryptionSettings {
  enabled: boolean;
  algorithm: string;
  keyRotationInterval: number;
  backupEncryption: boolean;
  key_rotation_days: number;
  client_side_encryption: boolean;
  zero_knowledge_mode: boolean;
  hardware_security_module: boolean;
  custom_key_provider: boolean;
}

export interface AccessPolicy {
  id: string;
  name: string;
  description: string;
  rules: {
    mfa_required?: boolean;
    time_restrictions?: boolean;
    ip_whitelist?: boolean;
    [key: string]: any;
  };
  applies_to: string[];
  is_active: boolean;
  active: boolean;
  priority: string;
}

export class SecurityService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async logSecurityEvent(eventType: string, severity: SecurityEvent['severity'], details: any): Promise<void> {
    try {
      // Store security events in localStorage for now
      const eventData = {
        id: Date.now().toString(),
        event_type: eventType,
        timestamp: new Date().toISOString(),
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        severity,
        details,
        status: 'success',
        risk_level: severity
      };
      
      const existingEvents = JSON.parse(localStorage.getItem('security_events') || '[]');
      existingEvents.push(eventData);
      localStorage.setItem('security_events', JSON.stringify(existingEvents));
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  async getSecurityEvents(): Promise<SecurityEvent[]> {
    try {
      // Get security events from localStorage and existing account_changes table
      const storedEvents = JSON.parse(localStorage.getItem('security_events') || '[]');
      
      // Also get account changes as security events
      const { data: accountChanges } = await supabase
        .from('account_changes')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(50);

      const accountSecurityEvents: SecurityEvent[] = (accountChanges || []).map(change => ({
        id: change.id,
        event_type: change.change_type,
        timestamp: change.created_at,
        ip_address: change.ip_address as string || 'Unknown',
        user_agent: change.user_agent,
        severity: this.determineSeverity(change.change_type),
        details: change.new_values,
        status: 'success',
        risk_level: this.determineSeverity(change.change_type)
      }));

      return [...storedEvents, ...accountSecurityEvents]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 100);
    } catch (error) {
      console.error('Error getting security events:', error);
      return [];
    }
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    try {
      // Get audit logs from localStorage and file operations
      const storedLogs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
      
      // Get file operations from files table as audit logs
      const { data: files } = await supabase
        .from('files')
        .select('id, name, size, created_at')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(50);

      const fileAuditLogs: AuditLog[] = (files || []).map(file => ({
        id: file.id,
        action: 'file_upload',
        resource: file.name,
        timestamp: file.created_at,
        ip_address: 'Unknown',
        user_agent: 'Unknown',
        details: { size: file.size }
      }));

      return [...storedLogs, ...fileAuditLogs]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 100);
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
    }
  }

  async getThreatAlerts(): Promise<ThreatAlert[]> {
    try {
      // Get threat alerts from localStorage
      const storedAlerts = JSON.parse(localStorage.getItem('threat_alerts') || '[]');
      return storedAlerts.sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Error getting threat alerts:', error);
      return [];
    }
  }

  async getEncryptionSettings(): Promise<EncryptionSettings> {
    try {
      // Get encryption settings from localStorage or use defaults
      const stored = localStorage.getItem('encryption_settings');
      if (stored) {
        return JSON.parse(stored);
      }
      
      return {
        enabled: true,
        algorithm: 'AES-256-GCM',
        keyRotationInterval: 90,
        backupEncryption: true,
        key_rotation_days: 90,
        client_side_encryption: false,
        zero_knowledge_mode: false,
        hardware_security_module: false,
        custom_key_provider: false
      };
    } catch (error) {
      console.error('Error getting encryption settings:', error);
      return {
        enabled: false,
        algorithm: 'AES-256-GCM',
        keyRotationInterval: 90,
        backupEncryption: false,
        key_rotation_days: 90,
        client_side_encryption: false,
        zero_knowledge_mode: false,
        hardware_security_module: false,
        custom_key_provider: false
      };
    }
  }

  async updateEncryptionSettings(settings: Partial<EncryptionSettings>): Promise<void> {
    try {
      const current = await this.getEncryptionSettings();
      const updated = { ...current, ...settings };
      localStorage.setItem('encryption_settings', JSON.stringify(updated));
      
      // Log the security event
      await this.logSecurityEvent('encryption_settings_updated', 'medium', settings);
    } catch (error) {
      console.error('Error updating encryption settings:', error);
    }
  }

  async getAccessPolicies(): Promise<AccessPolicy[]> {
    try {
      // Get access policies from localStorage or use defaults
      const stored = localStorage.getItem('access_policies');
      if (stored) {
        return JSON.parse(stored);
      }
      
      return [
        {
          id: '1',
          name: 'Default Access Policy',
          description: 'Standard access rules for all users',
          rules: {
            mfa_required: false,
            time_restrictions: false,
            ip_whitelist: false
          },
          applies_to: ['all_users'],
          is_active: true,
          active: true,
          priority: 'medium'
        }
      ];
    } catch (error) {
      console.error('Error getting access policies:', error);
      return [];
    }
  }

  async createAccessPolicy(policy: Omit<AccessPolicy, 'id'>): Promise<AccessPolicy> {
    try {
      const newPolicy = { 
        id: Date.now().toString(), 
        ...policy,
        active: policy.is_active 
      };
      
      const policies = await this.getAccessPolicies();
      policies.push(newPolicy);
      localStorage.setItem('access_policies', JSON.stringify(policies));
      
      // Log the security event
      await this.logSecurityEvent('access_policy_created', 'low', { policyName: policy.name });
      
      return newPolicy;
    } catch (error) {
      console.error('Error creating access policy:', error);
      throw error;
    }
  }

  async updateAccessPolicy(id: string, updates: Partial<AccessPolicy>): Promise<void> {
    try {
      const policies = await this.getAccessPolicies();
      const index = policies.findIndex(p => p.id === id);
      
      if (index !== -1) {
        policies[index] = { ...policies[index], ...updates };
        if (updates.is_active !== undefined) {
          policies[index].active = updates.is_active;
        }
        localStorage.setItem('access_policies', JSON.stringify(policies));
        
        // Log the security event
        await this.logSecurityEvent('access_policy_updated', 'low', { policyId: id, updates });
      }
    } catch (error) {
      console.error('Error updating access policy:', error);
    }
  }

  async deleteAccessPolicy(id: string): Promise<void> {
    try {
      const policies = await this.getAccessPolicies();
      const filtered = policies.filter(p => p.id !== id);
      localStorage.setItem('access_policies', JSON.stringify(filtered));
      
      // Log the security event
      await this.logSecurityEvent('access_policy_deleted', 'medium', { policyId: id });
    } catch (error) {
      console.error('Error deleting access policy:', error);
    }
  }

  async detectSuspiciousActivity(): Promise<void> {
    try {
      // Analyze login patterns from login_sessions
      const { data: sessions } = await supabase
        .from('login_sessions')
        .select('*')
        .eq('user_id', this.userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (sessions && sessions.length > 10) {
        await this.createThreatAlert(
          'unusual_activity',
          'medium',
          'High Login Frequency',
          `Detected ${sessions.length} login attempts in the last 24 hours`
        );
      }

      // Check for rapid file uploads
      const { data: recentFiles } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', this.userId)
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

      if (recentFiles && recentFiles.length > 20) {
        await this.createThreatAlert(
          'bulk_upload',
          'low',
          'Bulk File Upload Detected',
          `${recentFiles.length} files uploaded in the last hour`
        );
      }
    } catch (error) {
      console.error('Error detecting suspicious activity:', error);
    }
  }

  async createThreatAlert(type: string, severity: ThreatAlert['severity'], title: string, description: string): Promise<void> {
    try {
      const alert: ThreatAlert = {
        id: Date.now().toString(),
        type,
        severity,
        title,
        description,
        timestamp: new Date().toISOString(),
        status: 'active',
        actions_taken: []
      };
      
      const alerts = JSON.parse(localStorage.getItem('threat_alerts') || '[]');
      alerts.push(alert);
      localStorage.setItem('threat_alerts', JSON.stringify(alerts));
      
      // Log as security event
      await this.logSecurityEvent('threat_detected', severity, { type, title });
    } catch (error) {
      console.error('Error creating threat alert:', error);
    }
  }

  async logAuditEvent(action: string, resource: string, details?: any): Promise<void> {
    try {
      const auditEvent: AuditLog = {
        id: Date.now().toString(),
        action,
        resource,
        timestamp: new Date().toISOString(),
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        details: details || {}
      };
      
      const logs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
      logs.push(auditEvent);
      localStorage.setItem('audit_logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Error logging audit event:', error);
    }
  }

  private async getClientIP(): Promise<string> {
    try {
      // In a real app, this would be handled by the backend
      return 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private determineSeverity(changeType: string): SecurityEvent['severity'] {
    const highRiskChanges = ['password_change', 'email_change', 'delete_account'];
    const mediumRiskChanges = ['profile_update', 'settings_change'];
    
    if (highRiskChanges.includes(changeType)) return 'high';
    if (mediumRiskChanges.includes(changeType)) return 'medium';
    return 'low';
  }
}

export const securityService = new SecurityService('');