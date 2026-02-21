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
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState("");

  const createMutation = useCreateTemplate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const vars = variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    createMutation.mutate(
      {
        name,
        channel,
        subject: channel === "EMAIL" ? subject : undefined,
        body,
        variables: vars,
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
    setBody("");
    setVariables("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create Template</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a new notification template. Templates start as drafts and can be published later.
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
            <Select value={channel} onValueChange={(v) => setChannel(v as NotificationChannel)}>
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
            <Label htmlFor="tpl-body" className="text-foreground">Body</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Use {{variableName}} for dynamic content..."}
              rows={6}
              required
              className="bg-secondary font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-vars" className="text-foreground">Variables</Label>
            <Input
              id="tpl-vars"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              placeholder="Comma-separated: name, email, link"
              className="bg-secondary"
            />
            <p className="text-xs text-muted-foreground">
              Enter template variable names separated by commas
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
