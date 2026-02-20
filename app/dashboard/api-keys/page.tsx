'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface ApiKey {
  id: string;
  displayName: string;
  keyPrefix: string;
  role: 'ADMIN' | 'SERVICE';
  lastUsedAt?: string;
  createdAt: string;
  revoked: boolean;
}

export default function ApiKeysPage() {
  const { tenantId } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewKeyValue, setShowNewKeyValue] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState<'ADMIN' | 'SERVICE'>('SERVICE');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
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

      const response = await fetch('http://localhost:8080/v1/admin/api-keys', {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.apiKeys);
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
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

      const response = await fetch('http://localhost:8080/v1/admin/api-keys', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          displayName: newKeyName,
          role: newKeyRole,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewKeyValue(data.key);
        setNewKeyName('');
        await fetchApiKeys();
      }
    } catch (err) {
      console.error('Failed to create API key:', err);
    }
  };

  const revokeApiKey = async (keyId: string) => {
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

      const response = await fetch(`http://localhost:8080/v1/admin/api-keys/${keyId}`, {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        await fetchApiKeys();
      }
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">API Keys</h1>
          <p className="text-slate-400">Manage authentication keys for API access</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2">
              <Plus size={18} />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription className="text-slate-400">
                Generate a new API key for programmatic access
              </DialogDescription>
            </DialogHeader>

            {!newKeyValue ? (
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="keyName">Display Name</Label>
                  <Input
                    id="keyName"
                    placeholder="e.g., Production API Key"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="keyRole">Role</Label>
                  <select
                    id="keyRole"
                    value={newKeyRole}
                    onChange={(e) => setNewKeyRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white mt-1"
                  >
                    <option value="SERVICE">Service (Recommended)</option>
                    <option value="ADMIN">Admin (Full Access)</option>
                  </select>
                </div>

                <Button
                  onClick={createApiKey}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  Create Key
                </Button>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-green-900/20 border border-green-700/50 rounded">
                  <p className="text-sm text-green-300 mb-2">API Key Created Successfully!</p>
                  <div className="flex items-center gap-2 bg-slate-800 p-3 rounded font-mono text-sm">
                    <span className="flex-1 truncate text-slate-300">{newKeyValue}</span>
                    <button
                      onClick={() => copyToClipboard(newKeyValue)}
                      className="p-1 hover:bg-slate-700 rounded"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Save this key securely. You won't see it again!</p>
                </div>

                <Button
                  onClick={() => {
                    setNewKeyValue('');
                    setDialogOpen(false);
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  Done
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* API Keys Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>All API keys associated with your account</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No API keys yet. Create one to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-slate-800/50">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Key Prefix</TableHead>
                    <TableHead className="text-slate-400">Role</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Last Used</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-medium text-white">{key.displayName}</TableCell>
                      <TableCell className="font-mono text-sm text-slate-400">{key.keyPrefix}......</TableCell>
                      <TableCell>
                        <Badge variant={key.role === 'ADMIN' ? 'destructive' : 'default'}>
                          {key.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {key.revoked ? (
                          <Badge variant="secondary">Revoked</Badge>
                        ) : (
                          <Badge className="bg-green-900 text-green-200">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => revokeApiKey(key.id)}
                          className="inline-flex items-center justify-center p-2 hover:bg-red-900/30 rounded text-red-400 hover:text-red-300"
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

      {/* Documentation */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>API Key Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300 text-sm">
          <div>
            <p className="font-mono bg-slate-800 p-3 rounded mb-2">
              {'curl -X POST https://api.notifly.io/v1/notifications \\'}
              <br />
              {'  -H "Authorization: Bearer YOUR_API_KEY" \\'}
              <br />
              {'  -H "Content-Type: application/json" \\'}
              <br />
              {'  -d \'{"eventType":"user.signup","payload":{...}}\''}
            </p>
            <p className="text-slate-400">Use your API key in the Authorization header as a Bearer token.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
