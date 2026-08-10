"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
}

const TONES: Record<string, string> = {
  default: "text-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-rose-600",
  info: "text-sky-600",
};

export function MetricCard({ label, value, icon: Icon, hint, tone = "default", onClick }: MetricCardProps) {
  return (
    <Card
      className={cn("overflow-hidden transition-shadow", onClick && "cursor-pointer hover:shadow-md")}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={cn("mt-1 text-2xl font-bold truncate", TONES[tone])}>{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground truncate">{hint}</p>}
          </div>
          {Icon && (
            <div className="rounded-lg bg-muted p-2 shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
