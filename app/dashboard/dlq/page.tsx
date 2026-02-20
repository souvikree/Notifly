'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, RotateCcw, Trash2, Search, Eye } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface FailedNotification {
  id: string;
  requestId: string;
  channel: string;
  errorCode?: string;
  errorDetails?: any;
  createdAt: string;
  manualRetryCount: number;
}

export default function DlqPage() {
  const { tenantId } = useAuth();
  const [failed, setFailed] = useState<FailedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<FailedNotification | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    fetchFailedNotifications();
    const interval = setInterval(fetchFailedNotifications, 30000);
    return () => clearInterval(interval);
  }, [searchTerm]);

  const fetchFailedNotifications = async () => {
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
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`http://localhost:8080/v1/admin/dlq?${params.toString()}`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setFailed(data.failed);
      }
    } catch (err) {
      console.error('Failed to fetch DLQ:', err);
    } finally {
      setLoading(false);
    }
  };

  const retryNotification = async (notificationId: string) => {
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

      const response = await fetch(`http://localhost:8080/v1/admin/dlq/${notificationId}/retry`, {
        method: 'POST',
        headers,
      });

      if (response.ok) {
        await fetchFailedNotifications();
      }
    } catch (err) {
      console.error('Failed to retry notification:', err);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!confirm('Are you sure? This action cannot be undone.')) return;

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

      const response = await fetch(`http://localhost:8080/v1/admin/dlq/${notificationId}`, {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        await fetchFailedNotifications();
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dead Letter Queue</h1>
        <p className="text-slate-400">Failed notifications that need manual intervention</p>
      </div>

      {/* Warning Alert */}
      <Alert className="bg-red-900/20 border-red-800">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <AlertDescription className="text-red-300">
          The Dead Letter Queue contains notifications that failed after all retry attempts. Review and retry or delete them.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-500" size={18} />
          <Input
            placeholder="Search by request ID or error..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>

        <Button
          onClick={fetchFailedNotifications}
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </Button>
      </div>

      {/* DLQ Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="text-red-400" size={24} />
            Failed Notifications
          </CardTitle>
          <CardDescription>{failed.length} items in queue</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : failed.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No failed notifications. Your system is healthy!</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-slate-800/50">
                    <TableHead className="text-slate-400">Request ID</TableHead>
                    <TableHead className="text-slate-400">Channel</TableHead>
                    <TableHead className="text-slate-400">Error Code</TableHead>
                    <TableHead className="text-slate-400">Retries</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failed.map((item) => (
                    <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm text-slate-300">
                        {item.requestId.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-600">
                          {item.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-red-400">
                        {item.errorCode || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-slate-400">{item.manualRetryCount}</TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedNotification(item);
                            setDetailsOpen(true);
                          }}
                          className="inline-flex items-center justify-center p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-300"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => retryNotification(item.id)}
                          className="inline-flex items-center justify-center p-2 hover:bg-green-900/30 rounded text-green-400 hover:text-green-300"
                          title="Retry"
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button
                          onClick={() => deleteNotification(item.id)}
                          className="inline-flex items-center justify-center p-2 hover:bg-red-900/30 rounded text-red-400 hover:text-red-300"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Error Details</DialogTitle>
            <DialogDescription className="text-slate-400">
              Full error information for this notification
            </DialogDescription>
          </DialogHeader>

          {selectedNotification && (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-slate-400">Request ID</label>
                <code className="block mt-1 p-2 bg-slate-800 rounded text-slate-300 text-sm">
                  {selectedNotification.requestId}
                </code>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Channel</label>
                <p className="mt-1 text-white">{selectedNotification.channel}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Error Code</label>
                <p className="mt-1 text-red-400 font-mono">{selectedNotification.errorCode || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Error Details</label>
                <pre className="mt-1 p-3 bg-slate-800 rounded text-slate-300 text-xs overflow-auto max-h-64">
                  {JSON.stringify(selectedNotification.errorDetails, null, 2)}
                </pre>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    retryNotification(selectedNotification.id);
                    setDetailsOpen(false);
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw size={16} className="mr-2" />
                  Retry Notification
                </Button>
                <Button
                  onClick={() => setDetailsOpen(false)}
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
