"use client";

import { useEffect, useMemo, useState } from "react";
import { consentService } from "@/lib/services";
import type { RecordAccessGrant } from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck, Building2, Calendar, FileText, ChevronRight, ShieldAlert, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { usePatientContext } from "../use-patient-context";

const PREFERENCES = [
  { id: "share_results", label: "Share laboratory results with providers", default: true, desc: "When granted access, providers can view your lab results." },
  { id: "share_prescriptions", label: "Share prescription history", default: true, desc: "Providers can see medicines you've been prescribed." },
  { id: "share_diagnoses", label: "Share diagnoses", default: true, desc: "Providers can see your active and historical diagnoses." },
  { id: "research_data", label: "Anonymised research use", default: false, desc: "Allow your anonymised health data to be used for research." },
  { id: "marketing_comm", label: "Marketing communications", default: false, desc: "Receive promotional messages about health packages." },
];

export function PatientConsent() {
  const { profile, refresh } = usePatientContext();
  const [grants, setGrants] = useState<RecordAccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RecordAccessGrant | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PREFERENCES.map((p) => [p.id, p.default]))
  );

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    consentService.grants(profile.id)
      .then(setGrants)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load grants"))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const sections = useMemo(() => ({
    active: grants.filter((g) => g.status === "active"),
    revoked: grants.filter((g) => g.status === "revoked" || g.status === "expired"),
  }), [grants]);

  async function confirmRevoke() {
    if (!revokeTarget || !profile) return;
    setRevoking(true);
    try {
      await consentService.revoke(revokeTarget.id, profile.id);
      toast.success(`Access revoked for ${revokeTarget.granteeName}`);
      setRevokeTarget(null);
      // Refresh grants
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
    <div>
      <PageHeader
        title="Record Access Centre"
        description="Control who can see your health information and for how long."
      />

      <Tabs defaultValue="active">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="active">Active ({sections.active.length})</TabsTrigger>
          <TabsTrigger value="previous">Previous ({sections.revoked.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending (0)</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-3">
          {sections.active.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No active access grants"
              description="When you book a consultation, your provider will be granted access to your records here."
            />
          ) : sections.active.map((g) => (
            <GrantCard key={g.id} grant={g} onRevoke={() => setRevokeTarget(g)} />
          ))}
        </TabsContent>

        <TabsContent value="previous" className="mt-4 space-y-3">
          {sections.revoked.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No previous access" description="Revoked or expired grants will appear here." />
          ) : sections.revoked.map((g) => (
            <GrantCard key={g.id} grant={g} readOnly />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <EmptyState
            icon={ShieldAlert}
            title="No pending access requests"
            description="Incoming requests for record access (e.g. from referrals) will appear here for your approval."
          />
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Consent preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {PREFERENCES.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                  <Switch
                    checked={preferences[p.id]}
                    onCheckedChange={(v) => togglePref(p.id, v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

function GrantCard({ grant: g, onRevoke, readOnly }: {
  grant: RecordAccessGrant; onRevoke?: () => void; readOnly?: boolean;
}) {
  const infoShared = Array.isArray(g.informationShared) ? g.informationShared : [];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{g.granteeName}</p>
              <StatusBadge status={g.status} />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {g.organisation ?? "Independent provider"}
            </p>
            <p className="text-sm mt-2">{g.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {infoShared.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Granted: {formatDate(g.grantedAt)}</span>
              <span>Expires: {g.expiresAt ? formatDate(g.expiresAt) : "—"}</span>
              {g.relatedEncounterId && <span>Encounter: {g.relatedEncounterId}</span>}
              {g.relatedReferralId && <span>Referral: {g.relatedReferralId}</span>}
            </div>
          </div>
          {!readOnly && (
            <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={onRevoke}>
              <Lock className="h-3 w-3 mr-1" /> Revoke
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
