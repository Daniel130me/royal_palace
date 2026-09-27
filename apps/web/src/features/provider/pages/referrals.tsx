"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { referralService } from "@/lib/services";
import { normalizeReferral, WithTimestamps } from "../normalize";
import type { Referral } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem } from "@/components/healthcare/compact-list";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { resource } from "@/lib/api-client";
import { toast } from "sonner";
import { Share2, ArrowRight, CheckCircle2, XCircle, Inbox, Send } from "lucide-react";

const URGENCY_STYLES: Record<string, string> = {
  routine: "border-sky-200 bg-sky-50 text-sky-700",
  urgent: "border-amber-200 bg-amber-50 text-amber-700",
  emergency: "border-rose-200 bg-rose-50 text-rose-700",
};

type Tab = "received" | "sent";

export function ProviderReferrals() {
  const { providerId } = useProviderContext();
  const [sent, setSent] = useState<Referral[]>([]);
  const [received, setReceived] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("received");

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        referralService.list({ senderProviderId: providerId }),
        referralService.list({ recipientProviderId: providerId }),
      ]);
      setSent(s.map(normalizeReferral));
      setReceived(r.map(normalizeReferral));
    } catch (e) {
      setError((e as Error).message ?? "Failed to load referrals.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingReceived = useMemo(
    () => received.filter((r) => ["sent", "received", "requires_clarification"].includes(r.status)),
    [received]
  );

  async function actOnReferral(r: Referral, action: "accepted" | "declined") {
    setActingId(r.id);
    try {
      await resource.update("referral", r.id, { status: action });
      toast.success(action === "accepted" ? "Referral accepted." : "Referral declined.", {
        description: action === "accepted"
          ? "The patient record access is now active. The sender will be notified."
          : "The sender has been notified of your decision.",
      });
      await load();
    } catch (e) {
      toast.error("Could not update referral: " + (e as Error).message);
    } finally {
      setActingId(null);
    }
  }

  function Row({ r, isIncoming }: { r: Referral; isIncoming: boolean }) {
    const urgencyStyle = URGENCY_STYLES[r.urgency] ?? URGENCY_STYLES.routine;
    const needsAction = isIncoming && ["sent", "received", "requires_clarification"].includes(r.status);
    const isEmergency = r.urgency === "emergency";
    const Icon = isIncoming ? Inbox : Send;
    const toneBg = isIncoming ? "bg-amber-50 text-amber-600" : "bg-sky-50 text-sky-600";

    return (
      <CompactListItem
        leading={
          <div className={`rounded-xl p-2 ${toneBg} ${isEmergency && needsAction ? "ring-2 ring-rose-200" : ""}`}>
            <Icon className="h-4 w-4" />
          </div>
        }
        title={r.referralNumber}
        subtitle={`${r.reason} · ${isIncoming ? `From ${r.sender ? `${r.sender.title} ${r.sender.lastName}` : "—"}` : `To ${r.recipient ? `${r.recipient.title} ${r.recipient.lastName}` : `Open · ${r.recipientSpecialty ?? "any"}`}`} · ${r.patient ? fullName(r.patient) : ""} · ${formatDate((r as WithTimestamps<Referral>).createdAt)}`}
        onClick={() => navigate("provider", "patient", { id: r.patientId })}
        trailing={
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={r.status} size="sm" />
            <Badge variant="outline" className={`text-[10px] capitalize h-5 ${urgencyStyle}`}>{r.urgency}</Badge>
          </div>
        }
        chevron
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Referrals" description="Care handoffs you have sent and received." />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const current = tab === "received" ? received : sent;
  const pendingCount = pendingReceived.length;

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Care handoffs you have sent and received."
      />

      <div className="sticky top-14 lg:top-16 z-20 bg-background/95 backdrop-blur-md pb-3 mb-2">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "received", label: "Received", icon: Inbox, badge: pendingCount || undefined },
            { value: "sent", label: "Sent", icon: Send },
          ]}
        />
      </div>

      {/* Inline accept/decline actions on pending received referrals */}
      {tab === "received" && pendingReceived.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Pending action</p>
          <div className="space-y-2">
            {pendingReceived.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 bg-card p-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{r.referralNumber}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.reason} · {r.patient ? fullName(r.patient) : ""}</p>
                </div>
                <Button size="sm" className="h-7 px-2.5" disabled={actingId === r.id} onClick={() => actOnReferral(r, "accepted")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50" disabled={actingId === r.id} onClick={() => actOnReferral(r, "declined")}>
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {current.length === 0 ? (
        <EmptyState
          icon={tab === "received" ? Inbox : Send}
          title={tab === "received" ? "No incoming referrals" : "No sent referrals"}
          description={
            tab === "received"
              ? "When another provider refers a patient to you, it will appear here."
              : "Referrals you create during an encounter will be tracked here."
          }
          compact
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {current.map((r) => <Row key={r.id} r={r} isIncoming={tab === "received"} />)}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{current.length} referral(s)</p>
        <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
          New from encounter <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
