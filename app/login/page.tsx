'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

/**
 * NOTIFLY Login Page - Production-ready auth with JWT and API key support
 * Implements both admin email/password login and API key authentication
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loginMode, setLoginMode] = useState<'email' | 'apikey'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8080/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Login failed');
      }

      const { token, tenantId } = await response.json();
      localStorage.setItem('jwt_token', token);
      localStorage.setItem('tenant_id', tenantId);
      localStorage.setItem('auth_mode', 'jwt');
      
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8080/v1/auth/verify-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error('Invalid API key');
      }

      const { tenantId } = await response.json();
      localStorage.setItem('api_key', apiKey);
      localStorage.setItem('tenant_id', tenantId);
      localStorage.setItem('auth_mode', 'apikey');
      
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API key verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-white mb-2 font-mono">⚡ NOTIFLY</div>
          <p className="text-slate-400">Distributed Notification Orchestration Platform</p>
        </div>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Sign In</CardTitle>
            <CardDescription>Choose your authentication method</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg flex items-center gap-2">
                <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {/* Mode Selector */}
            <div className="flex gap-2 mb-6">
              <Button
                type="button"
                variant={loginMode === 'email' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => { setLoginMode('email'); setError(''); }}
              >
                Email
              </Button>
              <Button
                type="button"
                variant={loginMode === 'apikey' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => { setLoginMode('apikey'); setError(''); }}
              >
                API Key
              </Button>
            </div>

            {/* Email Login Form */}
            {loginMode === 'email' && (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                    required
                    disabled={loading}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                  Sign In
                </Button>

                <div className="text-center text-sm space-y-2">
                  <p className="text-slate-400">
                    Don't have an account?{' '}
                    <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                      Register here
                    </Link>
                  </p>
                  <p className="text-slate-400">
                    <Link href="/forgot-password" className="text-indigo-400 hover:text-indigo-300 font-medium">
                      Forgot password?
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* API Key Login Form */}
            {loginMode === 'apikey' && (
              <form onSubmit={handleApiKeyLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apikey" className="text-slate-300">API Key</Label>
                  <Input
                    id="apikey"
                    type="password"
                    placeholder="nf_live_xxxxxxxxxxxxx"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500 font-mono text-sm"
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Enter your NOTIFLY API key from /api-keys to access the dashboard
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                  Verify API Key
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Demo Credentials */}
        <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <p className="text-xs text-slate-400 mb-2">Demo Credentials (localhost):</p>
          <code className="text-xs text-slate-300 font-mono break-all">
            Email: admin@notifly.local<br/>
            Pass: NotiflySamplePass123!
          </code>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-8">
          © 2024 NOTIFLY. Distributed Notification Platform. All rights reserved.
        </p>
      </div>
    </div>
  );
}

