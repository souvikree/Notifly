"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: "default" | "success" | "destructive" | "warning";
  className?: string;
  index?: number;
}

const variantStyles = {
  default: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
};

const bgStyles = {
  default: "bg-primary/10",
  success: "bg-success/10",
  destructive: "bg-destructive/10",
  warning: "bg-warning/10",
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  className,
  index = 0,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="h-full"
    >
      <Card className={cn("h-full border-border/50 bg-card", className)}>
        {/* Override Card's default py-6/gap-6 with compact padding */}
        <CardContent className="flex h-full flex-col justify-between p-5">
          {/* Top row: title + icon */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight text-muted-foreground">{title}</p>
            <div className={cn("shrink-0 rounded-lg p-2.5", bgStyles[variant])}>
              <Icon className={cn("h-4 w-4", variantStyles[variant])} />
            </div>
          </div>

          {/* Value */}
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-card-foreground">
              {value}
            </p>

            {/* Subtitle or trend */}
            <div className="mt-1.5 min-h-[1.25rem]">
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
              {trend && (
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      trend.value >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {trend.value >= 0 ? "+" : ""}
                    {trend.value}%
                  </span>
                  <span className="text-xs text-muted-foreground">{trend.label}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}