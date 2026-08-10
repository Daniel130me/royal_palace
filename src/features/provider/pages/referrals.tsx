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
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatDate, relativeDay, fullName } from "@/lib/format";
import { resource } from "@/lib/api-client";
import { toast } from "sonner";
import { Share2, ArrowRight, CheckCircle2, XCircle, Inbox, Send } from "lucide-react";

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
    return (
      <Card className="hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="rounded-lg bg-muted p-2 shrink-0">
              <Share2 className={`h-5 w-5 ${isIncoming ? "text-amber-600" : "text-sky-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{r.referralNumber}</p>
                <StatusBadge status={r.status} />
                <Badge variant="outline" className="text-[10px] capitalize">{r.urgency}</Badge>
              </div>
              <p className="text-sm mt-1">{r.reason}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isIncoming
                  ? `From ${r.sender ? `${r.sender.title} ${r.sender.lastName}` : "—"} · ${r.sender?.specialty ?? ""}`
                  : `To ${r.recipient ? `${r.recipient.title} ${r.recipient.lastName}` : `Open · ${r.recipientSpecialty ?? "any"}`}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.patient ? fullName(r.patient) : "Patient"} · {formatDate((r as WithTimestamps<Referral>).createdAt)} · {relativeDay((r as WithTimestamps<Referral>).createdAt)}
              </p>
              {r.diagnosis && <p className="text-xs text-muted-foreground mt-1">Diagnosis: {r.diagnosis}</p>}
              {r.requiredAction && <p className="text-xs text-muted-foreground">Required action: {r.requiredAction}</p>}
              {r.accessExpiry && <p className="text-xs text-muted-foreground">Access expires: {formatDate(r.accessExpiry)}</p>}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => navigate("provider", "patient", { id: r.patientId })}>
                Open patient <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
              {isIncoming && ["sent", "received", "requires_clarification"].includes(r.status) && (
                <div className="flex gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 flex-1" disabled={actingId === r.id} onClick={() => actOnReferral(r, "accepted")}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" disabled={actingId === r.id} onClick={() => actOnReferral(r, "declined")}>
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

  if (loading) return <LoadingState label="Loading referrals…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Care handoffs you have sent and received."
      />

      <Tabs defaultValue="received">
        <TabsList className="mb-4">
          <TabsTrigger value="received">
            <Inbox className="h-3.5 w-3.5 mr-1" /> Received ({received.length})
            {pendingReceived.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] border-amber-200 text-amber-700">{pendingReceived.length} pending</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent">
            <Send className="h-3.5 w-3.5 mr-1" /> Sent ({sent.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-3">
          {received.length === 0 ? (
            <EmptyState icon={Inbox} title="No incoming referrals" description="When another provider refers a patient to you, it will appear here." />
          ) : (
            received.map((r) => <ReferralCard key={r.id} r={r} isIncoming />)
          )}
        </TabsContent>

        <TabsContent value="sent" className="space-y-3">
          {sent.length === 0 ? (
            <EmptyState icon={Send} title="No sent referrals" description="Referrals you create during an encounter will be tracked here." />
          ) : (
            sent.map((r) => <ReferralCard key={r.id} r={r} isIncoming={false} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
