"use client";

// Settings page (plan §3.1): notification preferences (stored locally in the
// prototype), a note about theming and the sign-out control.

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { PageHeader, SectionCard } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeftRight, Bell, Coins, Info, LifeBuoy, LogOut, Moon, Wallet,
} from "lucide-react";

const PREFS_KEY = "managerNotificationPrefs";

interface ManagerPrefs {
  earnings: boolean;
  payouts: boolean;
  tickets: boolean;
  assignments: boolean;
}

const DEFAULT_PREFS: ManagerPrefs = {
  earnings: true,
  payouts: true,
  tickets: true,
  assignments: true,
};

function readPrefs(): ManagerPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ManagerPrefs>;
    return {
      earnings: parsed.earnings ?? DEFAULT_PREFS.earnings,
      payouts: parsed.payouts ?? DEFAULT_PREFS.payouts,
      tickets: parsed.tickets ?? DEFAULT_PREFS.tickets,
      assignments: parsed.assignments ?? DEFAULT_PREFS.assignments,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function ManagerSettings() {
  const { logout } = useNav();
  const [prefs, setPrefs] = useState<ManagerPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  function toggle(key: keyof ManagerPrefs, value: boolean) {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable — preference stays for this session only */
        }
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Notification preferences and account controls for the Manager Portal."
      />

      <SectionCard
        title="Notification preferences"
        icon={Bell}
        description="Choose what you want to be alerted about across your portfolio"
      >
        <div className="divide-y divide-border/40">
          <PrefRow
            id="pref-earnings"
            icon={<Coins className="h-4 w-4 text-primary" />}
            title="Earnings notifications"
            description="New Manager Earnings entries, maturities and reversals"
            checked={prefs.earnings}
            onChange={(v) => toggle("earnings", v)}
          />
          <PrefRow
            id="pref-payouts"
            icon={<Wallet className="h-4 w-4 text-primary" />}
            title="Payout updates"
            description="Status changes on your payout requests (requested, processing, paid)"
            checked={prefs.payouts}
            onChange={(v) => toggle("payouts", v)}
          />
          <PrefRow
            id="pref-tickets"
            icon={<LifeBuoy className="h-4 w-4 text-primary" />}
            title="Support ticket updates"
            description="New tickets, replies and escalations in your portfolio"
            checked={prefs.tickets}
            onChange={(v) => toggle("tickets", v)}
          />
          <PrefRow
            id="pref-assignments"
            icon={<ArrowLeftRight className="h-4 w-4 text-primary" />}
            title="Assignment changes"
            description="Organizations added to or removed from your portfolio"
            checked={prefs.assignments}
            onChange={(v) => toggle("assignments", v)}
          />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Preferences are stored locally in this prototype.
        </p>
      </SectionCard>

      <SectionCard title="Appearance" icon={Moon} description="Theming">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Manager Portal follows your system light/dark preference — there is no separate in-app theme switch in this prototype.
        </p>
      </SectionCard>

      <Card className="border-rose-200">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Sign out</p>
              <p className="text-sm text-muted-foreground mt-0.5">End your Manager Portal session on this device.</p>
            </div>
            <Button variant="destructive" onClick={logout} className="shrink-0">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PrefRow({
  id, icon, title, description, checked, onChange,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-semibold cursor-pointer">{title}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
