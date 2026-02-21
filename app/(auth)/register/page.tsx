"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { GoogleLogin } from "@react-oauth/google";
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

// NOTE: Registration requires a tenantId.
// Options:
//   A. Hard-code your single tenant UUID here (simplest for single-tenant apps)
//   B. Add a "Tenant ID" field to the form
//   C. Use an invite link that contains the tenantId
// For now we read from env var — set NEXT_PUBLIC_DEFAULT_TENANT_ID in .env.local
const DEFAULT_TENANT_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? "";

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginWithGoogle } = useAuth();

  const [firstName,       setFirstName]       = useState("");
  const [lastName,        setLastName]        = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirm,         setConfirm]         = useState("");
  const [isLoading,       setIsLoading]       = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !password) {
      toast.error("Please fill in all fields."); return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match."); return;
    }
    if (password.length < 10) {
      toast.error("Password must be at least 10 characters."); return;
    }
    if (!DEFAULT_TENANT_ID) {
      toast.error("No tenant configured. Set NEXT_PUBLIC_DEFAULT_TENANT_ID in .env.local"); return;
    }

    setIsLoading(true);
    try {
      await register({
        tenantId: DEFAULT_TENANT_ID,
        firstName,
        lastName,
        email,
        password,
      });
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (cred: { credential?: string }) => {
    if (!cred.credential) { toast.error("Google sign-up failed."); return; }
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle(cred.credential);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-up failed.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Bell className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Create Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Get started with Notifly</p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-card-foreground">Register</CardTitle>
          <CardDescription>Create your admin account to get started</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Google Sign-Up */}
          {isGoogleLoading ? (
            <Button variant="outline" className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing up with Google…
            </Button>
          ) : (
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error("Google sign-up failed.")}
                theme="filled_black"
                shape="rectangular"
                size="large"
                width="100%"
                text="signup_with"
                useOneTap={false}
              />
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or register with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-card-foreground">First Name</Label>
                <Input
                  id="firstName" placeholder="John"
                  value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-card-foreground">Last Name</Label>
                <Input
                  id="lastName" placeholder="Doe"
                  value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-card-foreground">Email</Label>
              <Input
                id="email" type="email" placeholder="john@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-card-foreground">Password</Label>
              <Input
                id="password" type="password"
                placeholder="Min 10 chars, 1 uppercase, 1 number, 1 symbol"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-card-foreground">Confirm Password</Label>
              <Input
                id="confirm" type="password" placeholder="Repeat your password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="bg-secondary"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}