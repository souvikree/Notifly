"use client";

import { useState } from "react";
import { useCreateTemplate } from "@/lib/hooks";
import type { NotificationChannel } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTemplateDialog({ open, onOpenChange }: CreateTemplateDialogProps) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>("EMAIL");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");  // was "body" — backend field is "content"

  const createMutation = useCreateTemplate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    createMutation.mutate(
      {
        name,
        channel,
        content,                                          // backend expects "content"
        subject: channel === "EMAIL" ? subject || undefined : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      }
    );
  };

  const resetForm = () => {
    setName("");
    setChannel("EMAIL");
    setSubject("");
    setContent("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create Template</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a new notification template. Use{" "}
            <code className="rounded bg-secondary px-1 text-xs">{"{{variableName}}"}</code> for
            dynamic content.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name" className="text-foreground">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome Email"
              required
              className="bg-secondary"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Channel</Label>
            <Select
              value={channel}
              onValueChange={(v) => setChannel(v as NotificationChannel)}
            >
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="PUSH">Push</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {channel === "EMAIL" && (
            <div className="space-y-2">
              <Label htmlFor="tpl-subject" className="text-foreground">Subject</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Welcome to {{appName}}"
                className="bg-secondary"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tpl-content" className="text-foreground">
              {channel === "EMAIL" ? "Body (HTML)" : "Message"}
            </Label>
            <Textarea
              id="tpl-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                channel === "EMAIL"
                  ? "<p>Hello {{name}}, welcome to {{appName}}!</p>"
                  : channel === "SMS"
                  ? "Your code is {{otp}}. Expires in {{expiry}} minutes."
                  : "{{title}}: {{message}}"
              }
              rows={6}
              required
              className="bg-secondary font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="rounded bg-secondary px-1">{"{{variableName}}"}</code> for
              dynamic values
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !name || !content}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}