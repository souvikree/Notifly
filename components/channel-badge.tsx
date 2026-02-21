"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Mail, MessageSquare, Bell, Webhook } from "lucide-react";
import type { NotificationChannel } from "@/lib/types";

const channelConfig: Record<
  NotificationChannel,
  { label: string; icon: typeof Mail; className: string }
> = {
  EMAIL: {
    label: "Email",
    icon: Mail,
    className: "bg-chart-1/15 text-chart-1 border-chart-1/20",
  },
  SMS: {
    label: "SMS",
    icon: MessageSquare,
    className: "bg-chart-2/15 text-chart-2 border-chart-2/20",
  },
  PUSH: {
    label: "Push",
    icon: Bell,
    className: "bg-chart-3/15 text-chart-3 border-chart-3/20",
  },
  WEBHOOK: {
    label: "Webhook",
    icon: Webhook,
    className: "bg-chart-4/15 text-chart-4 border-chart-4/20",
  },
};

interface ChannelBadgeProps {
  channel: NotificationChannel;
  className?: string;
}

export function ChannelBadge({ channel, className }: ChannelBadgeProps) {
  const config = channelConfig[channel] ?? channelConfig.EMAIL;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}