"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { DashboardMetrics } from "@/lib/types";
import { motion } from "framer-motion";

const COLORS = {
  primary: "oklch(0.585 0.2 265)",
  success: "oklch(0.7 0.18 160)",
  destructive: "oklch(0.55 0.22 15)",
  warning: "oklch(0.8 0.16 85)",
  muted: "oklch(0.28 0.02 265)",
  grid: "oklch(0.22 0.02 265)",
  text: "oklch(0.6 0.02 265)",
};

interface DashboardChartsProps {
  metrics: DashboardMetrics;
}

export function DashboardCharts({ metrics }: DashboardChartsProps) {
  const dailyData = metrics.dailyStats.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Total: s.total,
    Success: s.success,
    Failed: s.failed,
  }));

  const channelData = metrics.channelBreakdown.map((c) => ({
    name: c.channel,
    total: c.total,
    success: c.success,
    failed: c.failed,
  }));

  const pieData = metrics.channelBreakdown.map((c) => ({
    name: c.channel,
    value: c.total,
  }));

  const PIE_COLORS = [COLORS.primary, COLORS.success, COLORS.warning];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Daily Notifications Area Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-card-foreground">Notification Volume</CardTitle>
            <CardDescription>Daily notification delivery trends</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.destructive} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.destructive} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="date" stroke={COLORS.text} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={COLORS.text} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.02 265)",
                    border: "1px solid oklch(0.28 0.02 265)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0.01 265)",
                  }}
                  formatter={(value: number) => [value.toLocaleString(), undefined]}
                />
                <Area
                  type="monotone"
                  dataKey="Success"
                  stroke={COLORS.success}
                  fill="url(#successGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="Failed"
                  stroke={COLORS.destructive}
                  fill="url(#failedGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Channel Distribution Pie Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-card-foreground">Channel Distribution</CardTitle>
            <CardDescription>Notification volume by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.02 265)",
                    border: "1px solid oklch(0.28 0.02 265)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0.01 265)",
                  }}
                  formatter={(value: number) => [value.toLocaleString(), undefined]}
                />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value) => <span style={{ color: "oklch(0.6 0.02 265)" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Channel Breakdown Bar Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="lg:col-span-2"
      >
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-card-foreground">Channel Performance</CardTitle>
            <CardDescription>Success vs failure rates per channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="name" stroke={COLORS.text} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={COLORS.text} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.02 265)",
                    border: "1px solid oklch(0.28 0.02 265)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0.01 265)",
                  }}
                  formatter={(value: number) => [value.toLocaleString(), undefined]}
                />
                <Bar dataKey="success" name="Success" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill={COLORS.destructive} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
