"use client";

import { authService } from "@/lib/services";
import { useNav } from "@/lib/nav";
import { useState } from "react";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PERSONAS = [
  { role: "patient", email: "amina@demo.com", name: "Amina Bello", label: "Patient" },
  { role: "doctor", email: "doctor@demo.com", name: "Dr. Tunde Adeyemi", label: "Doctor" },
  { role: "pharmacy", email: "pharmacy@demo.com", name: "Grace Pharmacy", label: "Pharmacy" },
  { role: "laboratory", email: "lab@demo.com", name: "MedLab Diagnostics", label: "Laboratory" },
  { role: "logistics", email: "logistics@demo.com", name: "SwiftCare Logistics", label: "Logistics" },
  { role: "admin", email: "admin@demo.com", name: "Royal Palace Admin", label: "Admin" },
  { role: "manager", email: "manager@demo.com", name: "Oluwagbenga Kosoko", label: "Manager" },
] as const;

export function PersonaSwitcher() {
  const { setSession, view } = useNav();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  // Hide on login/public for cleanliness (optional — keep on public too for easy demo).
  if (view.portal === "login") return null;

  async function switchTo(email: string, role: string) {
    setLoading(role);
    try {
      const session = await authService.login(email, "demo123");
      setSession(session);
      setOpen(false);
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 flex items-center gap-2 rounded-full bg-foreground px-3 py-2 text-xs font-medium text-background shadow-soft-lg hover:opacity-90 tap-highlight-none lg:bottom-4"
        title="Demo Persona Switcher"
      >
        <Users className="h-4 w-4" />
        <span className="hidden sm:inline">Demo Persona Switcher</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl bg-background shadow-xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="font-semibold text-sm">Demo Persona Switcher</p>
                <p className="text-xs text-muted-foreground">Instantly sign in as another role.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 grid gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.role}
                  onClick={() => switchTo(p.email, p.role)}
                  disabled={loading !== null}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 text-left hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50",
                    useNav.getState().session?.role === p.role && "border-emerald-500 bg-emerald-50"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                </button>
              ))}
            </div>
            <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
              Prototype feature — not for production.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
