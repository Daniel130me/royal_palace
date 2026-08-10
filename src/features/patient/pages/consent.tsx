"use client";

import { useEffect, useMemo, useState } from "react";
import { consentService } from "@/lib/services";
import type { RecordAccessGrant } from "@/types";
import { PageHeader, EmptyState, LoadingState, SectionCard } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck, Building2, Lock, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, initials } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

const PREFERENCES = [
  { id: "share_results", label: "Share laboratory results with providers", default: true, desc: "When granted access, providers can view your lab results." },
  { id: "share_prescriptions", label: "Share prescription history", default: true, desc: "Providers can see medicines you've been prescribed." },
  { id: "share_diagnoses", label: "Share diagnoses", default: true, desc: "Providers can see your active and historical diagnoses." },
  { id: "research_data", label: "Anonymised research use", default: false, desc: "Allow your anonymised health data to be used for research." },
  { id: "marketing_comm", label: "Marketing communications", default: false, desc: "Receive promotional messages about health packages." },
];

type ConsentTab = "active" | "revoked" | "all";

export function PatientConsent() {
  const { profile, refresh } = usePatientContext();
  const [grants, setGrants] = useState<RecordAccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RecordAccessGrant | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [tab, setTab] = useState<ConsentTab>("active");
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PREFERENCES.map((p) => [p.id, p.default]))
  );

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    consentService.grants(profile.id)
      .then((g) => { if (!cancelled) setGrants(g); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load grants"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const counts = useMemo(() => ({
    active: grants.filter((g) => g.status === "active").length,
    revoked: grants.filter((g) => g.status === "revoked" || g.status === "expired").length,
    all: grants.length,
  }), [grants]);

  const rows = tab === "all"
    ? grants
    : tab === "active"
      ? grants.filter((g) => g.status === "active")
      : grants.filter((g) => g.status === "revoked" || g.status === "expired");

  async function confirmRevoke() {
    if (!revokeTarget || !profile) return;
    setRevoking(true);
    try {
      await consentService.revoke(revokeTarget.id, profile.id);
      toast.success(`Access revoked for ${revokeTarget.granteeName}`);
      setRevokeTarget(null);
      consentService.grants(profile.id).then(setGrants);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke access");
    } finally {
      setRevoking(false);
    }
  }

  function togglePref(id: string, value: boolean) {
    setPreferences((p) => ({ ...p, [id]: value }));
    toast.success(`Preference updated`);
  }

  if (loading) return <LoadingState label="Loading record access…" />;
  if (error) return <EmptyState title="Could not load" description={error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Record Access"
        description="Control who can see your health information."
      />

      <SegmentedControl<ConsentTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active", badge: counts.active || undefined },
          { value: "revoked", label: "Revoked" },
          { value: "all", label: "All" },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={tab === "active" ? "No active access grants" : "No grants in this view"}
          description={tab === "active"
            ? "When you book a consultation, your provider will be granted access to your records here."
            : "Grants you've revoked or that expired will appear in the appropriate tab."}
          compact
        />
      ) : (
        <div className="space-y-2">
          {rows.map((g) => {
            const infoShared = Array.isArray(g.informationShared) ? g.informationShared : [];
            const isRevoked = g.status === "revoked" || g.status === "expired";
            return (
              <ExpandableCard
                key={g.id}
                leading={
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                      {initials(g.granteeName || "?")}
                    </AvatarFallback>
                  </Avatar>
                }
                title={g.granteeName}
                subtitle={g.reason}
                trailing={<StatusBadge status={g.status} size="sm" />}
              >
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" /> {g.organisation ?? "Independent provider"}
                  </div>
                  {infoShared.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Info shared</p>
                      <div className="flex flex-wrap gap-1">
                        {infoShared.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] h-5 px-1.5">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Granted {formatDate(g.grantedAt)}
                    </span>
                    <span>Expires: {g.expiresAt ? formatDate(g.expiresAt) : "—"}</span>
                  </div>
                  {!isRevoked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700 w-full sm:w-auto"
                      onClick={() => setRevokeTarget(g)}
                    >
                      <Lock className="h-3.5 w-3.5" /> Revoke future access
                    </Button>
                  )}
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}

      {/* Preferences — always visible below the list */}
      <SectionCard title="Consent preferences" icon={ShieldCheck}>
        <ul className="space-y-2">
          {PREFERENCES.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.desc}</p>
              </div>
              <Switch
                checked={preferences[p.id]}
                onCheckedChange={(v) => togglePref(p.id, v)}
              />
            </li>
          ))}
        </ul>
      </SectionCard>

      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke future access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.granteeName} will no longer be able to access new records in your file. They will retain a copy of records shared while access was active (per audit policy), but cannot view new entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Keep access</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              disabled={revoking}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {revoking ? "Revoking…" : "Revoke future access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
