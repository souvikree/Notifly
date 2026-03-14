"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Bell, Loader2 } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { authService } from "@/lib/api-services";
import type { AuthResponse } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { login, setAuthFromResponse } = useAuth();

  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [isLoading,       setIsLoading]       = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // ── Email / password ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Please fill in all fields."); return; }
    setIsLoading(true);
    try {
      await login({ email, password });
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google OAuth ──────────────────────────────────────────────────────────
  // FIX (HIGH-001): loginWithGoogle() in auth-context blindly casts the response
  // to AuthResponse and calls persist() without checking for needsOnboarding.
  // When a brand-new Google user hits the login page, the backend returns
  // 202 { needsOnboarding: true } — persist() crashes on missing fields,
  // which previously caused the "No tenant configured" error.
  //
  // Fix: call authService.googleAuth() directly (same pattern as register page)
  // and branch on needsOnboarding before touching auth state.
  const handleGoogleSuccess = useCallback(async (cred: { credential?: string }) => {
    if (!cred.credential) {
      toast.error("Google sign-in failed — no credential received.");
      return;
    }
    setIsGoogleLoading(true);
    try {
      const response = await authService.googleAuth(cred.credential);

      // New Google user — no tenant yet, send to onboarding
      if ((response as any).needsOnboarding) {
        sessionStorage.setItem("googleOnboarding", JSON.stringify((response as any).profile));
        router.push("/onboarding");
        return;
      }

      // Existing user (Google account or linked account) — log them in
      setAuthFromResponse(response as AuthResponse);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed. Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [router, setAuthFromResponse]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Bell className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Notifly</h1>
        <p className="mt-1 text-sm text-muted-foreground">Notification infrastructure platform</p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-card-foreground">Sign in</CardTitle>
          <CardDescription>Choose how you want to sign in</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Google Sign-In Button */}
          {isGoogleLoading ? (
            <Button variant="outline" className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in with Google…
            </Button>
          ) : (
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error("Google sign-in failed.")}
                theme="filled_black"
                shape="rectangular"
                size="large"
                width="400"
                text="signin_with"
                useOneTap={false}
              />
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or sign in with email</span>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-card-foreground">Email</Label>
              <Input
                id="email" type="email" placeholder="admin@notifly.io"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-card-foreground">Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password" type="password" placeholder="Enter your password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in with Email
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {"Don't have an account? "}
            <Link href="/register" className="text-primary hover:underline">Create one</Link>
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}