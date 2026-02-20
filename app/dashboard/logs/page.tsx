'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Download, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface NotificationLog {
  id: string;
  requestId: string;
  channel: string;
  status: 'SENT' | 'FAILED' | 'PENDING' | 'RETRYING';
  retryAttempt: number;
  latencyMs: number;
  errorMessage?: string;
  createdAt: string;
}

export default function NotificationLogsPage() {
  const { tenantId } = useAuth();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [filterStatus, searchTerm]);

  const fetchLogs = async () => {
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

      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.append('status', filterStatus);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`http://localhost:8080/v1/admin/logs?${params.toString()}`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badgeMap: Record<string, { variant: any; label: string }> = {
      SENT: { variant: 'default', label: 'Sent' },
      FAILED: { variant: 'destructive', label: 'Failed' },
      PENDING: { variant: 'secondary', label: 'Pending' },
      RETRYING: { variant: 'outline', label: 'Retrying' },
    };
    const { variant, label } = badgeMap[status] || { variant: 'outline', label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getChannelColor = (channel: string) => {
    const colorMap: Record<string, string> = {
      EMAIL: 'text-blue-400',
      SMS: 'text-green-400',
      PUSH: 'text-purple-400',
      WEBHOOK: 'text-orange-400',
    };
    return colorMap[channel] || 'text-slate-400';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Notification Logs</h1>
        <p className="text-slate-400">Real-time delivery tracking and debugging</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-500" size={18} />
          <Input
            placeholder="Search by request ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-white text-sm"
        >
          <option value="ALL">All Status</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
          <option value="RETRYING">Retrying</option>
        </select>

        <div className="flex gap-2">
          <Button
            onClick={fetchLogs}
            variant="outline"
            className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Download size={16} className="mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Logs Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Recent Logs</CardTitle>
          <CardDescription>Last 100 notification deliveries</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No logs found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-slate-800/50">
                    <TableHead className="text-slate-400">Request ID</TableHead>
                    <TableHead className="text-slate-400">Channel</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Attempt</TableHead>
                    <TableHead className="text-slate-400">Latency</TableHead>
                    <TableHead className="text-slate-400">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm text-slate-300">
                        {log.requestId.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${getChannelColor(log.channel)}`}>
                          {log.channel}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="text-slate-400">{log.retryAttempt}</TableCell>
                      <TableCell className="text-slate-400">{log.latencyMs}ms</TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
