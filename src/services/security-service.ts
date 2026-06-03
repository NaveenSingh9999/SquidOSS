import { supabase } from '@/integrations/supabase/client';

export interface SecurityEvent {
  id: string;
  event_type: 'login_attempt' | 'file_access' | 'permission_change' | 'suspicious_activity' | 'encryption_key_change';
  user_id: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
  metadata: any;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: 'success' | 'failed' | 'blocked';
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  timestamp: string;
  ip_address: string;
  details: any;
  compliance_tags: string[];
}

export interface ThreatAlert {
  id: string;
  type: 'brute_force' | 'unusual_location' | 'data_exfiltration' | 'malware_detected' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  user_id?: string;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  actions_taken: string[];
}

export interface ComplianceReport {
  period: string;
  gdpr_compliance: number;
  hipaa_compliance: number;
  sox_compliance: number;
  total_audited_events: number;
  violations: number;
  remediation_actions: number;
}

export interface EncryptionSettings {
  algorithm: 'AES-256' | 'ChaCha20' | 'RSA-4096';
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
    ip_whitelist?: string[];
    ip_blacklist?: string[];
    time_restrictions?: {
      start_time: string;
      end_time: string;
      days: string[];
    };
    location_restrictions?: string[];
    device_restrictions?: string[];
    mfa_required: boolean;
    session_timeout: number;
  };
  applies_to: 'all' | 'specific_users' | 'user_groups';
  target_users?: string[];
  target_groups?: string[];
  priority: number;
  active: boolean;
}

class SecurityService {
  private userId: string | null = null;
  private initializeUserPromise: Promise<void> | null = null;
  private hasInitializedUser = false;

  constructor() {}

  private async initializeUser() {
    const { data: { session } } = await supabase.auth.getSession();
    this.userId = session?.user?.id || null;
    this.hasInitializedUser = true;
  }

  private async ensureUserInitialized() {
    if (this.hasInitializedUser) return;

    if (this.initializeUserPromise) {
      await this.initializeUserPromise;
      return;
    }

    this.initializeUserPromise = this.initializeUser().finally(() => {
      this.initializeUserPromise = null;
    });

    await this.initializeUserPromise;
  }

  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'user_id'>) {
    if (!this.userId) await this.ensureUserInitialized();

    try {
      const securityEvent: Omit<SecurityEvent, 'id'> = {
        ...event,
        user_id: this.userId!,
        timestamp: new Date().toISOString()
      };

      const { error } = await supabase
        .from('security_events')
        .insert(securityEvent);

      if (error) throw error;

      // Check for threat patterns
      await this.analyzeThreatPatterns(securityEvent);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  async getSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
    await this.ensureUserInitialized();

    try {
      const { data, error } = await supabase
        .from('security_events')
        .select('*')
        .eq('user_id', this.userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      const events: SecurityEvent[] = (data || []).map(event => ({
        id: event.id,
        user_id: event.user_id,
        event_type: event.event_type as any,
        timestamp: event.timestamp,
        ip_address: event.ip_address,
        user_agent: event.user_agent,
        metadata: event.metadata,
        risk_level: event.risk_level as any,
        status: event.status as any
      }));
      
      return events;
    } catch (error) {
      console.error('Failed to get security events:', error);
      return [];
    }
  }

  async getAuditLogs(startDate?: Date, endDate?: Date): Promise<AuditLog[]> {
    await this.ensureUserInitialized();

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', this.userId)
        .order('timestamp', { ascending: false });

      if (startDate) {
        query = query.gte('timestamp', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('timestamp', endDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  }

  async getThreatAlerts(): Promise<ThreatAlert[]> {
    await this.ensureUserInitialized();

    try {
      const { data, error } = await supabase
        .from('threat_alerts')
        .select('*')
        .or(`user_id.eq.${this.userId},user_id.is.null`)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      const alerts: ThreatAlert[] = (data || []).map(alert => ({
        id: alert.id,
        type: alert.type as any,
        severity: alert.severity as any,
        title: alert.title,
        description: alert.description || '',
        timestamp: alert.timestamp,
        user_id: alert.user_id || undefined,
        status: alert.status as any,
        actions_taken: Array.isArray(alert.actions_taken) 
          ? (alert.actions_taken as any[]).map(a => String(a))
          : []
      }));
      
      return alerts;
    } catch (error) {
      console.error('Failed to get threat alerts:', error);
      return this.getMockThreatAlerts();
    }
  }

  async getComplianceReport(period: string): Promise<ComplianceReport> {
    // Mock implementation - in real app, this would calculate from audit logs
    return {
      period,
      gdpr_compliance: 96.5,
      hipaa_compliance: 94.2,
      sox_compliance: 98.1,
      total_audited_events: 1247,
      violations: 3,
      remediation_actions: 2
    };
  }

  async getEncryptionSettings(): Promise<EncryptionSettings> {
    await this.ensureUserInitialized();

    try {
      const { data, error } = await supabase
        .from('user_encryption_settings')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (error || !data) {
        return this.getDefaultEncryptionSettings();
      }

      return (data.settings as any) || this.getDefaultEncryptionSettings();
    } catch (error) {
      console.error('Failed to get encryption settings:', error);
      return this.getDefaultEncryptionSettings();
    }
  }

  async updateEncryptionSettings(settings: EncryptionSettings): Promise<void> {
    await this.ensureUserInitialized();

    try {
      const { error } = await supabase
        .from('user_encryption_settings')
        .upsert({
          user_id: this.userId,
          settings: settings as any,
          updated_at: new Date().toISOString()
        } as any);

      if (error) throw error;

      await this.logSecurityEvent({
        event_type: 'encryption_key_change',
        ip_address: await this.getCurrentIP(),
        user_agent: navigator.userAgent,
        metadata: { algorithm: settings.algorithm, hsm_enabled: settings.hardware_security_module },
        risk_level: 'medium',
        status: 'success'
      });
    } catch (error) {
      console.error('Failed to update encryption settings:', error);
      throw error;
    }
  }

  async getAccessPolicies(): Promise<AccessPolicy[]> {
    await this.ensureUserInitialized();

    try {
      const { data, error } = await supabase
        .from('access_policies')
        .select('*')
        .eq('user_id', this.userId)
        .order('priority', { ascending: false });

      if (error) throw error;
      
      const policies: AccessPolicy[] = (data || []).map(policy => ({
        id: policy.id,
        name: policy.name,
        description: policy.description || '',
        rules: (policy.rules as any) || {},
        applies_to: policy.applies_to as any,
        target_users: policy.target_users || undefined,
        target_groups: policy.target_groups || undefined,
        priority: policy.priority || 0,
        active: policy.active || false
      }));
      
      return policies;
    } catch (error) {
      console.error('Failed to get access policies:', error);
      return this.getMockAccessPolicies();
    }
  }

  async createAccessPolicy(policy: Omit<AccessPolicy, 'id'>): Promise<AccessPolicy> {
    await this.ensureUserInitialized();

    try {
      const { data, error } = await supabase
        .from('access_policies')
        .insert({
          ...policy,
          user_id: this.userId
        })
        .select()
        .single();

      if (error) throw error;

      await this.logAuditEvent('access_policy_created', 'access_policy', {
        policy_name: policy.name,
        priority: policy.priority
      });

      return {
        id: data.id,
        name: data.name,
        description: data.description || '',
        rules: (data.rules as any) || {},
        applies_to: data.applies_to as any,
        target_users: data.target_users || undefined,
        target_groups: data.target_groups || undefined,
        priority: data.priority || 0,
        active: data.active || false
      };
    } catch (error) {
      console.error('Failed to create access policy:', error);
      throw error;
    }
  }

  async updateAccessPolicy(id: string, updates: Partial<AccessPolicy>): Promise<void> {
    await this.ensureUserInitialized();

    try {
      const { error } = await supabase
        .from('access_policies')
        .update(updates)
        .eq('id', id)
        .eq('user_id', this.userId);

      if (error) throw error;

      await this.logAuditEvent('access_policy_updated', 'access_policy', {
        policy_id: id,
        updates
      });
    } catch (error) {
      console.error('Failed to update access policy:', error);
      throw error;
    }
  }

  async deleteAccessPolicy(id: string): Promise<void> {
    await this.ensureUserInitialized();

    try {
      const { error } = await supabase
        .from('access_policies')
        .delete()
        .eq('id', id)
        .eq('user_id', this.userId);

      if (error) throw error;

      await this.logAuditEvent('access_policy_deleted', 'access_policy', {
        policy_id: id
      });
    } catch (error) {
      console.error('Failed to delete access policy:', error);
      throw error;
    }
  }

  async generateSecurityReport(startDate: Date, endDate: Date) {
    const [events, auditLogs, threats] = await Promise.all([
      this.getSecurityEvents(1000),
      this.getAuditLogs(startDate, endDate),
      this.getThreatAlerts()
    ]);

    const filteredEvents = events.filter(e => 
      new Date(e.timestamp) >= startDate && new Date(e.timestamp) <= endDate
    );

    const activeThreatsByType = threats.reduce((acc, threat) => {
      if (threat.status === 'active') {
        acc[threat.type] = (acc[threat.type] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const riskLevelDistribution = filteredEvents.reduce((acc, event) => {
      acc[event.risk_level] = (acc[event.risk_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      totalEvents: filteredEvents.length,
      auditLogEntries: auditLogs.length,
      activeThreats: threats.filter(t => t.status === 'active').length,
      resolvedThreats: threats.filter(t => t.status === 'resolved').length,
      threatsByType: activeThreatsByType,
      riskLevelDistribution,
      failedLogins: filteredEvents.filter(e => e.event_type === 'login_attempt' && e.status === 'failed').length,
      suspiciousActivities: filteredEvents.filter(e => e.event_type === 'suspicious_activity').length,
      complianceScore: Math.round(((filteredEvents.filter(e => e.status === 'success').length / filteredEvents.length) * 100) || 100)
    };
  }

  private async analyzeThreatPatterns(event: Omit<SecurityEvent, 'id'>) {
    // Simple threat detection logic
    const recentEvents = await this.getSecurityEvents(100);
    
    // Check for brute force attacks
    if (event.event_type === 'login_attempt' && event.status === 'failed') {
      const recentFailures = recentEvents.filter(e => 
        e.event_type === 'login_attempt' && 
        e.status === 'failed' && 
        e.ip_address === event.ip_address &&
        new Date(e.timestamp).getTime() > Date.now() - (15 * 60 * 1000) // Last 15 minutes
      );

      if (recentFailures.length >= 5) {
        await this.createThreatAlert({
          type: 'brute_force',
          severity: 'high',
          title: 'Brute Force Attack Detected',
          description: `Multiple failed login attempts from IP ${event.ip_address}`,
          user_id: event.user_id,
          status: 'active',
          actions_taken: ['ip_temporary_block', 'notification_sent']
        });
      }
    }

    // Check for unusual location
    if (event.event_type === 'login_attempt' && event.status === 'success') {
      // This would typically integrate with a geolocation service
      // For now, we'll simulate unusual location detection
      const userLocations = recentEvents
        .filter(e => e.event_type === 'login_attempt' && e.status === 'success')
        .map(e => e.ip_address)
        .slice(0, 10);

      if (!userLocations.includes(event.ip_address) && userLocations.length > 0) {
        await this.createThreatAlert({
          type: 'unusual_location',
          severity: 'medium',
          title: 'Login from New Location',
          description: `Login detected from new IP address: ${event.ip_address}`,
          user_id: event.user_id,
          status: 'active',
          actions_taken: ['notification_sent', 'mfa_required']
        });
      }
    }
  }

  private async createThreatAlert(alert: Omit<ThreatAlert, 'id' | 'timestamp'>) {
    try {
      const { error } = await supabase
        .from('threat_alerts')
        .insert({
          ...alert,
          timestamp: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to create threat alert:', error);
    }
  }

  private async logAuditEvent(action: string, resource: string, details: any) {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          user_id: this.userId,
          action,
          resource,
          timestamp: new Date().toISOString(),
          ip_address: await this.getCurrentIP(),
          details,
          compliance_tags: this.getComplianceTags(action, resource)
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  private getComplianceTags(action: string, resource: string): string[] {
    const tags = [];
    
    if (action.includes('access') || action.includes('login')) {
      tags.push('GDPR', 'HIPAA');
    }
    
    if (action.includes('delete') || action.includes('modify')) {
      tags.push('SOX', 'GDPR');
    }
    
    if (resource === 'encryption' || resource === 'security') {
      tags.push('HIPAA', 'SOX');
    }
    
    return tags;
  }

  private async getCurrentIP(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return 'unknown';
    }
  }

  private getDefaultEncryptionSettings(): EncryptionSettings {
    return {
      algorithm: 'AES-256',
      key_rotation_days: 90,
      client_side_encryption: true,
      zero_knowledge_mode: false,
      hardware_security_module: false,
      custom_key_provider: false
    };
  }

  private getMockThreatAlerts(): ThreatAlert[] {
    return [
      {
        id: '1',
        type: 'unusual_location',
        severity: 'medium',
        title: 'Login from New Location',
        description: 'Login detected from an unusual geographic location',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        user_id: this.userId || '',
        status: 'investigating',
        actions_taken: ['notification_sent', 'mfa_required']
      },
      {
        id: '2',
        type: 'policy_violation',
        severity: 'low',
        title: 'Access Policy Violation',
        description: 'User attempted to access files outside business hours',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        status: 'resolved',
        actions_taken: ['access_denied', 'user_notified']
      }
    ];
  }

  private getMockAccessPolicies(): AccessPolicy[] {
    return [
      {
        id: '1',
        name: 'Business Hours Only',
        description: 'Restrict access to business hours (9 AM - 6 PM)',
        rules: {
          time_restrictions: {
            start_time: '09:00',
            end_time: '18:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
          },
          mfa_required: false,
          session_timeout: 480
        },
        applies_to: 'all',
        priority: 1,
        active: false
      },
      {
        id: '2',
        name: 'High Security Files',
        description: 'Extra security for sensitive files',
        rules: {
          mfa_required: true,
          session_timeout: 60,
          device_restrictions: ['trusted_devices_only']
        },
        applies_to: 'specific_users',
        target_users: [this.userId || ''],
        priority: 10,
        active: true
      }
    ];
  }

  // Public methods for event tracking
  async trackLogin(success: boolean, ipAddress: string) {
    await this.logSecurityEvent({
      event_type: 'login_attempt',
      ip_address: ipAddress,
      user_agent: navigator.userAgent,
      metadata: { success },
      risk_level: success ? 'low' : 'medium',
      status: success ? 'success' : 'failed'
    });
  }

  async trackFileAccess(fileName: string, action: 'view' | 'download' | 'upload' | 'delete') {
    await this.logSecurityEvent({
      event_type: 'file_access',
      ip_address: await this.getCurrentIP(),
      user_agent: navigator.userAgent,
      metadata: { fileName, action },
      risk_level: action === 'delete' ? 'medium' : 'low',
      status: 'success'
    });
  }

  async trackPermissionChange(resource: string, oldPermissions: any, newPermissions: any) {
    await this.logSecurityEvent({
      event_type: 'permission_change',
      ip_address: await this.getCurrentIP(),
      user_agent: navigator.userAgent,
      metadata: { resource, oldPermissions, newPermissions },
      risk_level: 'medium',
      status: 'success'
    });
  }
}

export const securityService = new SecurityService();
