"use client";

// Shared organization detail page for My Pharmacies / My Laboratories
// (plan §3.3). One component keeps both detail views identical: overview,
// payments, Manager Earnings, support tickets and the preserved assignment
// history (acquisition attribution survives reassignment).

import { useCallback, useEffect, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagerStatusBadge } from "./manager-shared";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  formatRateBps,
  MANAGER_TICKET_PRIORITY_LABELS,
  RELATIONSHIP_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/manager-constants";
import {
  Building2, FlaskConical, Handshake, CircleDollarSign, Coins, LifeBuoy, History,
} from "lucide-react";
import type {
  ManagerEarning,
  ManagerOrganizationDto,
  ManagerRelationshipStatus,
  OrganizationPayment,
  SupportTicket,
} from "@/types";

/** Assignment history row as returned by /api/manager/organizations/[id]. */
type AssignmentHistoryRow = {
  id: string;
  managerId?: string;
  managerName: string;
  managerNumber: string;
  source: string;
  relationshipStatus: string;
  startsAt: string;
  endsAt?: string | null;
  assignedBy: string;
  reason?: string | null;
};

type OrgDetailPayload = {
  organization: ManagerOrganizationDto;
  payments: OrganizationPayment[];
  earnings: ManagerEarning[];
  tickets: (SupportTicket & { messageCount: number; open: boolean })[];
  openTickets: number;
  assignmentHistory: AssignmentHistoryRow[];
};

const ASSIGNMENT_SOURCE_LABELS: Record<string, string> = {
  acquisition: "Acquisition",
  application_approval: "Application approval",
  admin_assignment: "Admin assignment",
  reassignment: "Reassignment",
};

export function OrganizationDetailPage({ type }: { type: "pharmacy" | "laboratory" }) {
  const { view } = useNav();
  const id = view.params.id;

  const [data, setData] = useState<OrgDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    if (!id) {
      setError("No organization selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await managerService.organization(id, type));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [id, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const org = data?.organization ?? null;
  const TypeIcon = type === "pharmacy" ? Building2 : FlaskConical;

  return (
    <div>
      <PageHeader
        back
        title={org ? org.name : type === "pharmacy" ? "Pharmacy Detail" : "Laboratory Detail"}
        description={
          org
            ? `${org.organizationNumber} · ${org.city}, ${org.state} — business, payment and support overview.`
            : "Business, payment and support overview for this organization."
        }
        actions={org ? <ManagerStatusBadge status={org.verificationStatus === "approved" ? "approved" : org.verificationStatus} /> : undefined}
      />

      {loading ? (
        <LoadingState label={`Loading ${type} details…`} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? null : (
        <>
          {/* Section shortcuts — every value is a row count from the payload */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <MetricCard label="Payments" value={data.payments.length} hint="Organization payments on record" icon={CircleDollarSign} tone="info" onClick={() => setTab("payments")} />
            <MetricCard label="Manager Earnings" value={data.earnings.length} hint="Ledger entries for this organization" icon={Coins} tone="success" onClick={() => setTab("earnings")} />
            <MetricCard label="Open tickets" value={data.openTickets} hint={`${data.tickets.length} ticket${data.tickets.length === 1 ? "" : "s"} in total`} icon={LifeBuoy} tone={data.openTickets > 0 ? "warning" : "default"} onClick={() => setTab("support")} />
            <MetricCard label="Assignment records" value={data.assignmentHistory.length} hint="Attribution history is preserved" icon={History} onClick={() => setTab("history")} />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="gap-3">
            <TabsList className="h-auto min-h-9 flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="payments">Payments ({data.payments.length})</TabsTrigger>
              <TabsTrigger value="earnings">Earnings ({data.earnings.length})</TabsTrigger>
              <TabsTrigger value="support">Support ({data.tickets.length})</TabsTrigger>
              <TabsTrigger value="history">History ({data.assignmentHistory.length})</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-1">
              <div className="grid md:grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><TypeIcon className="h-4 w-4 text-primary" /> Organization profile</CardTitle>
                    <CardDescription>Business details on file with Royal Palace</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Organization number">{org?.organizationNumber}</Field>
                    <Field label="Verification status">
                      <ManagerStatusBadge status={org?.verificationStatus ?? ""} />
                    </Field>
                    <Field label="City / State">{org ? `${org.city}, ${org.state}` : "—"}</Field>
                    <Field label="Phone">{org?.phone}</Field>
                    <Field label="Email" className="sm:col-span-2">{org?.email}</Field>
                    <Field label="Address" className="sm:col-span-2">{org?.address}</Field>
                    <Field label="Joined">{formatDate(org?.joinedAt)}</Field>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Handshake className="h-4 w-4 text-primary" /> Manager attribution</CardTitle>
                    <CardDescription>Acquisition attribution is permanent; current management can change with reassignment</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Acquired by</p>
                        <p className="text-xs text-muted-foreground">{formatDate(org?.acquiredAt)}</p>
                      </div>
                      <p className="mt-0.5 text-sm font-semibold">{managerName(data, org?.acquiredByManagerId ?? null)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Currently managed by</p>
                        <p className="text-xs text-muted-foreground">{formatDate(org?.managerAssignedAt)}</p>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{managerName(data, org?.currentManagerId ?? null)}</p>
                        {org?.managerRelationshipStatus ? (
                          <ManagerStatusBadge
                            status={org.managerRelationshipStatus}
                            label={RELATIONSHIP_STATUS_LABELS[org.managerRelationshipStatus as ManagerRelationshipStatus] ?? org.managerRelationshipStatus}
                          />
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Payments */}
            <TabsContent value="payments" className="mt-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /> Payments</CardTitle>
                  <CardDescription>Organization payments to Royal Palace — refunds keep their original entry and are shown below</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {data.payments.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">No payments recorded for this organization yet.</p>
                  ) : (
                    <>
                      <div className="hidden sm:grid grid-cols-[1.2fr_1fr_0.9fr_1.3fr] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                        <span>Payment</span><span>Type</span><span>Amount</span><span>Status</span>
                      </div>
                      {data.payments.map((p) => (
                        <div key={p.id} className="grid sm:grid-cols-[1.2fr_1fr_0.9fr_1.3fr] grid-cols-2 gap-3 px-4 py-3 border-b border-border/40 last:border-0 text-sm items-center hover:bg-muted/40">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.paymentNumber}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(p.paidAt ?? p.createdAt)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate">{TRANSACTION_TYPE_LABELS[p.transactionType] ?? p.transactionType}</p>
                            <p className="text-xs text-muted-foreground capitalize">{p.method.replace(/_/g, " ")}</p>
                          </div>
                          <div className="font-semibold">{formatCurrency(p.amount)}</div>
                          <div className="min-w-0">
                            <ManagerStatusBadge status={p.status} />
                            {p.status === "refunded" && p.refundAmount > 0 ? (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Refund {formatCurrency(p.refundAmount)} · {formatDate(p.refundedAt)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Manager Earnings */}
            <TabsContent value="earnings" className="mt-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Manager Earnings</CardTitle>
                  <CardDescription>Immutable ledger — refunds create separate reversal entries, history is never rewritten</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {data.earnings.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">No earnings recorded for this organization yet.</p>
                  ) : (
                    <>
                      <div className="hidden sm:grid grid-cols-[1.1fr_1.1fr_0.9fr_0.6fr_0.9fr_0.8fr] gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                        <span>Earning</span><span>Payment</span><span>Eligible</span><span>Rate</span><span>Amount</span><span>Status</span>
                      </div>
                      {data.earnings.map((e) => (
                        <div key={e.id} className="grid sm:grid-cols-[1.1fr_1.1fr_0.9fr_0.6fr_0.9fr_0.8fr] grid-cols-2 gap-3 px-4 py-3 border-b border-border/40 last:border-0 text-sm items-center hover:bg-muted/40">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{e.earningNumber}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(e.occurredAt)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate">{e.paymentNumber}</p>
                            <p className="text-xs text-muted-foreground">{TRANSACTION_TYPE_LABELS[e.paymentType] ?? e.paymentType}</p>
                          </div>
                          <div>{formatCurrency(Math.abs(e.eligibleAmount ?? 0))}</div>
                          <div>{formatRateBps(e.rateBps ?? 0)}</div>
                          <div className={e.amount < 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
                            {e.amount < 0 ? "−" : ""}{formatCurrency(Math.abs(e.amount))}
                          </div>
                          <div className="min-w-0">
                            <ManagerStatusBadge status={e.status} />
                            {e.payoutNumber ? <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.payoutNumber}</p> : null}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Support */}
            <TabsContent value="support" className="mt-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-primary" /> Support</CardTitle>
                  <CardDescription>First-level tickets raised by this organization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.tickets.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No support tickets for this organization yet.</p>
                  ) : (
                    data.tickets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => navigate("manager", "ticket", { id: t.id })}
                        className="w-full text-left rounded-xl border border-border/60 p-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-semibold">{t.ticketNumber}</p>
                          <ManagerStatusBadge status={t.status} />
                        </div>
                        <p className="text-sm mt-0.5">{t.subject}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {MANAGER_TICKET_PRIORITY_LABELS[t.priority] ?? t.priority} priority · {t.messageCount} message{t.messageCount === 1 ? "" : "s"} · Last activity {formatDateTime(t.lastActivityAt)}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Assignment history */}
            <TabsContent value="history" className="mt-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Assignment history</CardTitle>
                  <CardDescription>Every manager this organization has been assigned to — reassignment never erases the past</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.assignmentHistory.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No assignment records yet.</p>
                  ) : (
                    data.assignmentHistory.map((h) => (
                      <div key={h.id} className="rounded-xl border border-border/60 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {h.managerName} <span className="text-xs text-muted-foreground font-normal">· {h.managerNumber}</span>
                          </p>
                          <ManagerStatusBadge
                            status={h.relationshipStatus}
                            label={RELATIONSHIP_STATUS_LABELS[h.relationshipStatus as ManagerRelationshipStatus] ?? h.relationshipStatus}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ASSIGNMENT_SOURCE_LABELS[h.source] ?? h.source} · {formatDate(h.startsAt)} – {h.endsAt ? formatDate(h.endsAt) : "Present"}
                        </p>
                        {h.reason ? <p className="text-[11px] text-muted-foreground mt-1">{h.reason}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/** Resolve a manager display name from the preserved assignment history. */
function managerName(data: OrgDetailPayload, managerId: string | null): string {
  if (!managerId) return "—";
  const row = data.assignmentHistory.find((h) => h.managerId === managerId);
  return row ? `${row.managerName} (${row.managerNumber})` : managerId;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="mt-0.5 text-sm font-medium break-words">{children}</div>
    </div>
  );
}
