"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Inbox, Send, Share2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { productionClinicalService, type ProviderClinicalReferral } from "@/lib/services";

const PRIORITY_STYLES: Record<string, string> = {
  EMERGENCY: "border-rose-200 bg-rose-50 text-rose-700",
  ROUTINE: "border-sky-200 bg-sky-50 text-sky-700",
  URGENT: "border-amber-200 bg-amber-50 text-amber-700",
};
type Tab = "received" | "sent";

export function ProviderReferrals() {
  const [tab, setTab] = useState<Tab>("received");
  const [referrals, setReferrals] = useState<ProviderClinicalReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (selected: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const page = await productionClinicalService.provider.listReferrals(
        selected === "received" ? "RECEIVED" : "SENT",
      );
      setReferrals([...page.data]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load referrals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(tab), [load, tab]);

  const pending = useMemo(
    () => (tab === "received" ? referrals.filter((referral) => referral.status === "ACTIVE") : []),
    [referrals, tab],
  );

  async function decide(referral: ProviderClinicalReferral, decision: "ACCEPTED" | "DECLINED") {
    setActingId(referral.id);
    try {
      await productionClinicalService.provider.decideReferral(
        referral.id,
        decision,
        referral.version,
      );
      toast.success(decision === "ACCEPTED" ? "Referral accepted." : "Referral declined.", {
        description:
          "The decision was recorded and the referring practitioner can see the updated status.",
      });
      await load(tab);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update the referral.");
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Referrals" description="Care handoffs you have sent and received." />
        <SkeletonGrid count={3} />
      </div>
    );
  }
  if (error !== null) return <ErrorState message={error} onRetry={() => void load(tab)} />;

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Care handoffs scoped to you as sender or named recipient."
      />
      <div className="sticky top-14 z-20 mb-2 bg-background/95 pb-3 backdrop-blur-md lg:top-16">
        <SegmentedControl
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          options={[
            {
              value: "received",
              label: "Received",
              icon: Inbox,
              badge: pending.length || undefined,
            },
            { value: "sent", label: "Sent", icon: Send },
          ]}
        />
      </div>

      {pending.length > 0 ? (
        <div className="mb-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Pending action
          </p>
          {pending.map((referral) => (
            <div
              key={referral.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{referral.patient.displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground">{referral.reason}</p>
              </div>
              <Button
                size="sm"
                className="h-7 px-2.5"
                disabled={actingId === referral.id}
                onClick={() => void decide(referral, "ACCEPTED")}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-rose-600"
                disabled={actingId === referral.id}
                onClick={() => void decide(referral, "DECLINED")}
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {referrals.length === 0 ? (
        <EmptyState
          icon={tab === "received" ? Inbox : Share2}
          title={tab === "received" ? "No incoming referrals" : "No sent referrals"}
          description={
            tab === "received"
              ? "Referrals addressed directly to you will appear here."
              : "Referrals created during an encounter will appear here."
          }
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
          {referrals.map((referral) => {
            const counterpart =
              tab === "received"
                ? `From ${referral.sender.displayName}`
                : (referral.recipient?.displayName ?? `Open · ${referral.specialtyCode}`);
            return (
              <CompactListItem
                key={referral.id}
                leading={
                  <div
                    className={
                      tab === "received"
                        ? "rounded-xl bg-amber-50 p-2 text-amber-600"
                        : "rounded-xl bg-sky-50 p-2 text-sky-600"
                    }
                  >
                    {tab === "received" ? (
                      <Inbox className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </div>
                }
                title={referral.patient.displayName}
                subtitle={`${referral.reason} · ${counterpart} · ${formatDate(referral.createdAt)}`}
                onClick={() => navigate("provider", "patient", { id: referral.patient.id })}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={referral.status.toLowerCase()} size="sm" />
                    <Badge
                      variant="outline"
                      className={`h-5 text-[10px] capitalize ${PRIORITY_STYLES[referral.priority] ?? PRIORITY_STYLES.ROUTINE}`}
                    >
                      {referral.priority.toLowerCase()}
                    </Badge>
                  </div>
                }
                chevron
              />
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{referrals.length} referral(s) on this page</p>
        <Button size="sm" variant="ghost" onClick={() => navigate("provider", "appointments")}>
          New from encounter <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
