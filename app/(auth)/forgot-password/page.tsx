"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { authService } from "@/lib/api-services";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Bell, Loader2, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email.");
      return;
    }
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      setIsSent(true);
      toast.success("Reset link sent!");
    } catch {
      // Show success even on error for security
      setIsSent(true);
    } finally {
      setIsLoading(false);
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
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Reset Password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {"We'll send you a link to reset your password"}
        </p>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-card-foreground">
            {isSent ? "Check your email" : "Forgot password"}
          </CardTitle>
          <CardDescription>
            {isSent
              ? "We sent a password reset link to your email"
              : "Enter the email associated with your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSent ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="rounded-full bg-success/10 p-3">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {"If an account exists for"} <span className="font-medium text-card-foreground">{email}</span>
                {", you will receive a password reset link shortly."}
              </p>
              <Button variant="outline" onClick={() => setIsSent(false)}>
                Try another email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-card-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@notifly.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-secondary"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className="flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="h-3 w-3" />
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
