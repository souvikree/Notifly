"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription,
  CardHeader, CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Bell, Loader2 } from "lucide-react";
import apiClient from "@/lib/api-client";
import type { AuthResponse } from "@/lib/types";

interface GoogleProfile {
  idToken:   string;
  email:     string;
  firstName: string;
  lastName:  string;
  avatarUrl: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { setAuthFromResponse } = useAuth();

  const [profile,       setProfile]       = useState<GoogleProfile | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isLoading,     setIsLoading]     = useState(false);

  // Read the Google profile that register/login/page.tsx stored in sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem("googleOnboarding");
    if (!raw) {
      // No profile means user navigated here directly — send to register
      router.replace("/register");
      return;
    }
    try {
      setProfile(JSON.parse(raw));
    } catch {
      router.replace("/register");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) {
      toast.error("Please enter a workspace name."); return;
    }
    if (workspaceName.trim().length < 2) {
      toast.error("Workspace name must be at least 2 characters."); return;
    }
    if (!profile) return;

    setIsLoading(true);
    try {
      const response = await apiClient.post<AuthResponse>(
        "/auth/complete-google-signup",
        { idToken: profile.idToken, workspaceName: workspaceName.trim() }
      );

      // Store tokens and redirect
      sessionStorage.removeItem("googleOnboarding");
      setAuthFromResponse(response.data);
      router.push("/dashboard");
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? "Failed to create workspace.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!profile) return null; // redirect in progress

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
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          Welcome, {profile.firstName}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One last step — name your workspace
        </p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-card-foreground">Create your workspace</CardTitle>
          <CardDescription>
            Your workspace is where your API keys, templates, and notification logs live.
            You can be a solo developer or a whole team.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="workspaceName" className="text-card-foreground">
                Workspace Name
              </Label>
              <Input
                id="workspaceName"
                placeholder="My SaaS, Personal Projects, Acme Corp…"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="bg-secondary"
                autoFocus
              />
              {workspaceName && (
                <p className="text-xs text-muted-foreground">
                  Workspace URL:{" "}
                  <span className="font-mono text-primary">
                    {workspaceName
                      .toLowerCase()
                      .replace(/[^a-z0-9\s-]/g, "")
                      .replace(/\s+/g, "-")
                      .replace(/-+/g, "-")
                      .replace(/^-|-$/g, "") || "…"}
                  </span>
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border/50 bg-secondary/50 p-3 text-sm text-muted-foreground">
              Signing in as <span className="font-medium text-card-foreground">{profile.email}</span>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || !workspaceName.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create workspace &amp; continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}