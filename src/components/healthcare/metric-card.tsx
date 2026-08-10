"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "violet";
  onClick?: () => void;
  className?: string;
}

const TONES: Record<string, { text: string; bg: string; ring: string }> = {
  default: { text: "text-foreground", bg: "bg-muted", ring: "" },
  success: { text: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-100" },
  warning: { text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-100" },
  danger: { text: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-100" },
  info: { text: "text-sky-600", bg: "bg-sky-50", ring: "ring-sky-100" },
  violet: { text: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-100" },
};

export function MetricCard({ label, value, icon: Icon, hint, tone = "default", onClick, className }: MetricCardProps) {
  const t = TONES[tone];
  return (
    <Card
      className={cn("overflow-hidden transition-all", onClick && "cursor-pointer hover:shadow-soft-md hover:border-border", className)}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
            <p className={cn("mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight leading-none", t.text)}>{value}</p>
            {hint && <p className="mt-1.5 text-xs text-muted-foreground truncate leading-tight">{hint}</p>}
          </div>
          {Icon && (
            <div className={cn("rounded-xl p-2 shrink-0 ring-1", t.bg, t.ring)}>
              <Icon className={cn("h-5 w-5", t.text)} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact metric for dense dashboards. */
export function MiniMetric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold leading-none", t.text)}>{value}</p>
    </div>
  );
}
