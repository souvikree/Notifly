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
import { Badge } from "@/components/ui/badge";
import { ChannelBadge } from "@/components/channel-badge";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/loading-states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDlqNotifications, useDlqRetry, useMarkUnrecoverable } from "@/lib/hooks";
import { mockDlqItems, paginateData } from "@/lib/mock-data";
import type { FailedNotification, NotificationChannel, PaginatedResponse } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  Ban,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface DlqTableProps {
  search?: string;
  channel?: NotificationChannel;
  isUnrecoverable?: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

const EMPTY_RESULT: PaginatedResponse<FailedNotification> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  page: 0,
  size: 10,
};

export function DlqTable({ search, channel, isUnrecoverable, page, onPageChange }: DlqTableProps) {
  const { data, isLoading, isError } = useDlqNotifications({
    search,
    channel,
    isUnrecoverable,
    page,
    size: 10,
  });

  const getMockResult = (): PaginatedResponse<FailedNotification> => {
    let filtered = [...mockDlqItems];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (i) => i.requestId.toLowerCase().includes(q) || i.errorMessage.toLowerCase().includes(q)
      );
    }
    if (channel) filtered = filtered.filter((i) => i.channel === channel);
    if (isUnrecoverable !== undefined)
      filtered = filtered.filter((i) => i.isUnrecoverable === isUnrecoverable);
    return paginateData(filtered, page, 10);
  };

  const rawResult = data ?? (isError ? getMockResult() : undefined);
  const result: PaginatedResponse<FailedNotification> = {
    ...EMPTY_RESULT,
    ...rawResult,
    content: rawResult?.content ?? [],
  };

  if (isLoading && !data) return <TableSkeleton rows={5} cols={6} />;

  if (result.content.length === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent>
          <EmptyState
            icon={AlertTriangle}
            title="No DLQ items"
            description="Great news! There are no failed notifications in the dead letter queue."
          />
        </CardContent>
      </Card>
    );
  }

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
              <TableHead className="text-muted-foreground">Error Code</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Failed</TableHead>
              <TableHead className="text-right text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.content.map((item: FailedNotification) => (
              <DlqRow key={item.id} item={item} />
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {result.content.length} of {result.totalElements}
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

function DlqRow({ item }: { item: FailedNotification }) {
  const [expanded, setExpanded] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [showMarkDialog, setShowMarkDialog] = useState(false);
  const retryMutation = useDlqRetry();
  const markMutation = useMarkUnrecoverable();

  return (
    <>
      <TableRow
        className="cursor-pointer border-border/50 hover:bg-accent/30"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-mono text-xs text-foreground">
          {item.requestId.slice(0, 12)}...
        </TableCell>
        <TableCell className="max-w-[140px] truncate text-sm text-foreground">
          {item.recipient}
        </TableCell>
        <TableCell>
          <ChannelBadge channel={item.channel} />
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className="border-destructive/30 bg-destructive/10 font-mono text-xs text-destructive"
          >
            {item.errorCode}
          </Badge>
        </TableCell>
        <TableCell>
          {item.isUnrecoverable ? (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 bg-muted text-muted-foreground"
            >
              <Ban className="mr-1 h-3 w-3" />
              Unrecoverable
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-warning/30 bg-warning/10 text-warning"
            >
              Pending Review
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </TableCell>
        <TableCell className="text-right">
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {!item.isUnrecoverable && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRetryDialog(true)}
                  className="text-primary hover:text-primary"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMarkDialog(true)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Ban className="mr-1 h-3 w-3" />
                  Mark
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {expanded && (
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableCell colSpan={8} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 bg-accent/20 p-6">
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-foreground">Error Details</h4>
                    <p className="text-sm text-destructive">{item.errorMessage}</p>
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-foreground">Payload</h4>
                    <pre className="max-h-32 overflow-auto rounded-lg bg-secondary p-3 font-mono text-xs text-muted-foreground">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      User:{" "}
                      <span className="font-mono text-foreground">{item.userId}</span>
                    </span>
                    <span>
                      Retries:{" "}
                      <span className="text-foreground">{item.retryCount}</span>
                    </span>
                    {item.lastRetryAt && (
                      <span>
                        Last retry:{" "}
                        <span className="text-foreground">
                          {formatDistanceToNow(new Date(item.lastRetryAt), { addSuffix: true })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>

      <AlertDialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-card-foreground">
              Retry this notification?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will re-queue the notification for delivery. It will go through the normal retry
              pipeline.
              <br />
              <br />
              <span className="font-mono text-xs">{item.requestId}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-secondary-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => retryMutation.mutate(item.id)}>
              Confirm Retry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showMarkDialog} onOpenChange={setShowMarkDialog}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-card-foreground">
              Mark as unrecoverable?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This notification will be permanently marked as unrecoverable and will not be retried
              again. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-secondary-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => markMutation.mutate(item.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Mark Unrecoverable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}