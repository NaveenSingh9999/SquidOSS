
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Camera, Image } from '@/lib/icon-map';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

const MediaBackupSettings = () => {
  const { toast } = useToast();
  const [autoBackup, setAutoBackup] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [folderAccess, setFolderAccess] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<Date | null>(null);

  // Simulate checking if we have permissions
  useEffect(() => {
    // In a real app, we would check if we actually have permissions
    const checkPermissions = async () => {
      // This would be an actual permissions check in a real app
      const hasPermissions = localStorage.getItem('mediaBackupPermissions') === 'granted';
      setFolderAccess(hasPermissions);
    };
    
    checkPermissions();
  }, []);

  // Toggle auto backup
  const handleAutoBackupToggle = (checked: boolean) => {
    if (checked && !folderAccess) {
      requestFolderAccess();
    } else {
      setAutoBackup(checked);
      // Save to local storage or app settings
      localStorage.setItem('mediaBackupEnabled', checked ? 'true' : 'false');
      
      toast({
        title: checked ? "Auto backup enabled" : "Auto backup disabled",
        description: checked 
          ? "Your photos will be automatically backed up" 
          : "Auto backup has been turned off",
      });
    }
  };

  // Toggle WiFi only setting
  const handleWifiOnlyToggle = (checked: boolean) => {
    setWifiOnly(checked);
    // Save to local storage or app settings
    localStorage.setItem('mediaBackupWifiOnly', checked ? 'true' : 'false');
    
    toast({
      title: "Settings updated",
      description: checked 
        ? "Photos will only backup on WiFi" 
        : "Photos will backup on any connection",
    });
  };

  // Request permission to access media folder
  const requestFolderAccess = async () => {
    try {
      // In a real app, this would use Capacitor plugins to request permissions
      // For this demo, we'll simulate permission granting
      
      // Simulate a successful permission grant
      localStorage.setItem('mediaBackupPermissions', 'granted');
      setFolderAccess(true);
      setAutoBackup(true);
      
      // Set a fake last backup date to now
      const now = new Date();
      setLastBackupDate(now);
      
      toast({
        title: "Access granted",
        description: "SquidCloud can now back up your media",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Permission denied",
        description: "SquidCloud needs access to back up your photos",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media Backup</CardTitle>
        <CardDescription>Control how your photos and videos are backed up</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Auto Backup</Label>
            <p className="text-sm text-muted-foreground">
              Automatically back up photos and videos
            </p>
          </div>
          <Switch
            checked={autoBackup}
            onCheckedChange={handleAutoBackupToggle}
          />
        </div>
        
        <Separator />
        
        {autoBackup && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">WiFi Only</Label>
              <p className="text-sm text-muted-foreground">
                Only back up when connected to WiFi
              </p>
            </div>
            <Switch
              checked={wifiOnly}
              onCheckedChange={handleWifiOnlyToggle}
            />
          </div>
        )}
        
        {autoBackup && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Content: 
                  <Badge variant="secondary" className="ml-2">Photos</Badge>
                  <Badge variant="secondary" className="ml-1">Videos</Badge>
                </span>
              </div>
              
              {lastBackupDate && (
                <div className="flex items-center space-x-2">
                  <Image className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Last backup: {lastBackupDate.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        
        {!folderAccess && (
          <div className="mt-4">
            <Badge variant="outline" className="text-amber-500 border-amber-500">
              Permission needed
            </Badge>
            <p className="text-sm text-muted-foreground mt-1">
              SquidCloud needs access to your media to enable automatic backup
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MediaBackupSettings;
