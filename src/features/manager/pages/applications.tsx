"use client";

// Organization Applications (plan §3.4). Status counts come from the server
// meta payload (never recomputed client-side); clicking a card opens the
// full application detail in a dialog.

import { useCallback, useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManagerStatusBadge, ManagerEmptyState } from "../components/manager-shared";
import { navigate } from "@/lib/nav";
import { APPLICATION_STATUS_LABELS } from "@/lib/manager-constants";
import { formatDate } from "@/lib/format";
import { Building2, FlaskConical, MapPin, RefreshCw } from "lucide-react";
import type { ManagerOrganizationApplication } from "@/types";

type ApplicationsResponse = {
  data: ManagerOrganizationApplication[];
  meta: { page: number; pageSize: number; total: number; statusCounts: Record<string, number> };
};

const STATUS_FILTERS = [
  "all",
  "submitted",
  "under_review",
  "information_required",
  "approved",
  "rejected",
  "draft",
] as const;

export function ManagerApplications() {
  const [res, setRes] = useState<ApplicationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<ManagerOrganizationApplication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes(await managerService.applications({ status, pageSize: "50" }) as unknown as ApplicationsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = res?.meta.statusCounts ?? {};
  const items = res?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Organization Applications"
        description="Track your onboarded pharmacy and laboratory applications through Royal Palace review."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "all" ? "All" : APPLICATION_STATUS_LABELS[s]}
            <span className="ml-1 opacity-70">{s === "all" ? res?.meta.total ?? 0 : counts[s] ?? 0}</span>
          </Button>
        ))}
      </div>

      {loading && !res ? (
        <LoadingState label="Loading applications…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <ManagerEmptyState
          title="No applications found"
          description="Nothing matches this status yet. Onboard a new pharmacy or laboratory to create an application."
          actionLabel="Onboard organization"
          onAction={() => navigate("manager", "onboard")}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => {
            const Icon = a.organizationType === "pharmacy" ? Building2 : FlaskConical;
            return (
              <Card
                key={a.id}
                className="cursor-pointer transition-all hover:shadow-soft-md hover:border-border"
                onClick={() => setSelected(a)}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-primary/10 p-2 shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{a.businessName}</p>
                        <p className="text-xs text-muted-foreground">{a.applicationNumber} · <MapPin className="inline h-3 w-3" /> {a.city}, {a.state}</p>
                      </div>
                    </div>
                    <ManagerStatusBadge status={a.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Contact person</p>
                      <p className="font-semibold text-sm truncate">{a.contactPerson}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Submitted</p>
                      <p className="font-semibold text-sm">{formatDate(a.submittedAt)}</p>
                    </div>
                  </div>
                  {a.reviewerNote ? (
                    <p className="mt-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">Reviewer note: {a.reviewerNote}</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Full application detail */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selected.applicationNumber} <ManagerStatusBadge status={selected.status} />
                </DialogTitle>
                <DialogDescription>
                  {selected.organizationType === "pharmacy" ? "Pharmacy" : "Laboratory"} application · {selected.businessName}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label="Business name">{selected.businessName}</DetailField>
                <DetailField label="Contact person">{selected.contactPerson}</DetailField>
                <DetailField label="Contact email">{selected.contactEmail}</DetailField>
                <DetailField label="Contact phone">{selected.contactPhone}</DetailField>
                <DetailField label="City / State">{selected.city}, {selected.state}</DetailField>
                <DetailField label="Registration number">{selected.registrationNumber}</DetailField>
                <DetailField label="Licence number">{selected.licenceNumber || "—"}</DetailField>
                <DetailField label="Submitted">{formatDate(selected.submittedAt)}</DetailField>
                <DetailField label="Reviewed">{formatDate(selected.reviewedAt)}</DetailField>
                <DetailField label="Notes" className="sm:col-span-2">{selected.notes || "—"}</DetailField>
                <DetailField label="Reviewer note" className="sm:col-span-2">{selected.reviewerNote || "—"}</DetailField>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="mt-0.5 text-sm font-medium break-words">{children}</div>
    </div>
  );
}
