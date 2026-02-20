'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!tenantId.trim() || !apiKey.trim()) {
        setError('Tenant ID and API Key are required');
        setLoading(false);
        return;
      }

      // Store in localStorage
      localStorage.setItem('tenantId', tenantId);
      localStorage.setItem('apiKey', apiKey);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
      <Card className="w-full max-w-md p-8 shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">NOTIFLY</h1>
          <p className="text-gray-600 mt-2">Distributed Notification Platform</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700 mb-2">
              Tenant ID
            </label>
            <Input
              id="tenantId"
              type="text"
              placeholder="Enter your tenant ID (UUID)"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h3 className="font-semibold text-sm text-blue-900 mb-2">Demo Credentials</h3>
          <p className="text-xs text-blue-700">
            For testing, use any valid UUID format as Tenant ID and any string as API Key.
          </p>
        </div>
      </Card>
    </div>
  );
}
