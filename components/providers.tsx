"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { GoogleOAuthProvider } from "@react-oauth/google";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/**
 * FIXED: Guard against rendering GoogleOAuthProvider with an empty clientId.
 *
 * When NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set, GoogleOAuthProvider receives ""
 * as the clientId. The @react-oauth/google library still calls
 * google.accounts.id.initialize("") which registers a blank client ID with
 * Google's GSI script. Google then has no valid client to check origins against
 * and returns 403 on every button iframe request.
 *
 * When the client ID is missing, we render children without GoogleOAuthProvider
 * so the app still works (email/password auth) and the error is surfaced clearly
 * in the console rather than silently corrupting Google's auth state.
 */
function GoogleWrapper({ children }: { children: React.ReactNode }) {
  if (!GOOGLE_CLIENT_ID) {
    if (typeof window !== "undefined") {
      console.error(
        "[Notifly] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set. " +
        "Google sign-in will be disabled. " +
        "Create Notifly-master/.env.local with:\n" +
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com"
      );
    }
    return <>{children}</>;
  }
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <GoogleWrapper>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          <AuthProvider>
            {children}
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GoogleWrapper>
  );
}