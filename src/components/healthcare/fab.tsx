"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FabProps {
  icon: LucideIcon;
  label?: string;
  onClick: () => void;
  className?: string;
  tone?: "primary" | "default";
}

/**
 * Floating Action Button. On mobile sits above the bottom tab bar;
 * on desktop sits in the bottom-right corner. Optional label expands it.
 */
export function Fab({ icon: Icon, label, onClick, className, tone = "primary" }: FabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed z-30 flex items-center gap-2 rounded-full shadow-soft-lg transition-all active:scale-95 tap-highlight-none",
        label ? "px-4 py-3" : "p-3.5",
        tone === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-foreground text-background hover:bg-foreground/90",
        "bottom-24 right-4 lg:bottom-6 lg:right-6",
        className
      )}
    >
      <Icon className="h-5 w-5" />
      {label && <span className="text-sm font-medium pr-1">{label}</span>}
    </button>
  );
}
