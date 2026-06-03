import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Monitor, Smartphone, Download, ArrowRight, CheckCircle2, AlertTriangle } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AppUpdate {
  id: string;
  platform: string;
  version: string;
  download_url: string;
  release_notes?: string;
  release_date: string;
  is_critical: boolean;
}

const AppUpdatePage = () => {
  const [searchParams] = useSearchParams();
  const platform = searchParams.get('platform') || 'windows';
  const { toast } = useToast();
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.functions.invoke('get-app-updates', {
          body: { platform },
        });
        
        if (error) throw error;
        
        setUpdates(data || []);
      } catch (error: any) {
        console.error('Error fetching updates:', error);
        toast({
          title: "Failed to load updates",
          description: error.message || "Please try again later",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchUpdates();
  }, [platform, toast]);

  const getPlatformIcon = (platform: string) => {
    switch(platform) {
      case 'windows': return <Monitor className="h-6 w-6" />;
      case 'android': return <Smartphone className="h-6 w-6" />;
      default: return <Monitor className="h-6 w-6" />;
    }
  };

  const getPlatformName = (platform: string) => {
    switch(platform) {
      case 'windows': return 'Windows';
      case 'android': return 'Android';
      default: return 'Unknown';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">SquidCloud Updates</h1>
          <p className="text-muted-foreground">Download the latest desktop and mobile app updates</p>
        </div>
      </div>
      
      <div className="flex space-x-2 mb-6">
        <Button 
          variant={platform === 'windows' ? 'default' : 'outline'} 
          onClick={() => window.location.href = '/app/updates?platform=windows'}
          size="sm"
        >
          <Monitor className="mr-1 h-4 w-4" />
          Windows
        </Button>
        <Button 
          variant={platform === 'android' ? 'default' : 'outline'} 
          onClick={() => window.location.href = '/app/updates?platform=android'}
          size="sm"
        >
          <Smartphone className="mr-1 h-4 w-4" />
          Android
        </Button>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center space-x-2">
            {getPlatformIcon(platform)}
            <CardTitle>{getPlatformName(platform)} Updates</CardTitle>
          </div>
          <CardDescription>
            Download and install the latest version of SquidCloud for {getPlatformName(platform)}
          </CardDescription>
        </CardHeader>
      </Card>
      
      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Loading updates...</p>
          </div>
        </div>
      ) : updates.length > 0 ? (
        <div className="space-y-6">
          {updates.map((update) => (
            <Card key={update.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      Version {update.version}
                      {update.is_critical && (
                        <Badge variant="destructive" className="ml-2">
                          Critical Update
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Released on {formatDate(update.release_date)}
                    </CardDescription>
                  </div>
                  <Button asChild>
                    <a href={update.download_url} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {update.is_critical && (
                  <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 flex items-start">
                    <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Important security update</p>
                      <p className="text-sm">This update contains important security fixes. Please update as soon as possible.</p>
                    </div>
                  </div>
                )}
                
                <div className="text-sm">
                  {update.release_notes ? (
                    <div className="prose prose-sm max-w-none">
                      {update.release_notes.split('\n').map((note, i) => (
                        <p key={i}>{note}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No release notes available.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <div className="rounded-full bg-primary/10 p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">You're up to date!</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              There are currently no updates available for {getPlatformName(platform)} users.
            </p>
            <div className="flex justify-center space-x-4">
              <Button variant="outline" asChild>
                <a href="/dashboard">
                  Back to Dashboard
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AppUpdatePage;
