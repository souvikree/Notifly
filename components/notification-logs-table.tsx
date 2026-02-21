"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ChannelBadge } from "@/components/channel-badge";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/loading-states";
import { RetryTimeline } from "@/components/retry-timeline";
import { useNotificationLogs, useRetryNotification } from "@/lib/hooks";
import { mockNotificationLogs, paginateData } from "@/lib/mock-data";
import type { NotificationLog, NotificationStatus, NotificationChannel } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ScrollText,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

interface NotificationLogsTableProps {
  search?: string;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  page: number;
  onPageChange: (page: number) => void;
}

export function NotificationLogsTable({
  search,
  status,
  channel,
  page,
  onPageChange,
}: NotificationLogsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useNotificationLogs({
    search,
    status,
    channel,
    page,
    size: 10,
  });

  const retryMutation = useRetryNotification();

  // Filter and paginate mock data if API not available
  let filteredLogs = mockNotificationLogs;
  if (search) {
    const q = search.toLowerCase();
    filteredLogs = filteredLogs.filter(
      (l) => l.requestId.toLowerCase().includes(q) || l.userId.toLowerCase().includes(q)
    );
  }
  if (status) {
    filteredLogs = filteredLogs.filter((l) => l.status === status);
  }
  if (channel) {
    filteredLogs = filteredLogs.filter((l) => l.channel === channel);
  }

  const result = data || paginateData(filteredLogs, page, 10);

  if (isLoading && !data) {
    return <TableSkeleton rows={6} cols={7} />;
  }

  if (result.content.length === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent>
          <EmptyState
            icon={ScrollText}
            title="No notifications found"
            description="No notification logs match your current filters. Try adjusting your search criteria."
          />
        </CardContent>
      </Card>
    );
  }

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("Copied to clipboard");
  };

  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-8" />
              <TableHead className="text-muted-foreground">Request ID</TableHead>
              <TableHead className="text-muted-foreground">Recipient</TableHead>
              <TableHead className="text-muted-foreground">Channel</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Delivery</TableHead>
              <TableHead className="text-muted-foreground">Time</TableHead>
              <TableHead className="text-right text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.content.map((log: NotificationLog) => (
              <LogRow
                key={log.id}
                log={log}
                isExpanded={expandedId === log.id}
                onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                onRetry={() => retryMutation.mutate(log.id)}
                onCopy={copyId}
                isRetrying={retryMutation.isPending}
              />
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {result.content.length} of {result.totalElements} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {Math.max(1, result.totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= result.totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface LogRowProps {
  log: NotificationLog;
  isExpanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onCopy: (id: string) => void;
  isRetrying: boolean;
}

function LogRow({ log, isExpanded, onToggle, onRetry, onCopy, isRetrying }: LogRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer border-border/50 hover:bg-accent/30"
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(log.requestId); }}
            className="flex items-center gap-1 font-mono text-xs text-foreground hover:text-primary"
          >
            {log.requestId.slice(0, 12)}...
            <Copy className="h-3 w-3 opacity-50" />
          </button>
        </TableCell>
        <TableCell className="max-w-[160px] truncate text-sm text-foreground">{log.recipient}</TableCell>
        <TableCell><ChannelBadge channel={log.channel} /></TableCell>
        <TableCell><StatusBadge status={log.status} /></TableCell>
        <TableCell className="text-sm text-foreground">
          {log.deliveryTimeMs ? `${log.deliveryTimeMs}ms` : "-"}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
        </TableCell>
        <TableCell className="text-right">
          {(log.status === "FAILED" || log.status === "DLQ") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              disabled={isRetrying}
              className="text-primary hover:text-primary"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          )}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isExpanded && (
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableCell colSpan={8} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-6 bg-accent/20 p-6 lg:grid-cols-2">
                  {/* Payload */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-foreground">Payload</h4>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-secondary p-4 font-mono text-xs text-muted-foreground">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                    {log.errorMessage && (
                      <div className="mt-3">
                        <h4 className="mb-1 text-sm font-medium text-destructive">Error</h4>
                        <p className="text-sm text-muted-foreground">{log.errorMessage}</p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>User: <span className="font-mono text-foreground">{log.userId}</span></span>
                      {log.templateId && (
                        <span>Template: <span className="font-mono text-foreground">{log.templateId}</span></span>
                      )}
                      <span>Retries: <span className="text-foreground">{log.retryCount}</span></span>
                    </div>
                  </div>

                  {/* Retry timeline */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-foreground">Retry History</h4>
                    {log.retryHistory.length > 0 ? (
                      <RetryTimeline attempts={log.retryHistory} />
                    ) : (
                      <p className="text-sm text-muted-foreground">No retry attempts</p>
                    )}
                  </div>
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}
