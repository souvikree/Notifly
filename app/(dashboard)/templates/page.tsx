"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ChannelBadge } from "@/components/channel-badge";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/loading-states";
import { CreateTemplateDialog } from "@/components/create-template-dialog";
import { useTemplates, usePublishTemplate, useDeactivateTemplate } from "@/lib/hooks";
import { mockTemplates, paginateData } from "@/lib/mock-data";
import type { NotificationChannel, TemplateStatus, NotificationTemplate, PaginatedResponse } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  X,
  Plus,
  FileCode2,
  MoreHorizontal,
  Eye,
  Upload,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

const EMPTY_RESULT: PaginatedResponse<NotificationTemplate> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  page: 0,
  size: 10,
};

export default function TemplatesPage() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<NotificationChannel | "ALL">("ALL");
  const [status, setStatus] = useState<TemplateStatus | "ALL">("ALL");
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError } = useTemplates({
    search: search || undefined,
    channel: channel === "ALL" ? undefined : channel,
    status: status === "ALL" ? undefined : status,
    page,
    size: 10,
  });

  const publishMutation = usePublishTemplate();
  const deactivateMutation = useDeactivateTemplate();

  const getMockResult = (): PaginatedResponse<NotificationTemplate> => {
    let filtered = [...mockTemplates];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (channel !== "ALL") filtered = filtered.filter((t) => t.channel === channel);
    if (status !== "ALL") filtered = filtered.filter((t) => t.status === status);
    return paginateData(filtered, page, 10);
  };

  const rawResult = data ?? (isError ? getMockResult() : undefined);
  const result: PaginatedResponse<NotificationTemplate> = {
    ...EMPTY_RESULT,
    ...rawResult,
    content: rawResult?.content ?? [],
  };

  const hasFilters = search || channel !== "ALL" || status !== "ALL";

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Templates" description="Manage notification templates" />
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Create and manage notification templates for all channels"
      >
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="bg-secondary pl-9"
          />
        </div>
        <Select
          value={channel}
          onValueChange={(v) => {
            setChannel(v as NotificationChannel | "ALL");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px] bg-secondary">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Channels</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
            <SelectItem value="PUSH">Push</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as TemplateStatus | "ALL");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px] bg-secondary">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setChannel("ALL");
              setStatus("ALL");
              setPage(0);
            }}
            className="text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {result.content.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent>
            <EmptyState
              icon={FileCode2}
              title="No templates found"
              description="Create your first notification template to get started."
            >
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-border/50 bg-card">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Channel</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Version</TableHead>
                    <TableHead className="text-muted-foreground">Variables</TableHead>
                    <TableHead className="text-muted-foreground">Updated</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.content.map((template: NotificationTemplate) => (
                    <TableRow
                      key={template.id}
                      className="border-border/50 hover:bg-accent/30"
                    >
                      <TableCell>
                        <Link
                          href={`/templates/${template.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {template.name}
                        </Link>
                        {template.subject && (
                          <p className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground">
                            {template.subject}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChannelBadge channel={template.channel} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={template.status} />
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        v{template.version}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(template.variables ?? []).slice(0, 3).map((v) => (
                            <span
                              key={v}
                              className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                            >
                              {`{{${v}}}`}
                            </span>
                          ))}
                          {(template.variables ?? []).length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{template.variables.length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(template.updatedAt), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border-border">
                            <DropdownMenuItem asChild>
                              <Link href={`/templates/${template.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View / Edit
                              </Link>
                            </DropdownMenuItem>
                            {template.status === "DRAFT" && (
                              <DropdownMenuItem
                                onClick={() => publishMutation.mutate(template.id)}
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                Publish
                              </DropdownMenuItem>
                            )}
                            {template.status === "PUBLISHED" && (
                              <DropdownMenuItem
                                onClick={() => deactivateMutation.mutate(template.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Deactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
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
                    onClick={() => setPage(Math.max(0, page - 1))}
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
                    onClick={() => setPage(page + 1)}
                    disabled={page >= result.totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <CreateTemplateDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}