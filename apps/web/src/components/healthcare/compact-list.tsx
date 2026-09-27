"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

interface CompactListItemProps {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  /** Show chevron right indicator */
  chevron?: boolean;
}

/**
 * A single-line list row — denser than a card, ideal for lists of records,
 * appointments, etc. Tappable with leading avatar/icon + title/subtitle +
 * trailing meta. Minimizes vertical space vs. card-based lists.
 */
export function CompactListItem({ leading, title, subtitle, trailing, onClick, className, chevron }: CompactListItemProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        onClick && "hover:bg-accent active:bg-accent/70 tap-highlight-none",
        className
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5 leading-tight">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
      {chevron && onClick && <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
    </Comp>
  );
}

interface ExpandableCardProps {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * A list row that expands to reveal more detail inline — saves a screen
 * navigation while keeping the list compact.
 */
export function ExpandableCard({ leading, title, subtitle, trailing, children, defaultOpen = false, className }: ExpandableCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card overflow-hidden", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 tap-highlight-none"
      >
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5 leading-tight">{subtitle}</p>}
        </div>
        {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground/60 shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/40 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "violet";
  onClick?: () => void;
  className?: string;
}

const TONES: Record<string, string> = {
  default: "text-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-rose-600",
  info: "text-sky-600",
  violet: "text-violet-600",
};

/**
 * A small tappable stat tile — denser than MetricCard. Use in 2x2 or 4-col
 * grids for dashboard quick-glances.
 */
export function StatTile({ label, value, icon: Icon, tone = "default", onClick, className }: StatTileProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-col gap-1 rounded-xl border border-border/60 bg-card p-3 text-left transition-all",
        onClick && "hover:border-border hover:shadow-soft tap-highlight-none active:scale-[0.98]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-none">{label}</span>
        {Icon && <Icon className={cn("h-3.5 w-3.5", TONES[tone])} />}
      </div>
      <span className={cn("text-lg font-bold leading-none tracking-tight", TONES[tone])}>{value}</span>
    </button>
  );
}
