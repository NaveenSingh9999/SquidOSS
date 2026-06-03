
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, AlertCircle, XCircle, Clock } from '@/lib/icon-map';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'maintenance';
  uptime: number;
  responseTime: number;
  lastChecked: string;
  endpoint: string;
}

const APIStatus = () => {
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: 'File Upload API',
      status: 'operational',
      uptime: 99.9,
      responseTime: 245,
      lastChecked: new Date().toISOString(),
      endpoint: '/cc/ap/iops/v6/upload'
    },
    {
      name: 'File Download API',
      status: 'operational',
      uptime: 99.8,
      responseTime: 180,
      lastChecked: new Date().toISOString(),
      endpoint: '/cc/ap/iops/v6/download'
    },
    {
      name: 'File Delete API',
      status: 'operational',
      uptime: 99.9,
      responseTime: 120,
      lastChecked: new Date().toISOString(),
      endpoint: '/cc/ap/iops/v6/delete'
    },
    {
      name: 'File Info API',
      status: 'operational',
      uptime: 99.7,
      responseTime: 95,
      lastChecked: new Date().toISOString(),
      endpoint: '/cc/ap/iops/v6/info'
    },
    {
      name: 'Authentication API',
      status: 'operational',
      uptime: 99.9,
      responseTime: 150,
      lastChecked: new Date().toISOString(),
      endpoint: '/cc/ap/iops/v6/auth'
    },
    {
      name: 'Storage API',
      status: 'operational',
      uptime: 99.8,
      responseTime: 200,
      lastChecked: new Date().toISOString(),
      endpoint: '/cc/ap/iops/v6/storage'
    }
  ]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const refreshStatus = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update services with random variations for demo
    setServices(prev => prev.map(service => ({
      ...service,
      responseTime: service.responseTime + Math.floor(Math.random() * 50 - 25),
      uptime: Math.max(95, service.uptime + (Math.random() * 0.2 - 0.1)),
      lastChecked: new Date().toISOString()
    })));
    
    setLastUpdate(new Date());
    setIsRefreshing(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'down':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'maintenance':
        return <Clock className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      operational: 'default',
      degraded: 'secondary',
      down: 'destructive',
      maintenance: 'outline'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const overallStatus = services.every(s => s.status === 'operational') 
    ? 'All Systems Operational' 
    : services.some(s => s.status === 'down')
    ? 'Major Outage'
    : 'Partial Outage';

  const averageUptime = services.reduce((acc, s) => acc + s.uptime, 0) / services.length;
  const averageResponseTime = services.reduce((acc, s) => acc + s.responseTime, 0) / services.length;

  useEffect(() => {
    const interval = setInterval(refreshStatus, 30000); // Auto-refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">SquidCloud API Status</h1>
              <p className="text-muted-foreground">
                Real-time status of all SquidCloud API services
              </p>
            </div>
            <Button 
              onClick={refreshStatus} 
              disabled={isRefreshing}
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Overall Status */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon('operational')}
                  <div>
                    <h2 className="text-xl font-semibold">{overallStatus}</h2>
                    <p className="text-sm text-muted-foreground">
                      Last updated: {lastUpdate.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-500">
                    {averageUptime.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Average Uptime</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Service Status Grid */}
        <div className="grid gap-6 mb-8">
          {services.map((service, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                  {getStatusBadge(service.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(service.status)}
                    <span className="text-sm font-medium">Status</span>
                  </div>
                  
                  <div>
                    <div className="text-lg font-semibold text-green-500">
                      {service.uptime.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Uptime (30d)</div>
                  </div>
                  
                  <div>
                    <div className="text-lg font-semibold">
                      {service.responseTime}ms
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Response</div>
                  </div>
                  
                  <div>
                    <div className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {service.endpoint}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Updated: {new Date(service.lastChecked).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Response Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(averageResponseTime)}ms
              </div>
              <p className="text-xs text-muted-foreground">
                Average across all services
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Incident Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">0</div>
              <p className="text-xs text-muted-foreground">
                Active incidents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scheduled Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">None</div>
              <p className="text-xs text-muted-foreground">
                Upcoming maintenance windows
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default APIStatus;
