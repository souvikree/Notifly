"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChannelBadge } from "@/components/channel-badge";
import { useTemplate, useTemplateVersions, useUpdateTemplate, usePublishTemplate, useDeactivateTemplate } from "@/lib/hooks";
import { mockTemplates } from "@/lib/mock-data";
import type { NotificationTemplate, NotificationChannel, TemplateVersion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Upload, XCircle, Pencil, Save, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

// Adapt mock (old shape with body/status) to new NotificationTemplate shape
function adaptMock(t: typeof mockTemplates[number]): NotificationTemplate {
  return {
    id:        t.id,
    name:      t.name,
    channel:   t.channel,
    subject:   t.subject,
    content:   (t as unknown as { body?: string }).body ?? "",
    version:   t.version,
    isActive:  t.status === "PUBLISHED",
    variables: t.variables,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const { data: fetchedTemplate } = useTemplate(id);
  const { data: fetchedVersions } = useTemplateVersions(id);

  const mockMatch = mockTemplates.find((t) => t.id === id);
  const template: NotificationTemplate | undefined =
    fetchedTemplate ?? (mockMatch ? adaptMock(mockMatch) : undefined);

  const versions: TemplateVersion[] = fetchedVersions ?? [];

  const updateMutation     = useUpdateTemplate();
  const publishMutation    = usePublishTemplate();
  const deactivateMutation = useDeactivateTemplate();

  const [editing, setEditing]         = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showVersions, setShowVersions] = useState(false);

  if (!template) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Template not found</p>
      </div>
    );
  }

  const startEditing = () => {
    setEditSubject(template.subject ?? "");
    setEditContent(template.content);
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(
      {
        id,
        data: {
          // UpdateTemplateRequest only accepts: content, subject, active
          // "name" is not updatable per backend
          content: editContent,
          subject: editSubject || undefined,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/templates")}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back to templates</span>
        </Button>
        <PageHeader title={template.name} description={`Version ${template.version}`}>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                template.isActive
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
              }
            >
              {template.isActive ? "Active" : "Inactive"}
            </Badge>
            {/* Cast channel string to NotificationChannel for ChannelBadge */}
            <ChannelBadge channel={template.channel as NotificationChannel} />
          </div>
        </PageHeader>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {!editing && (
          <Button variant="outline" onClick={startEditing}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
        {editing && (
          <>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        )}
        {!template.isActive && !editing && (
          <Button onClick={() => publishMutation.mutate(id)} disabled={publishMutation.isPending}>
            {publishMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Upload className="mr-2 h-4 w-4" />}
            Activate
          </Button>
        )}
        {template.isActive && !editing && (
          <Button
            variant="destructive"
            onClick={() => deactivateMutation.mutate(id)}
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <XCircle className="mr-2 h-4 w-4" />}
            Deactivate
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowVersions(!showVersions)}>
          <History className="mr-2 h-4 w-4" />
          {showVersions ? "Hide History" : "Version History"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          className="lg:col-span-2 space-y-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">
                Template Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  {template.channel === "EMAIL" && (
                    <div className="space-y-2">
                      <Label className="text-foreground">Subject</Label>
                      <Input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="bg-secondary"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-foreground">
                      {template.channel === "EMAIL" ? "Body (HTML)" : "Message"}
                    </Label>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={12}
                      className="bg-secondary font-mono text-sm"
                    />
                  </div>
                </>
              ) : (
                <>
                  {template.subject && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Subject
                      </p>
                      <p className="text-sm text-foreground">{template.subject}</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {template.channel === "EMAIL" ? "Body" : "Message"}
                    </p>
                    <pre className="whitespace-pre-wrap rounded-md bg-secondary p-4 font-mono text-sm text-foreground">
                      {template.content}
                    </pre>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Variables — only shown if present */}
          {(template.variables ?? []).length > 0 && (
            <Card className="border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-foreground">Variables</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(template.variables ?? []).map((v) => (
                    <span
                      key={v}
                      className="rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-foreground"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>

        <div className="space-y-6">
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs text-foreground truncate max-w-[140px]">
                  {template.id}
                </span>
              </div>
              <Separator className="bg-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="text-foreground">v{template.version}</span>
              </div>
              <Separator className="bg-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">
                  {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}
                </span>
              </div>
              <Separator className="bg-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-foreground">
                  {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
                </span>
              </div>
            </CardContent>
          </Card>

          {showVersions && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-foreground">
                    Version History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No version history available.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {versions.map((v) => (
                        <div key={v.version} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                              {v.version}
                            </div>
                            <div className="mt-1 h-full w-px bg-border/50" />
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">by {v.createdBy}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}