import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  dashboardService,
  notificationService,
  dlqService,
  templateService,
  apiKeyService,
  settingsService,
} from "./api-services";
import type {
  NotificationLogFilters,
  DlqFilters,
  TemplateFilters,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CreateApiKeyRequest,
  ChannelProviderConfig,
  FallbackConfig,
} from "./types";
import { toast } from "sonner";

// === Dashboard ===
export function useDashboardMetrics(period?: string) {
  return useQuery({
    queryKey: ["dashboard", "metrics", period],
    queryFn: () => dashboardService.getMetrics(period),
    refetchInterval: 30000,
    // Keep previous data visible while refetching
    placeholderData: (prev) => prev,
    // Don't throw on error — let the component handle isError
    throwOnError: false,
    retry: 1,
  });
}

// === Notification Logs ===
export function useNotificationLogs(filters: NotificationLogFilters) {
  return useQuery({
    queryKey: ["notifications", "logs", filters],
    queryFn: () => notificationService.getLogs(filters),
    placeholderData: (prev) => prev,
    throwOnError: false,
    retry: 1,
  });
}

export function useNotificationLog(id: string) {
  return useQuery({
    queryKey: ["notifications", "logs", id],
    queryFn: () => notificationService.getLogById(id),
    enabled: !!id,
    throwOnError: false,
    retry: 1,
  });
}

export function useRetryNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.retryNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification queued for retry.");
    },
    onError: () => toast.error("Failed to retry notification."),
  });
}

// === DLQ ===
export function useDlqNotifications(filters: DlqFilters) {
  return useQuery({
    queryKey: ["dlq", filters],
    queryFn: () => dlqService.getFailedNotifications(filters),
    placeholderData: (prev) => prev,
    throwOnError: false,
    retry: 1,
  });
}

export function useDlqRetry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dlqService.retryById(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dlq"] });
      toast.success("DLQ item queued for retry.");
    },
    onError: () => toast.error("Failed to retry DLQ item."),
  });
}

export function useDlqBatchRetry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters: Partial<DlqFilters>) => dlqService.retryByFilter(filters),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dlq"] });
      toast.success("Batch retry initiated.");
    },
    onError: () => toast.error("Failed to initiate batch retry."),
  });
}

export function useMarkUnrecoverable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dlqService.markUnrecoverable(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dlq"] });
      toast.success("Marked as unrecoverable.");
    },
    onError: () => toast.error("Failed to mark as unrecoverable."),
  });
}

// === Templates ===
export function useTemplates(filters: TemplateFilters) {
  return useQuery({
    queryKey: ["templates", filters],
    queryFn: () => templateService.getTemplates(filters),
    placeholderData: (prev) => prev,
    throwOnError: false,
    retry: 1,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => templateService.getById(id),
    enabled: !!id,
    throwOnError: false,
    retry: 1,
  });
}

export function useTemplateVersions(id: string) {
  return useQuery({
    queryKey: ["templates", id, "versions"],
    queryFn: () => templateService.getVersionHistory(id),
    enabled: !!id,
    throwOnError: false,
    retry: 1,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateRequest) => templateService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template created.");
    },
    onError: () => toast.error("Failed to create template."),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateRequest }) =>
      templateService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template updated.");
    },
    onError: () => toast.error("Failed to update template."),
  });
}

export function usePublishTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templateService.publish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template published.");
    },
    onError: () => toast.error("Failed to publish template."),
  });
}

export function useDeactivateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templateService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deactivated.");
    },
    onError: () => toast.error("Failed to deactivate template."),
  });
}

// === API Keys ===
export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeyService.getKeys(),
    throwOnError: false,
    retry: 1,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => apiKeyService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Failed to generate API key."),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeyService.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked.");
    },
    onError: () => toast.error("Failed to revoke API key."),
  });
}

// === Settings ===
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.getSettings(),
    throwOnError: false,
    retry: 1,
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ChannelProviderConfig) => settingsService.updateProvider(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Provider updated.");
    },
    onError: () => toast.error("Failed to update provider."),
  });
}

export function useUpdateFallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FallbackConfig) => settingsService.updateFallback(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Fallback order updated.");
    },
    onError: () => toast.error("Failed to update fallback order."),
  });
}