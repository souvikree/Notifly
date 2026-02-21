"use client";

import { useState, useRef } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/loading-states";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/lib/hooks";
import { mockApiKeys } from "@/lib/mock-data";
import type { ApiKey, CreateApiKeyResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Key,
  Copy,
  Check,
  Loader2,
  Trash2,
  Shield,
  Eye,
  Terminal,
  AlertTriangle,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// --- Code Snippets ---
const codeSnippets: Record<string, { label: string; lang: string; code: (key: string) => string }> = {
  curl: {
    label: "cURL",
    lang: "bash",
    code: (key) => `curl -X POST https://api.notifly.io/v1/notifications \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channel": "EMAIL",
    "recipient": "user@example.com",
    "templateId": "tmpl-001",
    "payload": {
      "name": "John",
      "orderId": "ORD-1234"
    }
  }'`,
  },
  nodejs: {
    label: "Node.js",
    lang: "javascript",
    code: (key) => `import axios from "axios";

const notifly = axios.create({
  baseURL: "https://api.notifly.io/v1",
  headers: {
    Authorization: "Bearer ${key}",
    "Content-Type": "application/json",
  },
});

const response = await notifly.post("/notifications", {
  channel: "EMAIL",
  recipient: "user@example.com",
  templateId: "tmpl-001",
  payload: {
    name: "John",
    orderId: "ORD-1234",
  },
});

console.log("Notification sent:", response.data);`,
  },
  python: {
    label: "Python",
    lang: "python",
    code: (key) => `import requests

API_KEY = "${key}"
BASE_URL = "https://api.notifly.io/v1"

response = requests.post(
    f"{BASE_URL}/notifications",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "channel": "EMAIL",
        "recipient": "user@example.com",
        "templateId": "tmpl-001",
        "payload": {
            "name": "John",
            "orderId": "ORD-1234",
        },
    },
)

print("Notification sent:", response.json())`,
  },
  java: {
    label: "Java",
    lang: "java",
    code: (key) => `import java.net.http.*;
import java.net.URI;

public class NotiflyExample {
    public static void main(String[] args) throws Exception {
        String apiKey = "${key}";

        String body = """
            {
              "channel": "EMAIL",
              "recipient": "user@example.com",
              "templateId": "tmpl-001",
              "payload": {
                "name": "John",
                "orderId": "ORD-1234"
              }
            }
            """;

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.notifly.io/v1/notifications"))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpClient client = HttpClient.newHttpClient();
        HttpResponse<String> response = client.send(
            request, HttpResponse.BodyHandlers.ofString()
        );

        System.out.println("Status: " + response.statusCode());
        System.out.println("Body: " + response.body());
    }
}`,
  },
  go: {
    label: "Go",
    lang: "go",
    code: (key) => `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "io"
)

func main() {
    apiKey := "${key}"

    payload := map[string]interface{}{
        "channel":    "EMAIL",
        "recipient":  "user@example.com",
        "templateId": "tmpl-001",
        "payload": map[string]string{
            "name":    "John",
            "orderId": "ORD-1234",
        },
    }

    body, _ := json.Marshal(payload)

    req, _ := http.NewRequest("POST",
        "https://api.notifly.io/v1/notifications",
        bytes.NewBuffer(body),
    )
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    respBody, _ := io.ReadAll(resp.Body)
    fmt.Println("Response:", string(respBody))
}`,
  },
  ruby: {
    label: "Ruby",
    lang: "ruby",
    code: (key) => `require "net/http"
require "json"
require "uri"

api_key = "${key}"
uri = URI("https://api.notifly.io/v1/notifications")

http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true

request = Net::HTTP::Post.new(uri)
request["Authorization"] = "Bearer #{api_key}"
request["Content-Type"] = "application/json"
request.body = {
  channel: "EMAIL",
  recipient: "user@example.com",
  templateId: "tmpl-001",
  payload: {
    name: "John",
    orderId: "ORD-1234"
  }
}.to_json

response = http.request(request)
puts "Response: #{response.body}"`,
  },
  rust: {
    label: "Rust",
    lang: "rust",
    code: (key) => `use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = "${key}";

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.notifly.io/v1/notifications")
        .header(AUTHORIZATION, format!("Bearer {}", api_key))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "channel": "EMAIL",
            "recipient": "user@example.com",
            "templateId": "tmpl-001",
            "payload": {
                "name": "John",
                "orderId": "ORD-1234"
            }
        }))
        .send()
        .await?;

    println!("Status: {}", response.status());
    println!("Body: {}", response.text().await?);
    Ok(())
}`,
  },
  php: {
    label: "PHP",
    lang: "php",
    code: (key) => `<?php

$apiKey = "${key}";

$data = json_encode([
    "channel" => "EMAIL",
    "recipient" => "user@example.com",
    "templateId" => "tmpl-001",
    "payload" => [
        "name" => "John",
        "orderId" => "ORD-1234",
    ],
]);

$ch = curl_init("https://api.notifly.io/v1/notifications");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $data,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . $apiKey,
        "Content-Type: application/json",
    ],
]);

$response = curl_exec($ch);
curl_close($ch);

echo "Response: " . $response . "\\n";`,
  },
};

// --- Copy Button Inline ---
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={`gap-1.5 text-xs text-muted-foreground hover:text-foreground ${className ?? ""}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-success" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>Copy to clipboard</span>
        </>
      )}
    </Button>
  );
}

// --- Key Reveal Modal ---
function KeyRevealDialog({
  open,
  onOpenChange,
  apiKey,
  label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apiKey: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Key className="h-4 w-4 text-primary" />
            </div>
            {label}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Your API key for authenticating with the Notifly API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Key label */}
          <div className="flex items-center gap-2">
            <Badge className="border-0 bg-success/15 text-success">
              <Sparkles className="mr-1 h-3 w-3" />
              Your API Key (Live)
            </Badge>
          </div>

          {/* Key display */}
          <div className="relative overflow-hidden rounded-lg border border-border bg-background/50 p-4">
            <code className="block break-all font-mono text-sm leading-relaxed text-foreground">
              {apiKey}
            </code>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          </div>

          {/* Copy button */}
          <Button
            onClick={handleCopy}
            className="w-full gap-2"
            variant={copied ? "outline" : "default"}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-success" />
                Copied to clipboard
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy to clipboard
              </>
            )}
          </Button>

          {/* Warning */}
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm leading-relaxed text-warning">
              {"Please store it securely. Don't share it with anyone. This key grants full access to your Notifly account."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Code Block ---
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="relative">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-secondary/50 px-4 py-2">
        <span className="font-mono text-xs text-muted-foreground">{lang}</span>
        <CopyButton text={code} />
      </div>
      <div className="overflow-auto rounded-b-lg border border-border bg-background/40 p-4">
        <pre className="font-mono text-sm leading-relaxed text-foreground/90">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

// =====================
// Main Page Component
// =====================
export default function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showRevoke, setShowRevoke] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<CreateApiKeyResponse | null>(null);
  const [viewKeyData, setViewKeyData] = useState<{ key: string; label: string } | null>(null);
  const [selectedTab, setSelectedTab] = useState("curl");
  const usageSectionRef = useRef<HTMLDivElement>(null);

  const [keyName, setKeyName] = useState("");
  const [expiry, setExpiry] = useState("90");

  const { data, isLoading } = useApiKeys();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const keys: ApiKey[] = data || mockApiKeys;
  const activeKeys = keys.filter((k) => k.status === "ACTIVE");
  const revokedKeys = keys.filter((k) => k.status === "REVOKED");

  // The key to use for code snippets
  const snippetKey = newKey?.key || (activeKeys.length > 0 ? `${activeKeys[0].keyPrefix}...` : "nfy_live_YOUR_API_KEY");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { name: keyName, expiresInDays: expiry === "never" ? undefined : parseInt(expiry) },
      {
        onSuccess: (data) => {
          const fakeResponse: CreateApiKeyResponse = {
            id: `key-${Date.now()}`,
            name: keyName,
            key: `nfy_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
            expiresAt:
              expiry !== "never" ? new Date(Date.now() + parseInt(expiry) * 86400000).toISOString() : undefined,
          };
          const response = data || fakeResponse;
          setNewKey(response);
          setShowCreate(false);
          setKeyName("");
          setExpiry("90");
        },
      }
    );
  };

  const handleRevoke = () => {
    if (showRevoke) {
      revokeMutation.mutate(showRevoke, { onSuccess: () => setShowRevoke(null) });
    }
  };

  const scrollToUsage = () => {
    usageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Keys" description="Manage API keys" />
        <TableSkeleton rows={4} cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="API Keys" description="Generate and manage API keys for authenticating with the Notifly API.">
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Generate API Key
        </Button>
      </PageHeader>

      {/* Security Notice */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Keep your API keys secure</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                API keys grant full access to the Notifly API. Never expose them in client-side code, share them publicly,
                or commit them to version control. Use environment variables in production.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Summary Stats */}
      {keys.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{activeKeys.length}</p>
                  <p className="text-xs text-muted-foreground">Active Keys</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Trash2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{revokedKeys.length}</p>
                  <p className="text-xs text-muted-foreground">Revoked Keys</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
                  <Terminal className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {keys.reduce((sum, k) => sum + k.totalRequests, 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Keys Table */}
      {keys.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent>
            <EmptyState
              icon={Key}
              title="No API keys yet"
              description="Generate your first API key to start sending notifications through the Notifly API."
            >
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Generate API Key
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Your API Keys</CardTitle>
              <CardDescription className="text-muted-foreground">
                Click any key to view details and copy options.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Name</TableHead>
                      <TableHead className="text-muted-foreground">Key</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-muted-foreground">Requests</TableHead>
                      <TableHead className="text-muted-foreground">Last Used</TableHead>
                      <TableHead className="text-muted-foreground">Expires</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((k, i) => (
                      <motion.tr
                        key={k.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                        className="group border-border/50 hover:bg-accent/30"
                      >
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${k.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/40"}`}
                            />
                            {k.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() =>
                                  setViewKeyData({
                                    key: `${k.keyPrefix}${"x".repeat(32)}`,
                                    label: k.name,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                <Key className="h-3 w-3" />
                                {k.keyPrefix}...
                                <Eye className="ml-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Click to view key details</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={k.status === "ACTIVE" ? "default" : "secondary"}
                            className={
                              k.status === "ACTIVE"
                                ? "border-0 bg-success/15 text-success"
                                : "border-0 bg-muted text-muted-foreground"
                            }
                          >
                            {k.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-foreground">
                          {k.totalRequests.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {k.lastUsedAt
                            ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {k.expiresAt
                            ? formatDistanceToNow(new Date(k.expiresAt), { addSuffix: true })
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {k.status === "ACTIVE" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowRevoke(k.id)}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Revoke key</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Revoke this key</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Scroll to usage CTA */}
      {keys.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center"
        >
          <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={scrollToUsage}>
            <ArrowDown className="h-4 w-4" />
            How to use this API key
          </Button>
        </motion.div>
      )}

      {/* Usage Guide Section */}
      <motion.div
        ref={usageSectionRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">How to use this API key</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Choose your language and copy the code snippet to start sending notifications.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
              <div className="overflow-x-auto pb-2">
                <TabsList className="inline-flex h-9 w-auto gap-1 bg-secondary/50 p-1">
                  {Object.entries(codeSnippets).map(([key, { label }]) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="rounded-md px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="mt-4">
                <AnimatePresence mode="wait">
                  {Object.entries(codeSnippets).map(([key, { lang, code }]) => (
                    <TabsContent key={key} value={key} className="mt-0">
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CodeBlock code={code(snippetKey)} lang={lang} />
                      </motion.div>
                    </TabsContent>
                  ))}
                </AnimatePresence>
              </div>
            </Tabs>

            {/* Additional hints */}
            <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
              <h4 className="text-sm font-medium text-foreground">Quick Integration Steps</h4>
              <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    1
                  </span>
                  <span>Generate an API key above and store it in your environment variables.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    2
                  </span>
                  <span>Select your preferred language tab and copy the code snippet.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    3
                  </span>
                  <span>
                    {"Replace the template ID and payload with your actual notification data."}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    4
                  </span>
                  <span>
                    {"Check the "}
                    <a href="/logs" className="text-primary underline underline-offset-4 hover:text-primary/80">
                      Notification Logs
                    </a>
                    {" page to verify delivery."}
                  </span>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ==================== DIALOGS ==================== */}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              Generate API Key
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Create a new API key. The full key will only be shown once after generation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name" className="text-foreground">
                Key Name
              </Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. Production Server"
                required
                className="bg-secondary"
              />
              <p className="text-xs text-muted-foreground">A descriptive name to identify this key.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Expiration</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">Never expires</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Key Reveal Dialog */}
      {newKey && (
        <KeyRevealDialog
          open={!!newKey}
          onOpenChange={() => setNewKey(null)}
          apiKey={newKey.key}
          label={newKey.name}
        />
      )}

      {/* View Key Details Dialog (from table click) */}
      {viewKeyData && (
        <KeyRevealDialog
          open={!!viewKeyData}
          onOpenChange={() => setViewKeyData(null)}
          apiKey={viewKeyData.key}
          label={viewKeyData.label}
        />
      )}

      {/* Revoke Confirmation */}
      <AlertDialog open={!!showRevoke} onOpenChange={() => setShowRevoke(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              Revoke API Key
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. Any services using this key will immediately lose access to the Notifly API.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
