import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request interceptor: attach JWT ──────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("notifly_access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: refresh token on 401, handle errors ─
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    // ── 401: try to refresh token before logging out ──
    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== "undefined" ? localStorage.getItem("notifly_refresh_token") : null;

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken } = response.data;

          localStorage.setItem("notifly_access_token", accessToken);
          // Update cookie for middleware
          document.cookie = `notifly_access_token=${encodeURIComponent(accessToken)}; path=/; SameSite=Lax`;

          processQueue(null, accessToken);
          isRefreshing = false;

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return apiClient(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          isRefreshing = false;
          // Refresh failed — clear all auth state and redirect
          if (typeof window !== "undefined") {
            localStorage.removeItem("notifly_access_token");
            localStorage.removeItem("notifly_refresh_token");
            localStorage.removeItem("notifly_user");
            document.cookie = "notifly_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
            window.location.href = "/login";
          }
        }
      } else {
        // No refresh token at all — go to login
        if (typeof window !== "undefined") {
          localStorage.clear();
          document.cookie = "notifly_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
          window.location.href = "/login";
        }
      }
    }

    if (status === 403) {
      toast.error("You do not have permission to perform this action.");
    } else if (status === 429) {
      toast.error("Rate limit exceeded. Please try again later.");
    } else if (status && status >= 500) {
      toast.error("A server error occurred. Please try again.");
    }

    return Promise.reject({ status, message, original: error });
  }
);

export default apiClient;