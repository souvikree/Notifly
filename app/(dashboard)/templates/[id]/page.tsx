"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ChannelBadge } from "@/components/channel-badge";
import { useTemplate, useTemplateVersions, useUpdateTemplate, usePublishTemplate, useDeactivateTemplate } from "@/lib/hooks";
import { mockTemplates } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Upload, XCircle, Pencil, Save, History, Clock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { motion } from "framer-motion";

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: fetchedTemplate } = useTemplate(id);
  const { data: fetchedVersions } = useTemplateVersions(id);

  const template = fetchedTemplate || mockTemplates.find((t) => t.id === id);
  const versions = fetchedVersions || [
    { version: 2, body: template?.body || "", subject: template?.subject, status: template?.status || "DRAFT", createdAt: template?.updatedAt || new Date().toISOString(), createdBy: "admin@notifly.io" },
    { version: 1, body: "Previous version body...", subject: template?.subject, status: "DRAFT" as const, createdAt: template?.createdAt || new Date().toISOString(), createdBy: "admin@notifly.io" },
  ];

  const updateMutation = useUpdateTemplate();
  const publishMutation = usePublishTemplate();
  const deactivateMutation = useDeactivateTemplate();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(template?.name || "");
  const [editSubject, setEditSubject] = useState(template?.subject || "");
  const [editBody, setEditBody] = useState(template?.body || "");
  const [showVersions, setShowVersions] = useState(false);

  if (!template) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Template not found</p>
      </div>
    );
  }

  const handleSave = () => {
    updateMutation.mutate(
      { id, data: { name: editName, subject: editSubject || undefined, body: editBody } },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/templates")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back to templates</span>
        </Button>
        <PageHeader title={template.name} description={`Version ${template.version}`}>
          <div className="flex items-center gap-2">
            <StatusBadge status={template.status} />
            <ChannelBadge channel={template.channel} />
          </div>
        </PageHeader>
      </div>

      <div className="flex flex-wrap gap-3">
        {!editing && (
          <Button variant="outline" onClick={() => { setEditing(true); setEditName(template.name); setEditSubject(template.subject || ""); setEditBody(template.body); }}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
        {editing && (
          <>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Draft
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        )}
        {template.status === "DRAFT" && !editing && (
          <Button onClick={() => publishMutation.mutate(id)} disabled={publishMutation.isPending}>
            {publishMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Publish
          </Button>
        )}
        {template.status === "PUBLISHED" && (
          <Button variant="destructive" onClick={() => deactivateMutation.mutate(id)} disabled={deactivateMutation.isPending}>
            {deactivateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
            Deactivate
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowVersions(!showVersions)}>
          <History className="mr-2 h-4 w-4" />
          {showVersions ? "Hide History" : "Version History"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div className="lg:col-span-2 space-y-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">Template Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-foreground">Name</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary" />
                  </div>
                  {template.channel === "EMAIL" && (
                    <div className="space-y-2">
                      <Label className="text-foreground">Subject</Label>
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="bg-secondary" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-foreground">Body</Label>
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="bg-secondary font-mono text-sm" />
                  </div>
                </>
              ) : (
                <>
                  {template.subject && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Subject</p>
                      <p className="text-sm text-foreground">{template.subject}</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Body</p>
                    <pre className="whitespace-pre-wrap rounded-md bg-secondary p-4 font-mono text-sm text-foreground">{template.body}</pre>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">Variables</CardTitle>
            </CardHeader>
            <CardContent>
              {template.variables.length === 0 ? (
                <p className="text-sm text-muted-foreground">No variables defined</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {template.variables.map((v) => (
                    <span key={v} className="rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-foreground">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="space-y-6">
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs text-foreground">{template.id}</span>
              </div>
              <Separator className="bg-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}</span>
              </div>
              <Separator className="bg-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-foreground">{formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}</span>
              </div>
              {template.publishedAt && (
                <>
                  <Separator className="bg-border/50" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Published</span>
                    <span className="text-foreground">{formatDistanceToNow(new Date(template.publishedAt), { addSuffix: true })}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {showVersions && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-foreground">Version History</CardTitle>
                </CardHeader>
                <CardContent>
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
                          <div className="flex items-center gap-2">
                            <StatusBadge status={v.status} />
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(v.createdAt), "MMM d, yyyy HH:mm")}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <Clock className="mr-1 inline h-3 w-3" />
                            by {v.createdBy}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
