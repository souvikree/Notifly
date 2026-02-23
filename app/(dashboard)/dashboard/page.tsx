"use client";

import { useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { DashboardSkeleton } from "@/components/loading-states";
import { PageHeader } from "@/components/page-header";
import { DashboardCharts } from "@/components/dashboard-charts";
import { mockDashboardMetrics } from "@/lib/mock-data";
import { useDashboardMetrics } from "@/lib/hooks";
import {
  Bell,
  CheckCircle,
  XCircle,
  Clock,
  Gauge,
  AlertTriangle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardMetrics } from "@/lib/types";

// Safe default — guarantees all numeric fields are never undefined
const DEFAULT_METRICS: DashboardMetrics = {
  totalNotifications: 0,
  successRate: 0,
  failureRate: 0,
  avgDeliveryTimeMs: 0,
  p99LatencyMs: 0,
  dlqCount: 0,
  channelBreakdown: [],
  dailyStats: [],
};

export default function DashboardPage() {
  const [period, setPeriod] = useState("7d");
  const { data, isLoading, isError } = useDashboardMetrics(period);

  // Priority: real API data → mock data (dev/demo) → safe zeros
  const metrics: DashboardMetrics = {
    ...DEFAULT_METRICS,
    ...(data ?? (isError ? mockDashboardMetrics : DEFAULT_METRICS)),
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Overview of your notification infrastructure"
        />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your notification infrastructure"
      >
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px] bg-secondary">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isError && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          Could not reach the API — showing demo data. Make sure the backend is running on port 8080.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          index={0}
          title="Total Notifications"
          value={(metrics.totalNotifications ?? 0).toLocaleString()}
          icon={Bell}
          trend={{ value: 12.5, label: "vs last period" }}
          variant="default"
        />
        <MetricCard
          index={1}
          title="Success Rate"
          value={`${metrics.successRate ?? 0}%`}
          icon={CheckCircle}
          trend={{ value: 0.3, label: "vs last period" }}
          variant="success"
        />
        <MetricCard
          index={2}
          title="Failure Rate"
          value={`${metrics.failureRate ?? 0}%`}
          icon={XCircle}
          trend={{ value: -0.3, label: "vs last period" }}
          variant="destructive"
        />
        <MetricCard
          index={3}
          title="Avg Delivery"
          value={`${metrics.avgDeliveryTimeMs ?? 0}ms`}
          icon={Clock}
          subtitle="Mean delivery time"
          variant="default"
        />
        <MetricCard
          index={4}
          title="P99 Latency"
          value={`${metrics.p99LatencyMs ?? 0}ms`}
          icon={Gauge}
          subtitle="99th percentile"
          variant="warning"
        />
        <MetricCard
          index={5}
          title="DLQ Count"
          value={(metrics.dlqCount ?? 0).toLocaleString()}
          icon={AlertTriangle}
          subtitle="Pending review"
          variant="destructive"
        />
      </div>

      <DashboardCharts metrics={metrics} />
    </div>
  );
}