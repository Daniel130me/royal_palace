"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { navigate } from "@/lib/nav";
import { useProviderContext } from "../use-provider-context";
import { referralService } from "@/lib/services";
import { normalizeReferral, WithTimestamps } from "../normalize";
import type { Referral } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, EmptyState, SkeletonGrid, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { resource } from "@/lib/api-client";
import { toast } from "sonner";
import { Share2, ArrowRight, CheckCircle2, XCircle, Inbox, Send } from "lucide-react";

const URGENCY_STYLES: Record<string, string> = {
  routine: "border-sky-200 bg-sky-50 text-sky-700",
  urgent: "border-amber-200 bg-amber-50 text-amber-700",
  emergency: "border-rose-200 bg-rose-50 text-rose-700",
};

export function ProviderReferrals() {
  const { providerId } = useProviderContext();
  const [sent, setSent] = useState<Referral[]>([]);
  const [received, setReceived] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

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

  function ReferralCard({ r, isIncoming }: { r: Referral; isIncoming: boolean }) {
    const urgencyStyle = URGENCY_STYLES[r.urgency] ?? URGENCY_STYLES.routine;
    const isEmergency = r.urgency === "emergency";
    return (
      <Card className={`hover:shadow-soft-md transition-shadow ${isEmergency && isIncoming && ["sent", "received", "requires_clarification"].includes(r.status) ? "border-rose-300" : ""}`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className={`rounded-xl p-2 shrink-0 ${isIncoming ? "bg-amber-50" : "bg-sky-50"}`}>
              <Share2 className={`h-5 w-5 ${isIncoming ? "text-amber-600" : "text-sky-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{r.referralNumber}</p>
                <StatusBadge status={r.status} size="sm" />
                <Badge variant="outline" className={`text-[10px] capitalize h-5 ${urgencyStyle}`}>{r.urgency}</Badge>
              </div>
              <p className="text-sm mt-1.5 font-medium">{r.reason}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isIncoming
                  ? `From ${r.sender ? `${r.sender.title} ${r.sender.lastName}` : "—"} · ${r.sender?.specialty ?? ""}`
                  : `To ${r.recipient ? `${r.recipient.title} ${r.recipient.lastName}` : `Open · ${r.recipientSpecialty ?? "any"}`}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.patient ? fullName(r.patient) : "Patient"} · {formatDate((r as WithTimestamps<Referral>).createdAt)} · {relativeDay((r as WithTimestamps<Referral>).createdAt)}
              </p>
              {r.diagnosis && <p className="text-xs text-muted-foreground mt-1.5"><span className="font-medium text-foreground">Diagnosis:</span> {r.diagnosis}</p>}
              {r.requiredAction && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Required action:</span> {r.requiredAction}</p>}
              {r.accessExpiry && <p className="text-xs text-muted-foreground">Access expires: {formatDate(r.accessExpiry)}</p>}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => navigate("provider", "patient", { id: r.patientId })}>
                Open patient <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
              {isIncoming && ["sent", "received", "requires_clarification"].includes(r.status) && (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={actingId === r.id} onClick={() => actOnReferral(r, "accepted")}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" disabled={actingId === r.id} onClick={() => actOnReferral(r, "declined")}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
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

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Care handoffs you have sent and received."
      />

      <Tabs defaultValue="received">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="mb-4">
            <TabsTrigger value="received">
              <Inbox className="h-3.5 w-3.5 mr-1.5" /> Received ({received.length})
              {pendingReceived.length > 0 && (
                <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-200 bg-amber-50 text-amber-700 h-4.5">{pendingReceived.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent">
              <Send className="h-3.5 w-3.5 mr-1.5" /> Sent ({sent.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="received" className="space-y-3">
          {received.length === 0 ? (
            <EmptyState icon={Inbox} title="No incoming referrals" description="When another provider refers a patient to you, it will appear here." compact />
          ) : (
            received.map((r) => <ReferralCard key={r.id} r={r} isIncoming />)
          )}
        </TabsContent>

        <TabsContent value="sent" className="space-y-3">
          {sent.length === 0 ? (
            <EmptyState icon={Send} title="No sent referrals" description="Referrals you create during an encounter will be tracked here." compact />
          ) : (
            sent.map((r) => <ReferralCard key={r.id} r={r} isIncoming={false} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
