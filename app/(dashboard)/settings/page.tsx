"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useSettings, useUpdateProvider, useUpdateFallback } from "@/lib/hooks";
import { mockSettings } from "@/lib/mock-data";
import type { ChannelProviderConfig, FallbackConfig, NotificationChannel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, GripVertical, Mail, MessageSquare, Bell, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const channelIcons: Record<NotificationChannel, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SMS: <MessageSquare className="h-4 w-4" />,
  PUSH: <Bell className="h-4 w-4" />,
  WEBHOOK: <Globe className="h-4 w-4" />,
};

export default function SettingsPage() {
  const { data: fetchedSettings } = useSettings();
  const settings = fetchedSettings || mockSettings;

  const updateProviderMutation = useUpdateProvider();
  const updateFallbackMutation = useUpdateFallback();

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [providerConfigs, setProviderConfigs] = useState<Record<string, Record<string, string>>>({});
  const [providerEnabled, setProviderEnabled] = useState<Record<string, boolean>>({});

  const initEdit = (p: ChannelProviderConfig) => {
    setEditingProvider(`${p.channel}-${p.provider}`);
    setProviderConfigs((prev) => ({ ...prev, [`${p.channel}-${p.provider}`]: { ...p.config } }));
    setProviderEnabled((prev) => ({ ...prev, [`${p.channel}-${p.provider}`]: p.enabled }));
  };

  const handleSaveProvider = (p: ChannelProviderConfig) => {
    const key = `${p.channel}-${p.provider}`;
    updateProviderMutation.mutate(
      { ...p, config: providerConfigs[key] || p.config, enabled: providerEnabled[key] ?? p.enabled },
      { onSuccess: () => setEditingProvider(null) }
    );
  };

  const handleSaveFallback = (config: FallbackConfig) => {
    updateFallbackMutation.mutate(config, {
      onSuccess: () => toast.success(`Fallback order for ${config.channel} updated.`),
    });
  };

  const moveFallback = (channel: NotificationChannel, from: number, to: number) => {
    const config = settings.fallbackConfigs.find((f) => f.channel === channel);
    if (!config) return;
    const order = [...config.fallbackOrder];
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    handleSaveFallback({ channel, fallbackOrder: order });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure notification channels, providers, and fallback behavior" />

      <Tabs defaultValue="providers" className="space-y-6">
        <TabsList className="bg-secondary">
          <TabsTrigger value="providers">Channel Providers</TabsTrigger>
          <TabsTrigger value="fallbacks">Fallback Order</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-6">
          {(["EMAIL", "SMS", "PUSH"] as NotificationChannel[]).map((channel) => {
            const providers = settings.providers.filter((p) => p.channel === channel);
            if (providers.length === 0) return null;

            return (
              <motion.div key={channel} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      {channelIcons[channel]}
                      {channel} Providers
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Configure your {channel.toLowerCase()} delivery providers
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {providers.map((p) => {
                      const key = `${p.channel}-${p.provider}`;
                      const isEditing = editingProvider === key;

                      return (
                        <div key={key} className="rounded-lg border border-border/50 bg-secondary/50 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h4 className="font-medium text-foreground">{p.provider}</h4>
                              <Badge
                                variant="secondary"
                                className={
                                  (isEditing ? providerEnabled[key] : p.enabled)
                                    ? "border-0 bg-success/15 text-success"
                                    : "border-0 bg-muted text-muted-foreground"
                                }
                              >
                                {(isEditing ? providerEnabled[key] : p.enabled) ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            {!isEditing ? (
                              <Button variant="outline" size="sm" onClick={() => initEdit(p)}>
                                Configure
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={providerEnabled[key] ?? p.enabled}
                                  onCheckedChange={(v) => setProviderEnabled((prev) => ({ ...prev, [key]: v }))}
                                />
                              </div>
                            )}
                          </div>
                          {isEditing && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-3">
                              <Separator className="bg-border/50" />
                              {Object.entries(providerConfigs[key] || p.config).map(([configKey, value]) => (
                                <div key={configKey} className="space-y-1.5">
                                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{configKey.replace(/_/g, " ")}</Label>
                                  <Input
                                    value={value}
                                    onChange={(e) =>
                                      setProviderConfigs((prev) => ({
                                        ...prev,
                                        [key]: { ...(prev[key] || p.config), [configKey]: e.target.value },
                                      }))
                                    }
                                    type={configKey.toLowerCase().includes("key") || configKey.toLowerCase().includes("secret") ? "password" : "text"}
                                    className="bg-background font-mono text-sm"
                                  />
                                </div>
                              ))}
                              <div className="flex justify-end gap-2 pt-2">
                                <Button variant="ghost" size="sm" onClick={() => setEditingProvider(null)}>Cancel</Button>
                                <Button size="sm" onClick={() => handleSaveProvider(p)} disabled={updateProviderMutation.isPending}>
                                  {updateProviderMutation.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                                  Save
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </TabsContent>

        <TabsContent value="fallbacks" className="space-y-6">
          {settings.fallbackConfigs.map((config) => (
            <motion.div key={config.channel} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    {channelIcons[config.channel]}
                    {config.channel} Fallback Order
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Providers will be tried in this order. Drag to reorder.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {config.fallbackOrder.map((provider, i) => (
                      <div key={provider} className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/50 p-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm font-medium text-foreground">{provider}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={i === 0}
                            onClick={() => moveFallback(config.channel, i, i - 1)}
                            className="h-7 px-2 text-xs"
                          >
                            Up
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={i === config.fallbackOrder.length - 1}
                            onClick={() => moveFallback(config.channel, i, i + 1)}
                            className="h-7 px-2 text-xs"
                          >
                            Down
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
