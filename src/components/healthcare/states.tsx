"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Compact variant for inline empty states */
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed border-border/80 bg-muted/20", className)}>
      <CardContent className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-6" : "py-14 px-6"
      )}>
        {Icon && (
          <div className={cn("mb-4 rounded-2xl bg-primary/10 flex items-center justify-center", compact ? "h-12 w-12" : "h-16 w-16")}>
            <Icon className={cn("text-primary", compact ? "h-5 w-5" : "h-7 w-7")} />
          </div>
        )}
        <h3 className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-base")}>{title}</h3>
        {description && <p className={cn("mt-1.5 text-muted-foreground max-w-sm leading-relaxed", compact ? "text-xs" : "text-sm")}>{description}</p>}
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  );
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-14", className)}>
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="flex flex-col items-center justify-center py-10 px-6 text-center">
        <p className="text-sm font-medium text-rose-700">{message}</p>
        {onRetry && (
          <Button onClick={onRetry} size="sm" variant="destructive" className="mt-4">
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Skeleton card grid for loading dashboards. */
export function SkeletonGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                <div className="h-7 w-16 rounded bg-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
