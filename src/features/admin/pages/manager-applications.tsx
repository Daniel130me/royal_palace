"use client";

// Admin · Manager organization applications (plan §3.8): review queue for
// every manager-submitted application with the required-note decisions.

import { useCallback, useEffect, useState } from "react";
import { sessionApi } from "@/lib/api-client";
import { managerService } from "@/lib/services";
import { PageHeader, ErrorState, LoadingState, EmptyState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManagerStatusBadge } from "@/features/manager/components/manager-shared";
import { formatDate } from "@/lib/format";
import { APPLICATION_STATUS_LABELS } from "@/lib/manager-constants";
import { toast } from "sonner";
import { Building2, FlaskConical, ClipboardCheck } from "lucide-react";
import type { ManagerOrganizationApplication } from "@/types";

// The admin endpoint decorates rows with the manager's name.
type ApplicationRow = ManagerOrganizationApplication & { managerName?: string };

type ReviewAction = "under_review" | "information_required" | "approved" | "rejected";

export function AdminManagerApplications() {
  const [items, setItems] = useState<ApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [review, setReview] = useState<{ app: ApplicationRow; action: ReviewAction } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await sessionApi.get<{ data: ApplicationRow[] }>(
        `/api/admin/manager-data?view=applications${status === "all" ? "" : `&status=${status}`}`
      );
      setItems(payload.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applications.");
    }
  }, [status]);

  useEffect(() => {
    setLoadingSafe(true);
    void load();
  }, [load]);

  const [loadingSafe, setLoadingSafe] = useState(true);

  async function submitReview() {
    if (!review) return;
    if ((review.action === "rejected" || review.action === "information_required") && !note.trim()) {
      toast.error("A reviewer note is required for this decision.");
      return;
    }
    setBusy(true);
    try {
      await managerService.adminReviewApplication({ applicationId: review.app.id, action: review.action, reviewerNote: note });
      toast.success(`${review.app.applicationNumber} ${review.action.replace("_", " ")}.`);
      setReview(null);
      setNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Manager Applications"
        description="Organizations submitted by Managers for onboarding. Approval creates the organization, its acquisition attribution and first assignment atomically."
        actions={<ClipboardCheck className="h-5 w-5 text-muted-foreground" />}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {["all", "submitted", "under_review", "information_required", "approved", "rejected"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">
            {s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : loadingSafe && !items ? (
        <LoadingState label="Loading applications…" />
      ) : !items || items.length === 0 ? (
        <EmptyState title="No applications" description="No organization applications in this view." />
      ) : (
        <Card>
          <CardContent className="p-0">
            {items.map((a) => {
              const Icon = a.organizationType === "pharmacy" ? Building2 : FlaskConical;
              return (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3.5 border-b border-border/40 last:border-0">
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0"><Icon className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{a.businessName}</p>
                      <ManagerStatusBadge status={a.status} label={APPLICATION_STATUS_LABELS[a.status as keyof typeof APPLICATION_STATUS_LABELS]} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {a.applicationNumber} · {a.managerName ?? a.managerId} · {a.city}, {a.state} · submitted {formatDate(a.submittedAt)}
                    </p>
                    {a.reviewerNote ? <p className="text-[11px] text-muted-foreground mt-0.5">Note: {a.reviewerNote}</p> : null}
                  </div>
                  {["submitted", "under_review", "information_required"].includes(a.status) ? (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setReview({ app: a, action: "under_review" }); setNote(""); }}>Review</Button>
                      <Button size="sm" onClick={() => { setReview({ app: a, action: "approved" }); setNote(""); }}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => { setReview({ app: a, action: "rejected" }); setNote(""); }}>Reject</Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          {review ? (
            <>
              <DialogHeader>
                <DialogTitle>{review.action === "approved" ? "Approve" : review.action === "rejected" ? "Reject" : "Request information for"} {review.app.applicationNumber}</DialogTitle>
                <DialogDescription>
                  {review.action === "approved"
                    ? "Approval creates the organization, sets acquired-by attribution and the first assignment in one transaction."
                    : "A reviewer note is required and is shared with the manager."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="reviewer-note">Reviewer note {review.action !== "approved" ? "(required)" : "(optional)"}</Label>
                <Textarea id="reviewer-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
                <Button variant={review.action === "rejected" ? "destructive" : "default"} onClick={() => void submitReview()} disabled={busy}>
                  {busy ? "Saving…" : "Confirm"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
