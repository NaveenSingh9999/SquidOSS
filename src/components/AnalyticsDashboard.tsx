import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  HardDrive,
  Activity,
  Download,
  Upload,
  Eye,
  Share2,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Calendar,
  PieChart,
  LineChart,
  ArrowLeft,
  ChevronRight,
  Gauge,
  Server,
  Wifi
} from '@/lib/icon-map';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line
} from 'recharts';
import { analyticsService, StorageMetrics, ActivityMetrics, UserMetrics, PerformanceMetrics } from '@/services/analytics-service';
import { useToast } from '@/hooks/use-toast';
import UnifiedLoader from '@/components/ui/UnifiedLoader';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  className?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, icon, className = '' }) => (
  <Card className={`${className}`}>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-center space-x-2">
            <h3 className="text-2xl font-bold">{value}</h3>
            {change !== undefined && (
              <Badge variant={change >= 0 ? "default" : "destructive"} className="text-xs">
                {change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {Math.abs(change)}%
              </Badge>
            )}
          </div>
        </div>
        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [activityMetrics, setActivityMetrics] = useState<ActivityMetrics | null>(null);
  const [userMetrics, setUserMetrics] = useState<UserMetrics | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [storage, activity, user, performance] = await Promise.all([
        analyticsService.getStorageMetrics(),
        analyticsService.getActivityMetrics(),
        analyticsService.getUserMetrics(),
        analyticsService.getPerformanceMetrics()
      ]);

      setStorageMetrics(storage);
      setActivityMetrics(activity);
      setUserMetrics(user);
      setPerformanceMetrics(performance);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast({
        title: "Failed to load analytics",
        description: "There was an error loading your analytics data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalytics = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
    toast({
      title: "Analytics refreshed",
      description: "Your analytics data has been updated"
    });
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === -1) return 'Unlimited';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatPercentage = (value: number, total: number) => {
    if (total === -1) return 'N/A'; // Unlimited storage
    return total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <UnifiedLoader />
      </div>
    );
  }

  const storageUsageData = storageMetrics ? 
    storageMetrics.totalStorage === -1 ? 
      [{ name: 'Used', value: storageMetrics.usedStorage, color: '#0088FE' }] : // For unlimited, only show used
      [
        { name: 'Used', value: storageMetrics.usedStorage, color: '#0088FE' },
        { name: 'Available', value: storageMetrics.availableStorage, color: '#00C49F' }
      ] : [];

  const fileTypeData = storageMetrics ? 
    Object.entries(storageMetrics.fileTypes).map(([type, count]) => ({
      name: type,
      value: count
    })) : [];

  const storageByTypeData = storageMetrics ?
    Object.entries(storageMetrics.storageByType).map(([type, size]) => ({
      name: type,
      value: size,
      displayValue: formatBytes(size)
    })) : [];

  // Mobile UI
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] pb-24">
        {/* Mobile Header */}
        <div className="sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <div className="bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/5">
            <div className="px-4 py-3 flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-lg font-semibold text-white">Analytics</h1>
                <p className="text-xs text-white/50">Monitor your usage</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                onClick={refreshAnalytics}
                disabled={refreshing}
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Tab Navigation */}
            <div className="px-4 pb-3 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 min-w-max">
                {[
                  { value: 'overview', label: 'Overview', icon: BarChart3 },
                  { value: 'storage', label: 'Storage', icon: HardDrive },
                  { value: 'activity', label: 'Activity', icon: Activity },
                  { value: 'performance', label: 'Performance', icon: Gauge },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={`
                        flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                        transition-all duration-200 active:scale-95
                        ${isActive 
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-transparent'
                        }
                      `}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Hero Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-2xl p-4 border border-blue-500/20">
                  <BarChart3 className="h-5 w-5 text-blue-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{storageMetrics?.fileCount || 0}</div>
                  <div className="text-xs text-white/50">Total Files</div>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                    <span className="text-xs text-emerald-400">+12%</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl p-4 border border-purple-500/20">
                  <HardDrive className="h-5 w-5 text-purple-400 mb-2" />
                  <div className="text-xl font-bold text-white">{formatBytes(storageMetrics?.usedStorage || 0)}</div>
                  <div className="text-xs text-white/50">Storage Used</div>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                    <span className="text-xs text-emerald-400">+{storageMetrics?.storageGrowth || 0}%</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-2xl p-4 border border-emerald-500/20">
                  <Eye className="h-5 w-5 text-emerald-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{activityMetrics?.views || 0}</div>
                  <div className="text-xs text-white/50">Total Views</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 rounded-2xl p-4 border border-orange-500/20">
                  <Download className="h-5 w-5 text-orange-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{activityMetrics?.downloads || 0}</div>
                  <div className="text-xs text-white/50">Downloads</div>
                </div>
              </div>

              {/* Activity Chart */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" />
                  Activity Over Time
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={activityMetrics?.dailyActivity || []}>
                    <defs>
                      <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '12px' }}
                      labelStyle={{ color: '#ffffff80' }}
                    />
                    <Area type="monotone" dataKey="uploads" stroke="#3b82f6" fillOpacity={1} fill="url(#colorUploads)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Storage Distribution */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-purple-400" />
                  Storage
                </h3>
                {storageMetrics?.totalStorage === -1 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl font-bold text-white">{formatBytes(storageMetrics.usedStorage)}</div>
                    <div className="text-sm text-white/50 mt-1">Used Storage</div>
                    <Badge className="mt-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Unlimited</Badge>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={150}>
                    <RechartsPieChart>
                      <Pie
                        data={storageUsageData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {storageUsageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatBytes(value as number)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Storage Tab */}
          {activeTab === 'storage' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Storage Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
                  <div className="text-lg font-bold text-white">
                    {storageMetrics?.totalStorage === -1 ? '∞' : formatBytes(storageMetrics?.totalStorage || 0)}
                  </div>
                  <div className="text-xs text-white/50">Total</div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
                  <div className="text-lg font-bold text-blue-400">{formatBytes(storageMetrics?.usedStorage || 0)}</div>
                  <div className="text-xs text-white/50">Used</div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
                  <div className="text-lg font-bold text-emerald-400">
                    {storageMetrics?.availableStorage === -1 ? '∞' : formatBytes(storageMetrics?.availableStorage || 0)}
                  </div>
                  <div className="text-xs text-white/50">Free</div>
                </div>
              </div>

              {/* File Types */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">File Types</h3>
                <div className="space-y-3">
                  {fileTypeData.slice(0, 5).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-sm text-white/70 capitalize">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Storage by Type Chart */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">Storage by Type</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={storageByTypeData}>
                    <XAxis dataKey="name" tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} />
                    <YAxis tickFormatter={(value) => formatBytes(value)} tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} />
                    <Tooltip 
                      formatter={(value) => formatBytes(value as number)}
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '12px' }}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Activity Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-2xl p-4 border border-blue-500/20">
                  <Upload className="h-5 w-5 text-blue-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{activityMetrics?.uploads || 0}</div>
                  <div className="text-xs text-white/50">Uploads</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-2xl p-4 border border-emerald-500/20">
                  <Download className="h-5 w-5 text-emerald-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{activityMetrics?.downloads || 0}</div>
                  <div className="text-xs text-white/50">Downloads</div>
                </div>
                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl p-4 border border-purple-500/20">
                  <Share2 className="h-5 w-5 text-purple-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{activityMetrics?.shares || 0}</div>
                  <div className="text-xs text-white/50">Shares</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 rounded-2xl p-4 border border-orange-500/20">
                  <Eye className="h-5 w-5 text-orange-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{activityMetrics?.views || 0}</div>
                  <div className="text-xs text-white/50">Views</div>
                </div>
              </div>

              {/* Popular Files */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">Popular Files</h3>
                <div className="space-y-3">
                  {activityMetrics?.popularFiles.slice(0, 5).map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-black/20 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{file.name}</p>
                        <p className="text-xs text-white/50">
                          {file.views} views • {file.downloads} downloads
                        </p>
                      </div>
                      <Badge className="bg-white/10 text-white/70">{file.views + file.downloads}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Access Patterns */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">Access Patterns (24h)</h3>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={activityMetrics?.accessPatterns || []}>
                    <XAxis dataKey="hour" tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '12px' }}
                    />
                    <Bar dataKey="activity" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Performance Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-2xl p-4 border border-blue-500/20">
                  <Upload className="h-5 w-5 text-blue-400 mb-2" />
                  <div className="text-xl font-bold text-white">{performanceMetrics?.avgUploadSpeed || 0} MB/s</div>
                  <div className="text-xs text-white/50">Upload Speed</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-2xl p-4 border border-emerald-500/20">
                  <Download className="h-5 w-5 text-emerald-400 mb-2" />
                  <div className="text-xl font-bold text-white">{performanceMetrics?.avgDownloadSpeed || 0} MB/s</div>
                  <div className="text-xs text-white/50">Download Speed</div>
                </div>
                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-2xl p-4 border border-purple-500/20">
                  <Server className="h-5 w-5 text-purple-400 mb-2" />
                  <div className="text-xl font-bold text-white">{performanceMetrics?.uptime || 0}%</div>
                  <div className="text-xs text-white/50">Uptime</div>
                </div>
                <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-2xl p-4 border border-red-500/20">
                  <AlertTriangle className="h-5 w-5 text-red-400 mb-2" />
                  <div className="text-xl font-bold text-white">{performanceMetrics?.errorRate || 0}%</div>
                  <div className="text-xs text-white/50">Error Rate</div>
                </div>
              </div>

              {/* System Health */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-emerald-400" />
                  System Health
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Overall Status</span>
                    <Badge
                      className={`
                        ${performanceMetrics?.systemHealth === 'excellent' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          performanceMetrics?.systemHealth === 'good' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                          performanceMetrics?.systemHealth === 'fair' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                          'bg-red-500/20 text-red-400 border-red-500/30'}
                      `}
                    >
                      {performanceMetrics?.systemHealth || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Response Time</span>
                    <span className="text-sm font-medium text-white">{performanceMetrics?.responseTime || 0}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Uptime</span>
                    <span className="text-sm font-medium text-white">{performanceMetrics?.uptime || 0}%</span>
                  </div>
                </div>
              </div>

              {/* Bandwidth */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">Bandwidth Usage</h3>
                <ResponsiveContainer width="100%" height={150}>
                  <RechartsLineChart data={performanceMetrics?.bandwidthUsage || []}>
                    <XAxis dataKey="date" tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: '#ffffff50', fontSize: 10 }} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: '12px' }}
                    />
                    <Line type="monotone" dataKey="upload" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="download" stroke="#10b981" strokeWidth={2} dot={false} />
                  </RechartsLineChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-xs text-white/50">Upload</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-white/50">Download</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Storage Info */}
          <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <HardDrive className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-white">Unlimited Storage</h4>
                <p className="text-xs text-white/50 mt-1">
                  Your files are distributed across our server network with unlimited capacity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop UI
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Monitor your storage usage and activity patterns</p>
        </div>
        <Button
          onClick={refreshAnalytics}
          disabled={refreshing}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Overview Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Files"
              value={storageMetrics?.fileCount || 0}
              change={12}
              icon={<BarChart3 className="h-6 w-6 text-primary" />}
            />
            <MetricCard
              title="Storage Used"
              value={formatBytes(storageMetrics?.usedStorage || 0)}
              change={storageMetrics?.storageGrowth || 0}
              icon={<HardDrive className="h-6 w-6 text-primary" />}
            />
            <MetricCard
              title="Total Views"
              value={activityMetrics?.views || 0}
              change={8}
              icon={<Eye className="h-6 w-6 text-primary" />}
            />
            <MetricCard
              title="Downloads"
              value={activityMetrics?.downloads || 0}
              change={-3}
              icon={<Download className="h-6 w-6 text-primary" />}
            />
          </div>

          {/* Activity Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Activity Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={activityMetrics?.dailyActivity || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="uploads" stackId="1" stroke="#0088FE" fill="#0088FE" />
                    <Area type="monotone" dataKey="downloads" stackId="1" stroke="#00C49F" fill="#00C49F" />
                    <Area type="monotone" dataKey="views" stackId="1" stroke="#FFBB28" fill="#FFBB28" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Storage Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {storageMetrics?.totalStorage === -1 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] space-y-4">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">{formatBytes(storageMetrics.usedStorage)}</div>
                      <div className="text-lg text-muted-foreground">Used Storage</div>
                      <div className="text-sm text-green-600 font-medium mt-2">Unlimited Available</div>
                    </div>
                    <div className="w-full max-w-xs">
                      <div className="h-2 bg-gray-200 rounded-full">
                        <div className="h-2 bg-primary rounded-full w-1/4"></div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 text-center">
                        Distributed across our server network
                      </div>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={storageUsageData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {storageUsageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatBytes(value as number)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="storage" className="space-y-6">
          {/* Storage Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Total Storage"
              value={storageMetrics?.totalStorage === -1 ? "Unlimited" : formatBytes(storageMetrics?.totalStorage || 0)}
              icon={<HardDrive className="h-6 w-6 text-blue-500" />}
            />
            <MetricCard
              title="Used Storage"
              value={formatBytes(storageMetrics?.usedStorage || 0)}
              change={storageMetrics?.storageGrowth || 0}
              icon={<BarChart3 className="h-6 w-6 text-orange-500" />}
            />
            <MetricCard
              title="Available Storage"
              value={storageMetrics?.availableStorage === -1 ? "Unlimited" : formatBytes(storageMetrics?.availableStorage || 0)}
              icon={<CheckCircle className="h-6 w-6 text-green-500" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>File Types Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={fileTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {fileTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Storage by File Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={storageByTypeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(value) => formatBytes(value)} />
                    <Tooltip formatter={(value) => formatBytes(value as number)} />
                    <Bar dataKey="value" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          {/* Activity Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Uploads"
              value={activityMetrics?.uploads || 0}
              change={15}
              icon={<Upload className="h-6 w-6 text-blue-500" />}
            />
            <MetricCard
              title="Downloads"
              value={activityMetrics?.downloads || 0}
              change={-5}
              icon={<Download className="h-6 w-6 text-green-500" />}
            />
            <MetricCard
              title="Shares"
              value={activityMetrics?.shares || 0}
              change={22}
              icon={<Share2 className="h-6 w-6 text-purple-500" />}
            />
            <MetricCard
              title="Views"
              value={activityMetrics?.views || 0}
              change={8}
              icon={<Eye className="h-6 w-6 text-orange-500" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Access Patterns (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={activityMetrics?.accessPatterns || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="activity" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Popular Files</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activityMetrics?.popularFiles.slice(0, 5).map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.views} views • {file.downloads} downloads
                        </p>
                      </div>
                      <Badge variant="secondary">{file.views + file.downloads}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Avg Upload Speed"
              value={`${performanceMetrics?.avgUploadSpeed || 0} MB/s`}
              change={5}
              icon={<Upload className="h-6 w-6 text-blue-500" />}
            />
            <MetricCard
              title="Avg Download Speed"
              value={`${performanceMetrics?.avgDownloadSpeed || 0} MB/s`}
              change={8}
              icon={<Download className="h-6 w-6 text-green-500" />}
            />
            <MetricCard
              title="System Uptime"
              value={`${performanceMetrics?.uptime || 0}%`}
              icon={<CheckCircle className="h-6 w-6 text-green-500" />}
            />
            <MetricCard
              title="Error Rate"
              value={`${performanceMetrics?.errorRate || 0}%`}
              change={-12}
              icon={<AlertTriangle className="h-6 w-6 text-red-500" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Overall Health</span>
                  <Badge
                    variant={
                      performanceMetrics?.systemHealth === 'excellent' ? 'default' :
                      performanceMetrics?.systemHealth === 'good' ? 'secondary' :
                      performanceMetrics?.systemHealth === 'fair' ? 'outline' : 'destructive'
                    }
                  >
                    {performanceMetrics?.systemHealth || 'Unknown'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Response Time</span>
                  <span className="text-sm font-medium">{performanceMetrics?.responseTime || 0}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Uptime</span>
                  <span className="text-sm font-medium">{performanceMetrics?.uptime || 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Error Rate</span>
                  <span className="text-sm font-medium">{performanceMetrics?.errorRate || 0}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bandwidth Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsLineChart data={performanceMetrics?.bandwidthUsage || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="upload" stroke="#0088FE" strokeWidth={2} />
                    <Line type="monotone" dataKey="download" stroke="#00C49F" strokeWidth={2} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Storage Information Note */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <HardDrive className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">Storage Information</h4>
            <p className="text-sm text-blue-700 mt-1">
              Our storage repository has 150GB shared capacity, and using res54 and systems your capacity is unlimited as it is distributed across our servers, not a specific repo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;