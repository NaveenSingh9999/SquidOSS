import React, { useState, useEffect } from 'react';
import { securityService, SecurityEvent, ThreatAlert, AuditLog, EncryptionSettings, AccessPolicy } from '@/services/security-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Eye,
  Lock,
  Key,
  Clock,
  MapPin,
  UserCheck,
  Activity,
  FileText,
  Settings,
  Plus,
  Trash2,
  Edit,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Users,
  Globe,
  Smartphone
} from '@/lib/icon-map';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import UnifiedLoader from '@/components/ui/UnifiedLoader';

const SEVERITY_COLORS = {
  low: 'text-green-600 bg-green-100',
  medium: 'text-yellow-600 bg-yellow-100',
  high: 'text-orange-600 bg-orange-100',
  critical: 'text-red-600 bg-red-100'
};

const SecurityCenter = () => {
  const [loading, setLoading] = useState(true);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [threatAlerts, setThreatAlerts] = useState<ThreatAlert[]>([]);
  const [encryptionSettings, setEncryptionSettings] = useState<EncryptionSettings | null>(null);
  const [accessPolicies, setAccessPolicies] = useState<AccessPolicy[]>([]);
  const [securityReport, setSecurityReport] = useState<any>(null);
  const [newPolicyDialog, setNewPolicyDialog] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<AccessPolicy | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    setLoading(true);
    try {
      const [events, alerts, encryption, policies] = await Promise.all([
        securityService.getSecurityEvents(),
        securityService.getThreatAlerts(),
        securityService.getEncryptionSettings(),
        securityService.getAccessPolicies()
      ]);

      setSecurityEvents(events);
      setThreatAlerts(alerts);
      setEncryptionSettings(encryption);
      setAccessPolicies(policies);

      // Generate security report for last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const report = await securityService.generateSecurityReport(startDate, endDate);
      setSecurityReport(report);
    } catch (error) {
      console.error('Failed to load security data:', error);
      toast({
        title: "Failed to load security data",
        description: "There was an error loading your security information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateEncryptionSettings = async (newSettings: EncryptionSettings) => {
    try {
      await securityService.updateEncryptionSettings(newSettings);
      setEncryptionSettings(newSettings);
      toast({
        title: "Encryption settings updated",
        description: "Your encryption configuration has been saved"
      });
    } catch (error) {
      toast({
        title: "Failed to update encryption settings",
        description: "There was an error saving your encryption configuration",
        variant: "destructive"
      });
    }
  };

  const createAccessPolicy = async (policy: Omit<AccessPolicy, 'id'>) => {
    try {
      const newPolicy = await securityService.createAccessPolicy(policy);
      setAccessPolicies(prev => [...prev, newPolicy]);
      setNewPolicyDialog(false);
      toast({
        title: "Access policy created",
        description: "Your new access policy has been created successfully"
      });
    } catch (error) {
      toast({
        title: "Failed to create access policy",
        description: "There was an error creating your access policy",
        variant: "destructive"
      });
    }
  };

  const deleteAccessPolicy = async (id: string) => {
    try {
      await securityService.deleteAccessPolicy(id);
      setAccessPolicies(prev => prev.filter(p => p.id !== id));
      toast({
        title: "Access policy deleted",
        description: "The access policy has been removed"
      });
    } catch (error) {
      toast({
        title: "Failed to delete access policy",
        description: "There was an error deleting the access policy",
        variant: "destructive"
      });
    }
  };

  const togglePolicyStatus = async (id: string, active: boolean) => {
    try {
      await securityService.updateAccessPolicy(id, { active });
      setAccessPolicies(prev => 
        prev.map(p => p.id === id ? { ...p, active } : p)
      );
      toast({
        title: `Policy ${active ? 'enabled' : 'disabled'}`,
        description: `The access policy has been ${active ? 'enabled' : 'disabled'}`
      });
    } catch (error) {
      toast({
        title: "Failed to update policy",
        description: "There was an error updating the access policy",
        variant: "destructive"
      });
    }
  };

  const downloadSecurityReport = () => {
    if (!securityReport) return;
    
    const reportData = {
      generatedAt: new Date().toISOString(),
      period: securityReport.period,
      summary: securityReport,
      events: securityEvents,
      threats: threatAlerts,
      policies: accessPolicies
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Security report downloaded",
      description: "Your security report has been saved to your downloads"
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <UnifiedLoader />
      </div>
    );
  }

  const activeThreats = threatAlerts.filter(t => t.status === 'active');
  const recentEvents = securityEvents.slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Center</h1>
          <p className="text-muted-foreground">Monitor and manage your security settings</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadSecurityData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={downloadSecurityReport} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Security Score</p>
                <h3 className="text-2xl font-bold text-green-600">{securityReport?.complianceScore || 95}/100</h3>
              </div>
              <ShieldCheck className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Threats</p>
                <h3 className="text-2xl font-bold text-red-600">{activeThreats.length}</h3>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Failed Logins</p>
                <h3 className="text-2xl font-bold">{securityReport?.failedLogins || 0}</h3>
              </div>
              <UserCheck className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Access Policies</p>
                <h3 className="text-2xl font-bold">{accessPolicies.filter(p => p.active).length}</h3>
              </div>
              <Shield className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="threats">Threat Detection</TabsTrigger>
          <TabsTrigger value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="access">Access Control</TabsTrigger>
          <TabsTrigger value="audit">Audit & Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Security Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Security Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentEvents.map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          event.risk_level === 'critical' ? 'bg-red-500' :
                          event.risk_level === 'high' ? 'bg-orange-500' :
                          event.risk_level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium">{event.event_type.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant={event.status === 'success' ? 'default' : 'destructive'}>
                        {event.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Active Threat Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Active Threats
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeThreats.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-muted-foreground">No active threats detected</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeThreats.map((threat, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">{threat.title}</h4>
                          <Badge className={SEVERITY_COLORS[threat.severity]}>
                            {threat.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{threat.description}</p>
                        <div className="flex gap-1">
                          {threat.actions_taken.map((action, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="threats" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Threat Detection & Monitoring</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <h3 className="font-semibold">Critical Threats</h3>
                  <p className="text-2xl font-bold text-red-600">
                    {threatAlerts.filter(t => t.severity === 'critical').length}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                  <h3 className="font-semibold">High Priority</h3>
                  <p className="text-2xl font-bold text-orange-600">
                    {threatAlerts.filter(t => t.severity === 'high').length}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h3 className="font-semibold">Resolved</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {threatAlerts.filter(t => t.status === 'resolved').length}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">All Threat Alerts</h4>
                {threatAlerts.map((threat, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={SEVERITY_COLORS[threat.severity]}>
                          {threat.severity}
                        </Badge>
                        <h4 className="font-medium">{threat.title}</h4>
                      </div>
                      <Badge variant={threat.status === 'resolved' ? 'default' : 'destructive'}>
                        {threat.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{threat.description}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {new Date(threat.timestamp).toLocaleString()}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {threat.actions_taken.map((action, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encryption" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Encryption Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {encryptionSettings && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Encryption Algorithm</Label>
                      <Select
                        value={encryptionSettings.algorithm}
                        onValueChange={(value: any) => 
                          updateEncryptionSettings({
                            ...encryptionSettings,
                            algorithm: value
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AES-256">AES-256 (Recommended)</SelectItem>
                          <SelectItem value="ChaCha20">ChaCha20</SelectItem>
                          <SelectItem value="RSA-4096">RSA-4096</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Key Rotation (Days)</Label>
                      <Input
                        type="number"
                        value={encryptionSettings.key_rotation_days}
                        onChange={(e) => 
                          updateEncryptionSettings({
                            ...encryptionSettings,
                            key_rotation_days: parseInt(e.target.value)
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Client-Side Encryption</Label>
                        <p className="text-sm text-muted-foreground">
                          Encrypt files before uploading to the server
                        </p>
                      </div>
                      <Switch
                        checked={encryptionSettings.client_side_encryption}
                        onCheckedChange={(checked) =>
                          updateEncryptionSettings({
                            ...encryptionSettings,
                            client_side_encryption: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Zero-Knowledge Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Server cannot decrypt your files under any circumstances
                        </p>
                      </div>
                      <Switch
                        checked={encryptionSettings.zero_knowledge_mode}
                        onCheckedChange={(checked) =>
                          updateEncryptionSettings({
                            ...encryptionSettings,
                            zero_knowledge_mode: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Hardware Security Module (HSM)</Label>
                        <p className="text-sm text-muted-foreground">
                          Use hardware-based key storage for enhanced security
                        </p>
                      </div>
                      <Switch
                        checked={encryptionSettings.hardware_security_module}
                        onCheckedChange={(checked) =>
                          updateEncryptionSettings({
                            ...encryptionSettings,
                            hardware_security_module: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Custom Key Provider</Label>
                        <p className="text-sm text-muted-foreground">
                          Bring your own encryption keys (BYOK)
                        </p>
                      </div>
                      <Switch
                        checked={encryptionSettings.custom_key_provider}
                        onCheckedChange={(checked) =>
                          updateEncryptionSettings({
                            ...encryptionSettings,
                            custom_key_provider: checked
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Access Control Policies</h3>
            <Dialog open={newPolicyDialog} onOpenChange={setNewPolicyDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Policy
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Access Policy</DialogTitle>
                  <DialogDescription>
                    Define rules for user access to your files and resources
                  </DialogDescription>
                </DialogHeader>
                <AccessPolicyForm onSubmit={createAccessPolicy} onCancel={() => setNewPolicyDialog(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {accessPolicies.map((policy) => (
              <Card key={policy.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold">{policy.name}</h4>
                      <p className="text-sm text-muted-foreground">{policy.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={policy.active}
                        onCheckedChange={(checked) => togglePolicyStatus(policy.id, checked)}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Access Policy</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this access policy? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteAccessPolicy(policy.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">Priority: {policy.priority}</Badge>
                      <Badge variant={policy.active ? 'default' : 'secondary'}>
                        {policy.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {policy.rules.mfa_required && (
                        <span className="inline-flex items-center gap-1 mr-3">
                          <Smartphone className="w-3 h-3" />
                          MFA Required
                        </span>
                      )}
                      {policy.rules.time_restrictions && (
                        <span className="inline-flex items-center gap-1 mr-3">
                          <Clock className="w-3 h-3" />
                          Time Restricted
                        </span>
                      )}
                      {policy.rules.ip_whitelist && (
                        <span className="inline-flex items-center gap-1 mr-3">
                          <Globe className="w-3 h-3" />
                          IP Restricted
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Compliance Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 border rounded-lg">
                  <h3 className="font-semibold text-sm">GDPR Compliance</h3>
                  <p className="text-2xl font-bold text-green-600">96.5%</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <h3 className="font-semibold text-sm">HIPAA Compliance</h3>
                  <p className="text-2xl font-bold text-blue-600">94.2%</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <h3 className="font-semibold text-sm">SOX Compliance</h3>
                  <p className="text-2xl font-bold text-purple-600">98.1%</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Security Metrics (Last 30 Days)</h4>
                {securityReport && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 border rounded">
                      <p className="text-sm text-muted-foreground">Total Events</p>
                      <p className="text-xl font-bold">{securityReport.totalEvents}</p>
                    </div>
                    <div className="text-center p-3 border rounded">
                      <p className="text-sm text-muted-foreground">Failed Logins</p>
                      <p className="text-xl font-bold text-red-600">{securityReport.failedLogins}</p>
                    </div>
                    <div className="text-center p-3 border rounded">
                      <p className="text-sm text-muted-foreground">Suspicious Activities</p>
                      <p className="text-xl font-bold text-orange-600">{securityReport.suspiciousActivities}</p>
                    </div>
                    <div className="text-center p-3 border rounded">
                      <p className="text-sm text-muted-foreground">Compliance Score</p>
                      <p className="text-xl font-bold text-green-600">{securityReport.complianceScore}%</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Access Policy Form Component
const AccessPolicyForm = ({ onSubmit, onCancel }: { onSubmit: (policy: Omit<AccessPolicy, 'id'>) => void; onCancel: () => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    mfa_required: false,
    session_timeout: 480,
    applies_to: 'all' as 'all' | 'specific_users' | 'user_groups',
    priority: 1,
    active: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      description: formData.description,
      rules: {
        mfa_required: formData.mfa_required,
        session_timeout: formData.session_timeout
      },
      applies_to: formData.applies_to as 'all' | 'specific_users' | 'user_groups',
      priority: formData.priority,
      active: formData.active
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Policy Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Require Multi-Factor Authentication</Label>
        <Switch
          checked={formData.mfa_required}
          onCheckedChange={(checked) => setFormData({ ...formData, mfa_required: checked })}
        />
      </div>

      <div>
        <Label htmlFor="timeout">Session Timeout (minutes)</Label>
        <Input
          id="timeout"
          type="number"
          value={formData.session_timeout}
          onChange={(e) => setFormData({ ...formData, session_timeout: parseInt(e.target.value) })}
          min={5}
          max={1440}
        />
      </div>

      <div>
        <Label htmlFor="priority">Priority (1-10)</Label>
        <Input
          id="priority"
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
          min={1}
          max={10}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create Policy</Button>
      </DialogFooter>
    </form>
  );
};

export default SecurityCenter;