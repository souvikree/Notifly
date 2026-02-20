'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Save, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
}

export default function SettingsPage() {
  const { tenantId } = useAuth();
  const [retryPolicy, setRetryPolicy] = useState<RetryPolicy>({
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 1.5,
  });

  const [rateLimits, setRateLimits] = useState<RateLimitConfig>({
    requestsPerMinute: 1000,
    requestsPerHour: 50000,
    burstLimit: 5000,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
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

      const response = await fetch('http://localhost:8080/v1/admin/settings', {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setRetryPolicy(data.retryPolicy);
        setRateLimits(data.rateLimits);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveMessage('');

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

      const response = await fetch('http://localhost:8080/v1/admin/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          retryPolicy,
          rateLimits,
        }),
      });

      if (response.ok) {
        setSaveMessage('Settings saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-slate-400">Configure retry policies and rate limits</p>
      </div>

      {/* Retry Policy Section */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Retry Policy</CardTitle>
          <CardDescription>Configure automatic retry behavior for failed notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="maxAttempts" className="text-slate-300">Maximum Retry Attempts</Label>
              <Input
                id="maxAttempts"
                type="number"
                min="1"
                max="10"
                value={retryPolicy.maxAttempts}
                onChange={(e) => setRetryPolicy({ ...retryPolicy, maxAttempts: parseInt(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Total attempts before moving to DLQ</p>
            </div>

            <div>
              <Label htmlFor="initialDelay" className="text-slate-300">Initial Retry Delay (ms)</Label>
              <Input
                id="initialDelay"
                type="number"
                min="100"
                step="100"
                value={retryPolicy.initialDelayMs}
                onChange={(e) => setRetryPolicy({ ...retryPolicy, initialDelayMs: parseInt(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Delay before first retry</p>
            </div>

            <div>
              <Label htmlFor="maxDelay" className="text-slate-300">Maximum Retry Delay (ms)</Label>
              <Input
                id="maxDelay"
                type="number"
                min="1000"
                step="1000"
                value={retryPolicy.maxDelayMs}
                onChange={(e) => setRetryPolicy({ ...retryPolicy, maxDelayMs: parseInt(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum delay between retries</p>
            </div>

            <div>
              <Label htmlFor="backoff" className="text-slate-300">Backoff Multiplier</Label>
              <Input
                id="backoff"
                type="number"
                min="1"
                max="3"
                step="0.1"
                value={retryPolicy.backoffMultiplier}
                onChange={(e) => setRetryPolicy({ ...retryPolicy, backoffMultiplier: parseFloat(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Exponential backoff multiplier (1.5x is recommended)</p>
            </div>
          </div>

          {/* Retry Schedule Preview */}
          <div className="mt-6 p-4 bg-slate-800/50 rounded">
            <p className="text-sm font-medium text-slate-300 mb-3">Retry Schedule Preview:</p>
            <div className="space-y-2 text-xs font-mono">
              {[1, 2, 3, 4, 5].map((attempt) => {
                let delay = retryPolicy.initialDelayMs;
                for (let i = 1; i < attempt; i++) {
                  delay = Math.min(delay * retryPolicy.backoffMultiplier, retryPolicy.maxDelayMs);
                }
                return (
                  <div key={attempt} className="text-slate-400">
                    <span className="text-indigo-400">Attempt {attempt}:</span> {delay}ms delay
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator className="bg-slate-800" />

      {/* Rate Limit Section */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Rate Limiting</CardTitle>
          <CardDescription>Control request rate limits for your API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label htmlFor="perMinute" className="text-slate-300">Requests per Minute</Label>
              <Input
                id="perMinute"
                type="number"
                min="100"
                step="100"
                value={rateLimits.requestsPerMinute}
                onChange={(e) => setRateLimits({ ...rateLimits, requestsPerMinute: parseInt(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Rate limit window</p>
            </div>

            <div>
              <Label htmlFor="perHour" className="text-slate-300">Requests per Hour</Label>
              <Input
                id="perHour"
                type="number"
                min="1000"
                step="1000"
                value={rateLimits.requestsPerHour}
                onChange={(e) => setRateLimits({ ...rateLimits, requestsPerHour: parseInt(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Longer-term rate limit</p>
            </div>

            <div>
              <Label htmlFor="burst" className="text-slate-300">Burst Limit</Label>
              <Input
                id="burst"
                type="number"
                min="100"
                step="100"
                value={rateLimits.burstLimit}
                onChange={(e) => setRateLimits({ ...rateLimits, burstLimit: parseInt(e.target.value) })}
                className="mt-2 bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum burst size</p>
            </div>
          </div>

          <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded flex gap-3">
            <AlertCircle className="text-blue-400 flex-shrink-0" size={18} />
            <p className="text-sm text-blue-300">
              Rate limits are enforced per tenant using Redis. Requests exceeding the limit return HTTP 429.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={saveSettings}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>

        {saveMessage && (
          <p className={`text-sm font-medium ${saveMessage.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
            {saveMessage}
          </p>
        )}
      </div>

      {/* Info Section */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div>
            <p className="font-medium mb-1">Tenant ID</p>
            <code className="bg-slate-800 p-2 rounded block font-mono text-xs">{tenantId}</code>
          </div>
          <div>
            <p className="font-medium mb-1">Database</p>
            <p>PostgreSQL via Supabase with Row Level Security</p>
          </div>
          <div>
            <p className="font-medium mb-1">Message Queue</p>
            <p>Apache Kafka with retry topics and DLQ</p>
          </div>
          <div>
            <p className="font-medium mb-1">Caching</p>
            <p>Redis for rate limiting and API key caching</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
