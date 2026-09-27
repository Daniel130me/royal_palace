"use client";

// Managers do not collect or edit enrollment data. They only share attributed
// links; applicants submit directly to Royal Palace for Admin review.

import { useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, UserRoundPlus, Pill, FlaskConical, Hospital, Check } from "lucide-react";
import { toast } from "sonner";
import type { Manager } from "@/types";

const ENROLLMENT_TYPES = [
  { type: "patient", title: "Patient", description: "Patient creates an account and Admin verifies the enrollment.", icon: UserRoundPlus },
  { type: "pharmacy", title: "Pharmacy", description: "The pharmacy submits its own business and licence information.", icon: Pill },
  { type: "laboratory", title: "Laboratory", description: "The laboratory submits its own registration information.", icon: FlaskConical },
  { type: "hospital", title: "Hospital", description: "The hospital also lists the services patients can search and filter.", icon: Hospital },
] as const;

export function ManagerOnboard() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    managerService.me().then((data) => setManager(data.manager))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load onboarding links."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Preparing your onboarding links…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!manager) return null;

  const linkFor = (type: string) => type === "patient"
    ? `${window.location.origin}/#/login/signup?code=${manager.onboardingCode}`
    : `${window.location.origin}/#/login/organization-signup?code=${manager.onboardingCode}&type=${type}`;

  async function copy(type: string) {
    await navigator.clipboard.writeText(linkFor(type));
    setCopied(type);
    toast.success(`${type[0].toUpperCase()}${type.slice(1)} onboarding link copied.`);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return <div className="space-y-5">
    <PageHeader title="Onboarding links" description="Share the correct link. You do not collect, review or manage applicant information." />
    <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Manager code</p><p className="text-2xl font-bold">{manager.onboardingCode}</p><p className="text-sm text-muted-foreground mt-1">Every approved enrollment remains attributed to this code for earnings.</p></CardContent></Card>
    <div className="grid gap-3 md:grid-cols-2">
      {ENROLLMENT_TYPES.map((item) => { const Icon = item.icon; return <Card key={item.type}><CardContent className="p-5 space-y-3"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><h2 className="font-semibold">{item.title} enrollment</h2><p className="text-sm text-muted-foreground">{item.description}</p></div></div><div className="rounded-lg bg-muted/50 p-2 text-xs break-all">{linkFor(item.type)}</div><Button variant="outline" className="w-full" onClick={() => void copy(item.type)}>{copied === item.type ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === item.type ? "Copied" : "Copy link"}</Button></CardContent></Card>; })}
    </div>
  </div>;
}
