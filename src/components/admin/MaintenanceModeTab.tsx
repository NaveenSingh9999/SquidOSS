import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Shield, Power, PowerOff } from '@/lib/icon-map';
import { useMaintenanceMode } from '@/hooks/use-maintenance-mode';
import { toast } from 'sonner';

const MaintenanceModeTab = () => {
  const { maintenanceMode, loading, updateMaintenanceMode } = useMaintenanceMode();
  const [message, setMessage] = useState(maintenanceMode.message);
  const [updating, setUpdating] = useState(false);

  const handleToggleMaintenance = async (enabled: boolean) => {
    setUpdating(true);
    
    const success = await updateMaintenanceMode(enabled, message);
    
    if (success) {
      toast.success(
        enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
        {
          description: enabled 
            ? 'Users will see the maintenance message' 
            : 'Users can access the system normally'
        }
      );
    } else {
      toast.error('Failed to update maintenance mode');
    }
    
    setUpdating(false);
  };

  const handleUpdateMessage = async () => {
    setUpdating(true);
    
    const success = await updateMaintenanceMode(maintenanceMode.enabled, message);
    
    if (success) {
      toast.success('Maintenance message updated');
    } else {
      toast.error('Failed to update message');
    }
    
    setUpdating(false);
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Maintenance Mode Control
          </CardTitle>
          <CardDescription>
            Enable maintenance mode to restrict user access during system updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Alert */}
          <Alert variant={maintenanceMode.enabled ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {maintenanceMode.enabled 
                ? '⚠️ Maintenance mode is ACTIVE - Users cannot upload, download, or access files'
                : '✓ System is operational - All features are available to users'}
            </AlertDescription>
          </Alert>

          {/* Toggle Switch */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {maintenanceMode.enabled ? (
                  <PowerOff className="h-5 w-5 text-destructive" />
                ) : (
                  <Power className="h-5 w-5 text-green-500" />
                )}
                <Label htmlFor="maintenance-toggle" className="text-base font-semibold">
                  {maintenanceMode.enabled ? 'Maintenance Mode Active' : 'System Operational'}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Toggle to enable or disable maintenance mode
              </p>
            </div>
            <Switch
              id="maintenance-toggle"
              checked={maintenanceMode.enabled}
              onCheckedChange={handleToggleMaintenance}
              disabled={updating}
            />
          </div>

          {/* Message Editor */}
          <div className="space-y-2">
            <Label htmlFor="maintenance-message">Maintenance Message</Label>
            <Textarea
              id="maintenance-message"
              placeholder="Enter the message users will see during maintenance..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={updating}
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                This message will be displayed to users when maintenance mode is active
              </p>
              <Button
                onClick={handleUpdateMessage}
                disabled={updating || message === maintenanceMode.message}
                size="sm"
              >
                Update Message
              </Button>
            </div>
          </div>

          {/* Effects List */}
          <div className="space-y-2">
            <Label>When Maintenance Mode is Active:</Label>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Red alert banner appears at the top of all pages</li>
              <li>File uploads are disabled</li>
              <li>File downloads are disabled</li>
              <li>Database write operations are restricted</li>
              <li>Only administrators can access the system</li>
              <li>API endpoints return maintenance status</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common maintenance tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setMessage('🔧 System maintenance in progress. We\'ll be back shortly!');
            }}
          >
            Use Default Message
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setMessage('⚙️ Scheduled maintenance: ' + new Date().toLocaleString());
            }}
          >
            Add Timestamp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenanceModeTab;
