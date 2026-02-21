"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { NotificationLogsTable } from "@/components/notification-logs-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import type { NotificationStatus, NotificationChannel } from "@/lib/types";

export default function LogsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<NotificationStatus | "ALL">("ALL");
  const [channel, setChannel] = useState<NotificationChannel | "ALL">("ALL");
  const [page, setPage] = useState(0);

  const hasFilters = search || status !== "ALL" || channel !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setStatus("ALL");
    setChannel("ALL");
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Logs"
        description="Track and inspect all notification delivery events"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by requestId or userId..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="bg-secondary pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v as NotificationStatus | "ALL"); setPage(0); }}>
          <SelectTrigger className="w-[150px] bg-secondary">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="RETRYING">Retrying</SelectItem>
            <SelectItem value="DLQ">DLQ</SelectItem>
          </SelectContent>
        </Select>
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
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <NotificationLogsTable
        search={search}
        status={status === "ALL" ? undefined : status}
        channel={channel === "ALL" ? undefined : channel}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}
