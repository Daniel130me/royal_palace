"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }>; badge?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "default" | "sm";
}

/**
 * iOS-style segmented control. Use for switching between 2-4 views within a
 * screen — saves vertical space vs. tabs and feels native on mobile.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, className, size = "default" }: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-xl bg-muted p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium transition-all tap-highlight-none",
              size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />}
            <span className="truncate">{opt.label}</span>
            {opt.badge ? (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {opt.badge > 99 ? "99+" : opt.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
