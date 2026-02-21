"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useGoogleLogin } from "@react-oauth/google";
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

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();

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
      // Show the backend message if available, else a generic one
      toast.error(err?.message ?? "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google OAuth ──────────────────────────────────────────────────────────
  // useGoogleLogin uses the Authorization Code flow (recommended over implicit).
  // onSuccess receives { code } which we exchange on the backend.
  // We use tokenResponse.credential (ID token) from the popup flow here.
  const handleGoogleSuccess = useCallback(async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      toast.error("Google sign-in failed — no credential received.");
      return;
    }
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed. Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [loginWithGoogle, router]);

  // This uses @react-oauth/google's useGoogleLogin hook
  // It opens a Google popup and calls handleGoogleSuccess with the ID token
  const googleLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      // useGoogleLogin with flow="implicit" returns access_token
      // We need the ID token, so we use the credential (one-tap) approach instead.
      // See GoogleOneTapButton below for the recommended approach.
      // This button is a fallback using the popup.
      toast.error("Use the Google button below — it provides the ID token.");
    },
    onError: () => toast.error("Google sign-in failed."),
    flow: "implicit",
  });

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
          <GoogleSignInButton
            loading={isGoogleLoading}
            onSuccess={handleGoogleSuccess}
            onError={() => toast.error("Google sign-in failed.")}
          />

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

// ── Separate component uses Google One Tap / credential response ──────────────
// This is the correct way to get an ID token from @react-oauth/google
import { GoogleLogin } from "@react-oauth/google";

function GoogleSignInButton({
  loading,
  onSuccess,
  onError,
}: {
  loading: boolean;
  onSuccess: (cred: { credential?: string }) => void;
  onError: () => void;
}) {
  if (loading) {
    return (
      <Button variant="outline" className="w-full" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Signing in with Google…
      </Button>
    );
  }

  return (
    // GoogleLogin renders Google's official button — gets ID token in credential
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={onSuccess}
        onError={onError}
        theme="filled_black"
        shape="rectangular"
        size="large"
        width="100%"
        text="signin_with"
        useOneTap={false}
      />
    </div>
  );
}