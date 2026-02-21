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

export default function DashboardPage() {
  const [period, setPeriod] = useState("7d");
  const { data, isLoading } = useDashboardMetrics(period);

  const metrics = data || mockDashboardMetrics;

  if (isLoading && !metrics) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of your notification infrastructure" />
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

      {/*
        Metric Cards Grid
        ─────────────────
        • 1 col on mobile (stacked)
        • 2 cols on sm (≥640px)
        • 3 cols on lg (≥1024px)
        • 3 cols on xl too — 6 equal cols was too narrow, cards looked crushed
        
        Each MetricCard gets an `index` prop so animations stagger nicely.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          index={0}
          title="Total Notifications"
          value={metrics.totalNotifications.toLocaleString()}
          icon={Bell}
          trend={{ value: 12.5, label: "vs last period" }}
          variant="default"
        />
        <MetricCard
          index={1}
          title="Success Rate"
          value={`${metrics.successRate}%`}
          icon={CheckCircle}
          trend={{ value: 0.3, label: "vs last period" }}
          variant="success"
        />
        <MetricCard
          index={2}
          title="Failure Rate"
          value={`${metrics.failureRate}%`}
          icon={XCircle}
          trend={{ value: -0.3, label: "vs last period" }}
          variant="destructive"
        />
        <MetricCard
          index={3}
          title="Avg Delivery"
          value={`${metrics.avgDeliveryTimeMs}ms`}
          icon={Clock}
          subtitle="Mean delivery time"
          variant="default"
        />
        <MetricCard
          index={4}
          title="P99 Latency"
          value={`${metrics.p99LatencyMs}ms`}
          icon={Gauge}
          subtitle="99th percentile"
          variant="warning"
        />
        <MetricCard
          index={5}
          title="DLQ Count"
          value={metrics.dlqCount.toLocaleString()}
          icon={AlertTriangle}
          subtitle="Pending review"
          variant="destructive"
        />
      </div>

      {/* Charts */}
      <DashboardCharts metrics={metrics} />
    </div>
  );
}