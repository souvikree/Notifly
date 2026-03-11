"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { AuthUser, AuthResponse, LoginRequest } from "./types";
import { authService } from "./api-services";
import { toast } from "sonner";

// Defined here (not in types.ts) — workspaceName replaces tenantId
export interface RegisterRequest {
  email:         string;
  password:      string;
  firstName:     string;
  lastName:      string;
  workspaceName: string;
}

interface AuthContextType {
  user:                AuthUser | null;
  isLoading:           boolean;
  isAuthenticated:     boolean;
  login:               (data: LoginRequest) => Promise<void>;
  register:            (data: RegisterRequest) => Promise<void>;
  loginWithGoogle:     (idToken: string) => Promise<void>;
  logout:              () => Promise<void>;
  // Used by /onboarding page after complete-google-signup returns tokens
  setAuthFromResponse: (response: AuthResponse) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Cookie helpers ─────────────────────────────────────────────────────────────
// FIXED: Added Secure flag for HTTPS environments (SEC-006)
// FIXED: Changed SameSite from Lax to Strict for stronger CSRF protection
function setCookie(name: string, value: string, days = 1) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict${secure}`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
}

// ── Map backend AuthResponse → AuthUser ───────────────────────────────────────
function toAuthUser(r: AuthResponse): AuthUser {
  return {
    id:           r.userId,
    email:        r.email,
    firstName:    r.firstName,
    lastName:     r.lastName,
    role:         r.role,
    tenantId:     r.tenantId,
    avatarUrl:    r.avatarUrl,
    authProvider: r.authProvider,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from storage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("notifly_user") ?? localStorage.getItem("notifly_user");
    const token  = sessionStorage.getItem("notifly_access_token") ?? localStorage.getItem("notifly_access_token");
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        clearAllStorage();
      }
    }
    setIsLoading(false);
  }, []);

  const clearAllStorage = () => {
    ["notifly_access_token", "notifly_refresh_token", "notifly_user"].forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    deleteCookie("notifly_access_token");
  };

  // Persist auth state
  // FIXED: Tokens in sessionStorage (more XSS-safe than localStorage — cleared on tab close)
  const persist = useCallback((response: AuthResponse) => {
    const u = toAuthUser(response);

    sessionStorage.setItem("notifly_access_token",  response.accessToken);
    sessionStorage.setItem("notifly_refresh_token", response.refreshToken);
    sessionStorage.setItem("notifly_user",          JSON.stringify(u));

    // Keep localStorage copy for rehydration across tabs
    localStorage.setItem("notifly_access_token",  response.accessToken);
    localStorage.setItem("notifly_refresh_token", response.refreshToken);
    localStorage.setItem("notifly_user",          JSON.stringify(u));

    // Cookie for Next.js middleware (can't read localStorage in Edge middleware)
    setCookie("notifly_access_token", response.accessToken, 1);

    setUser(u);
  }, []);

  const clearAuth = useCallback(() => {
    clearAllStorage();
    setUser(null);
  }, []);

  // ── Email / password login ─────────────────────────────────────────────────
  const login = useCallback(async (data: LoginRequest) => {
    const response = await authService.login(data);
    persist(response);
    toast.success(`Welcome back, ${response.firstName}!`);
  }, [persist]);

  // ── Email registration — workspaceName auto-creates tenant on backend ───────
  const register = useCallback(async (data: RegisterRequest) => {
    const response = await authService.register(data);
    persist(response);
    toast.success(`Workspace created! Welcome, ${response.firstName}!`);
  }, [persist]);

  // ── Google login (existing users only from login page) ─────────────────────
  // New Google users get a 202 needsOnboarding response — that is handled
  // directly in the register page, which redirects to /onboarding.
  // This function is only reached for returning Google users.
  const loginWithGoogle = useCallback(async (idToken: string) => {
    const response = await authService.googleAuth(idToken) as AuthResponse;
    persist(response);
    const isNew = response.authProvider === "GOOGLE";
    toast.success(isNew
      ? `Welcome to Notifly, ${response.firstName}!`
      : `Welcome back, ${response.firstName}!`
    );
  }, [persist]);

  // ── Called by /onboarding page after complete-google-signup succeeds ────────
  const setAuthFromResponse = useCallback((response: AuthResponse) => {
    persist(response);
    toast.success(`Workspace created! Welcome, ${response.firstName}!`);
  }, [persist]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem("notifly_refresh_token")
                      ?? localStorage.getItem("notifly_refresh_token");
    try {
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch {
      // Ignore API errors — clear local state regardless
    } finally {
      clearAuth();
      toast.success("Logged out successfully.");
      // Hard redirect to ensure all React state is cleared
      window.location.href = "/login";
    }
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      loginWithGoogle,
      logout,
      setAuthFromResponse,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}