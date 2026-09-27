"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNav } from "@/lib/nav";

// Re-export shared state components for convenience — many pages import
// { PageHeader, EmptyState, LoadingState, ErrorState } from here.
export { EmptyState, LoadingState, ErrorState, SkeletonGrid } from "./states";

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  actions?: React.ReactNode;
  /** Optional back button (defaults to browser back) */
  back?: boolean;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, actions, back = false, className }: PageHeaderProps) {
  const { back: navBack } = useNav();
  return (
    <div className={cn("mb-5 sm:mb-6", className)}>
      {back && (
        <button
          onClick={() => navBack()}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground tap-highlight-none"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {b.onClick ? (
                <button onClick={b.onClick} className="hover:text-foreground hover:underline tap-highlight-none">
                  {b.label}
                </button>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? "text-foreground font-medium" : ""}>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-[28px] font-bold tracking-tight leading-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Tighter padding for dense lists */
  dense?: boolean;
}

export function SectionCard({ title, description, icon: Icon, action, children, className, contentClassName, dense }: SectionCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || action) && (
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              {title && <CardTitle className="text-sm sm:text-base truncate">{title}</CardTitle>}
              {description && <CardDescription className="text-xs mt-0.5 truncate">{description}</CardDescription>}
            </div>
          </div>
          {action && <CardAction className="self-center">{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn(dense ? "p-0" : "p-4 sm:p-5", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

/** A sticky bottom action bar for mobile-first flows (e.g. booking, checkout). */
export function BottomActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/60 safe-pb px-4 py-3",
      className
    )}>
      {children}
    </div>
  );
}
