"use client";

import { cn } from "@/lib/utils";
import type { RetryAttempt } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, RotateCcw, AlertTriangle } from "lucide-react";

interface RetryTimelineProps {
  attempts: RetryAttempt[];
}

const statusIcons = {
  DELIVERED: { icon: CheckCircle, color: "text-success", bg: "bg-success/20" },
  FAILED: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/20" },
  RETRYING: { icon: RotateCcw, color: "text-warning", bg: "bg-warning/20" },
  DLQ: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/20" },
  ACCEPTED: { icon: CheckCircle, color: "text-primary", bg: "bg-primary/20" },
  PROCESSING: { icon: RotateCcw, color: "text-primary", bg: "bg-primary/20" },
};

export function RetryTimeline({ attempts }: RetryTimelineProps) {
  return (
    <div className="space-y-0">
      {attempts.map((attempt, index) => {
        const config = statusIcons[attempt.status] || statusIcons.RETRYING;
        const Icon = config.icon;
        const isLast = index === attempts.length - 1;

        return (
          <div key={index} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", config.bg)}>
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
              </div>
              {!isLast && <div className="h-full w-px bg-border" />}
            </div>
            <div className={cn("pb-4", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Attempt {attempt.attempt}</span>
                {attempt.durationMs && (
                  <span className="text-xs text-muted-foreground">{attempt.durationMs}ms</span>
                )}
              </div>
              {attempt.errorMessage && (
                <p className="mt-0.5 text-xs text-muted-foreground">{attempt.errorMessage}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground/60">
                {formatDistanceToNow(new Date(attempt.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
