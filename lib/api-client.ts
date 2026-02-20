import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

interface ApiConfig extends AxiosRequestConfig {
  skipErrorHandler?: boolean;
}

interface InternalConfig extends InternalAxiosRequestConfig {
  skipErrorHandler?: boolean;
}

class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    this.axiosInstance.interceptors.request.use(
      (config: InternalConfig) => {
        const authMode = typeof window !== 'undefined' ? localStorage.getItem('auth_mode') : null;
        let token = '';

        if (authMode === 'jwt') {
          token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') || '' : '';
        } else if (authMode === 'apikey') {
          token = typeof window !== 'undefined' ? localStorage.getItem('api_key') || '' : '';
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        config.headers['X-Correlation-ID'] = this.generateCorrelationId();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('api_key');
          localStorage.removeItem('auth_mode');
          typeof window !== 'undefined' && (window.location.href = '/login');
        }
        return Promise.reject(error);
      }
    );
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Notification endpoints
  async submitNotification(data: {
    eventType: string;
    payload: any;
    userId?: string;
    idempotencyKey?: string;
  }) {
    const response = await this.axiosInstance.post('/notifications', data);
    return response.data;
  }

  async getNotificationStatus(requestId: string) {
    const response = await this.axiosInstance.get(`/notifications/${requestId}`);
    return response.data;
  }

  // Metrics endpoints
  async getMetrics() {
    const response = await this.axiosInstance.get('/admin/metrics');
    return response.data;
  }

  // Notification logs endpoints
  async getNotificationLogs(params?: {
    status?: string;
    channel?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.axiosInstance.get('/admin/logs', { params });
    return response.data;
  }

  // DLQ endpoints
  async getFailedNotifications(params?: {
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await this.axiosInstance.get('/admin/dlq', { params });
    return response.data;
  }

  async retryFailedNotification(notificationId: string) {
    const response = await this.axiosInstance.post(`/admin/dlq/${notificationId}/retry`);
    return response.data;
  }

  async deleteFailedNotification(notificationId: string) {
    const response = await this.axiosInstance.delete(`/admin/dlq/${notificationId}`);
    return response.data;
  }

  // API Keys endpoints
  async getApiKeys() {
    const response = await this.axiosInstance.get('/admin/api-keys');
    return response.data;
  }

  async createApiKey(data: {
    displayName: string;
    role: 'ADMIN' | 'SERVICE';
  }) {
    const response = await this.axiosInstance.post('/admin/api-keys', data);
    return response.data;
  }

  async revokeApiKey(keyId: string) {
    const response = await this.axiosInstance.delete(`/admin/api-keys/${keyId}`);
    return response.data;
  }

  // Settings endpoints
  async getSettings() {
    const response = await this.axiosInstance.get('/admin/settings');
    return response.data;
  }

  async updateSettings(data: {
    retryPolicy?: any;
    rateLimits?: any;
  }) {
    const response = await this.axiosInstance.put('/admin/settings', data);
    return response.data;
  }

  // Template endpoints
  async getTemplates() {
    const response = await this.axiosInstance.get('/admin/templates');
    return response.data;
  }

  async createTemplate(data: {
    name: string;
    channel: 'EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK';
    subject?: string;
    content: string;
    variables?: any;
  }) {
    const response = await this.axiosInstance.post('/admin/templates', data);
    return response.data;
  }

  async updateTemplate(templateId: string, data: any) {
    const response = await this.axiosInstance.put(`/admin/templates/${templateId}`, data);
    return response.data;
  }

  async deleteTemplate(templateId: string) {
    const response = await this.axiosInstance.delete(`/admin/templates/${templateId}`);
    return response.data;
  }
}

export const apiClient = new ApiClient();

