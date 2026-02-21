"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DlqTable } from "@/components/dlq-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDlqBatchRetry } from "@/lib/hooks";
import { Search, X, RotateCcw } from "lucide-react";
import type { NotificationChannel } from "@/lib/types";

export default function DlqPage() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<NotificationChannel | "ALL">("ALL");
  const [showUnrecoverable, setShowUnrecoverable] = useState<"ALL" | "true" | "false">("ALL");
  const [page, setPage] = useState(0);

  const batchRetry = useDlqBatchRetry();

  const hasFilters = search || channel !== "ALL" || showUnrecoverable !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setChannel("ALL");
    setShowUnrecoverable("ALL");
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dead Letter Queue"
        description="Review and manage failed notifications that exhausted all retry attempts"
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry All Recoverable
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-card-foreground">Retry all recoverable items?</AlertDialogTitle>
              <AlertDialogDescription>
                This will re-queue all non-unrecoverable DLQ items for delivery. Items will go through the normal retry pipeline again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-secondary text-secondary-foreground">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => batchRetry.mutate({ isUnrecoverable: false })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm Retry All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by requestId or error..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="bg-secondary pl-9"
          />
        </div>
        <Select value={channel} onValueChange={(v) => { setChannel(v as NotificationChannel | "ALL"); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-secondary">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Channels</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
            <SelectItem value="PUSH">Push</SelectItem>
          </SelectContent>
        </Select>
        <Select value={showUnrecoverable} onValueChange={(v) => { setShowUnrecoverable(v as "ALL" | "true" | "false"); setPage(0); }}>
          <SelectTrigger className="w-[170px] bg-secondary">
            <SelectValue placeholder="Recovery status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Items</SelectItem>
            <SelectItem value="false">Recoverable</SelectItem>
            <SelectItem value="true">Unrecoverable</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* DLQ Table */}
      <DlqTable
        search={search}
        channel={channel === "ALL" ? undefined : channel}
        isUnrecoverable={showUnrecoverable === "ALL" ? undefined : showUnrecoverable === "true"}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}
