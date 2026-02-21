"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NotificationStatus, TemplateStatus, ApiKeyStatus } from "@/lib/types";

type StatusType = NotificationStatus | TemplateStatus | ApiKeyStatus;

const statusConfig: Record<string, { label: string; className: string }> = {
  ACCEPTED: { label: "Accepted", className: "bg-primary/15 text-primary border-primary/20" },
  PROCESSING: { label: "Processing", className: "bg-primary/15 text-primary border-primary/20 animate-pulse" },
  DELIVERED: { label: "Delivered", className: "bg-success/15 text-success border-success/20" },
  FAILED: { label: "Failed", className: "bg-destructive/15 text-destructive border-destructive/20" },
  RETRYING: { label: "Retrying", className: "bg-warning/15 text-warning border-warning/20 animate-pulse" },
  DLQ: { label: "DLQ", className: "bg-destructive/15 text-destructive border-destructive/20" },
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  PUBLISHED: { label: "Published", className: "bg-success/15 text-success border-success/20" },
  DEACTIVATED: { label: "Deactivated", className: "bg-muted text-muted-foreground border-border" },
  ACTIVE: { label: "Active", className: "bg-success/15 text-success border-success/20" },
  REVOKED: { label: "Revoked", className: "bg-destructive/15 text-destructive border-destructive/20" },
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      <span className={cn(
        "mr-1.5 h-1.5 w-1.5 rounded-full",
        status === "DELIVERED" || status === "PUBLISHED" || status === "ACTIVE" ? "bg-success" :
        status === "FAILED" || status === "DLQ" || status === "REVOKED" ? "bg-destructive" :
        status === "RETRYING" || status === "PROCESSING" ? "bg-warning" :
        "bg-muted-foreground"
      )} />
      {config.label}
    </Badge>
  );
}
