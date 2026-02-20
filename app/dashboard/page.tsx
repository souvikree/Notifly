'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, AlertCircle, CheckCircle2, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

interface Metrics {
  totalNotifications: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingNotifications: number;
  averageLatency: number;
  successRate: number;
  retryAttempts: number;
  channelMetrics: {
    email: { sent: number; failed: number };
    sms: { sent: number; failed: number };
    push: { sent: number; failed: number };
  };
}

interface TimeSeriesData {
  timestamp: string;
  delivered: number;
  failed: number;
  pending: number;
}

/**
 * NOTIFLY Dashboard - Real-time metrics and monitoring
 * Shows notification delivery status, channel performance, and system health
 */
export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    // Poll every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      const authMode = localStorage.getItem('auth_mode');
      if (authMode === 'jwt') {
        const token = localStorage.getItem('jwt_token');
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        const apiKey = localStorage.getItem('api_key');
        headers['X-API-Key'] = apiKey || '';
      }

      const response = await fetch('http://localhost:8080/v1/admin/metrics', {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
        setTimeSeries(data.timeSeries);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading metrics...</div>
      </div>
    );
  }

  const channelData = [
    { name: 'Email', sent: metrics.channelMetrics.email.sent, failed: metrics.channelMetrics.email.failed },
    { name: 'SMS', sent: metrics.channelMetrics.sms.sent, failed: metrics.channelMetrics.sms.failed },
    { name: 'Push', sent: metrics.channelMetrics.push.sent, failed: metrics.channelMetrics.push.failed },
  ];

  const deliveryStatus = [
    { name: 'Successful', value: metrics.successfulDeliveries, color: '#10b981' },
    { name: 'Failed', value: metrics.failedDeliveries, color: '#ef4444' },
    { name: 'Pending', value: metrics.pendingNotifications, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-slate-400">Real-time notification metrics and delivery status</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Activity className="text-indigo-500" size={16} />
              Total Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.totalNotifications.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="text-green-500" size={16} />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.successRate.toFixed(1)}%</div>
            <p className="text-xs text-slate-500 mt-1">{metrics.successfulDeliveries.toLocaleString()} delivered</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={16} />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.failedDeliveries.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">In DLQ or retrying</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Clock className="text-blue-500" size={16} />
              Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.averageLatency.toFixed(0)}ms</div>
            <p className="text-xs text-slate-500 mt-1">P50 delivery time</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="status">Status Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle>Delivery Timeline (24h)</CardTitle>
              <CardDescription>Notifications delivered, failed, and pending over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timestamp" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                  <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2} name="Delivered" />
                  <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="Failed" />
                  <Line type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={2} name="Pending" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle>Channel Performance</CardTitle>
              <CardDescription>Delivery success by notification channel</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={channelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                  <Bar dataKey="sent" fill="#10b981" name="Sent" />
                  <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle>Delivery Status Distribution</CardTitle>
              <CardDescription>Breakdown of all notifications by status</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={deliveryStatus} dataKey="value" cx="50%" cy="50%" outerRadius={80} label>
                    {deliveryStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {deliveryStatus.map((item) => (
                  <div key={item.name} className="flex justify-between text-sm">
                    <span className="text-slate-400">{item.name}</span>
                    <span className="text-white font-medium">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* System Health */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-500" size={18} />
                <span className="text-slate-300">API Gateway</span>
              </div>
              <span className="text-green-400 text-sm font-medium">Operational</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-500" size={18} />
                <span className="text-slate-300">Kafka Consumer</span>
              </div>
              <span className="text-green-400 text-sm font-medium">Healthy</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-500" size={18} />
                <span className="text-slate-300">PostgreSQL</span>
              </div>
              <span className="text-green-400 text-sm font-medium">Connected</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

