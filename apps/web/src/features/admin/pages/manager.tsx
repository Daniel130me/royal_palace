"use client";

// Admin · Manager detail (plan §3.8): profile, portfolio with acquisition /
// current-manager attribution, assignment history, revenue share rules and
// earnings totals. Includes the two admin controls: "Assign organization"
// and "Create revenue share rule", which call the existing action endpoints.

import { useCallback, useEffect, useState } from "react";
import { sessionApi } from "@/lib/api-client";
import { managerService } from "@/lib/services";
import { navigate, useNav } from "@/lib/nav";
import {
  PageHeader, SectionCard, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ManagerStatusBadge } from "@/features/manager/components/manager-shared";
import { formatCurrency, formatDate, formatDateTime, initials } from "@/lib/format";
import { formatRateBps, RELATIONSHIP_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/manager-constants";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  ArrowLeftRight, Building2, ClipboardList, Coins, FlaskConical, Handshake,
  IdCard, Mail, MapPin, Percent, Phone, Ticket, UserCircle,
} from "lucide-react";

interface ManagerProfile {
  id: string;
  managerNumber: string;
  onboardingCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  territory: string;
  employmentStatus: string;
  verificationStatus: string;
  joinedAt: string;
}

interface PortfolioRow {
  id: string;
  organizationType: "pharmacy" | "laboratory";
  organizationNumber: string;
  name: string;
  city: string;
  state: string;
  verificationStatus: string;
  joinedAt: string;
  acquiredByManagerId: string | null;
  acquiredAt: string | null;
  currentManagerId: string | null;
  managerAssignedAt: string | null;
  managerRelationshipStatus: string | null;
}

interface AssignmentRow {
  id: string;
  organizationType: string;
  organizationName: string;
  source: string;
  relationshipStatus: string;
  startsAt: string;
  endsAt?: string | null;
  assignedBy: string;
  reason?: string | null;
}

interface RuleRow {
  id: string;
  organizationType: string;
  transactionType: string;
  rateBps: number;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  status: string;
  createdBy: string;
  approvedBy?: string | null;
}

interface ManagerDetailPayload {
  manager: ManagerProfile;
  stats: { portfolioSize: number; acquiredCount: number; openTickets: number; pendingApplications: number };
  portfolio: PortfolioRow[];
  assignments: AssignmentRow[];
  rules: RuleRow[];
  earnings: { totals: Record<string, { amount: number; count: number }> };
}

type Tab = "overview" | "portfolio" | "history" | "rules";

const SOURCE_LABELS: Record<string, string> = {
  acquisition: "Acquisition",
  application_approval: "Application approval",
  admin_assignment: "Admin assignment",
  reassignment: "Reassignment",
};

export function AdminManagerDetail() {
  const { view } = useNav();
  const managerId = view.params.id ?? "";
  const [data, setData] = useState<ManagerDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    if (!managerId) {
      setError("Missing manager id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await sessionApi.get<{ data: ManagerDetailPayload }>(`/api/admin/managers/${managerId}`);
      setData(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manager.");
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <EmptyState icon={UserCircle} title="Manager not found" description="The manager you are looking for does not exist." action={<Button onClick={() => navigate("admin", "managers")}>Back to managers</Button>} />;

  const m = data.manager;
  const fullName = `${m.firstName} ${m.lastName}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={fullName}
        description={`Manager ID ${m.managerNumber} · Territory ${m.territory}`}
        back
        actions={<ManagerStatusBadge status={m.verificationStatus} />}
      />

      <SectionCard className="bg-muted/20">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials(fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{fullName}</p>
            <p className="text-xs text-muted-foreground truncate">{m.email} · {m.phone}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {m.city}, {m.state}</span>
              <span className="flex items-center gap-1"><IdCard className="h-3 w-3" /> {m.onboardingCode}</span>
              <span className="flex items-center gap-1">Joined {formatDate(m.joinedAt)}</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Currently managed" value={data.stats.portfolioSize} hint="Active assignments" icon={Building2} />
        <MetricCard label="Acquired by them" value={data.stats.acquiredCount} hint="Lifetime acquisition attribution" icon={Handshake} tone="violet" />
        <MetricCard label="Open tickets" value={data.stats.openTickets} hint="First-level support workload" icon={Ticket} tone="warning" />
        <MetricCard label="Pending applications" value={data.stats.pendingApplications} hint="Awaiting review" icon={ClipboardList} tone="info" />
      </div>

      <div className="flex flex-wrap gap-2">
        <AssignOrganizationDialog managerId={m.id} onDone={() => void load()} />
        <RevenueShareRuleDialog managerId={m.id} onDone={() => void load()} />
      </div>

      <SegmentedControl
        options={[
          { value: "overview" as Tab, label: "Overview" },
          { value: "portfolio" as Tab, label: "Portfolio", badge: data.portfolio.length },
          { value: "history" as Tab, label: "History", badge: data.assignments.length },
          { value: "rules" as Tab, label: "Rules", badge: data.rules.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {tab === "overview" && (
        <div className="space-y-3">
          <SectionCard title="Profile" icon={UserCircle} description="Identity, employment and territory">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field icon={<IdCard className="h-3.5 w-3.5" />} label="Manager ID" value={m.managerNumber} mono />
              <Field icon={<IdCard className="h-3.5 w-3.5" />} label="Onboarding code" value={m.onboardingCode} mono />
              <Field icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={m.email} />
              <Field icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={m.phone} />
              <Field icon={<MapPin className="h-3.5 w-3.5" />} label="City / State" value={`${m.city}, ${m.state}`} />
              <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Territory" value={m.territory} />
              <Field icon={<UserCircle className="h-3.5 w-3.5" />} label="Employment status" value={m.employmentStatus.replace("_", " ")} />
              <Field icon={<ArrowLeftRight className="h-3.5 w-3.5" />} label="Verification" value={m.verificationStatus} />
            </dl>
          </SectionCard>

          <SectionCard title="Manager Earnings summary" icon={Coins} description="Ledger totals by status (gross refund impact for reversals)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <EarningStat label="Pending" amount={data.earnings.totals.pending?.amount ?? 0} />
              <EarningStat label="Available" amount={data.earnings.totals.available?.amount ?? 0} />
              <EarningStat label="Paid" amount={data.earnings.totals.paid?.amount ?? 0} />
              <EarningStat label="Reversed" amount={data.earnings.totals.reversed?.amount ?? 0} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Counts: {data.earnings.totals.pending?.count ?? 0} pending · {data.earnings.totals.available?.count ?? 0} available · {data.earnings.totals.paid?.count ?? 0} paid · {data.earnings.totals.reversed?.count ?? 0} reversed entries.
            </p>
          </SectionCard>
        </div>
      )}

      {tab === "portfolio" && (
        <SectionCard
          title="Portfolio"
          icon={Building2}
          description="Currently managed and previously attributed organizations"
        >
          {data.portfolio.length === 0 ? (
            <EmptyState icon={Building2} title="No organizations" description="This manager has no attributed organizations yet." compact />
          ) : (
            <ul className="divide-y divide-border/40">
              {data.portfolio.map((p) => {
                const acquired = p.acquiredByManagerId === m.id;
                const current = p.currentManagerId === m.id && p.managerRelationshipStatus === "active";
                const past = p.currentManagerId === m.id && p.managerRelationshipStatus !== "active";
                return (
                  <li key={`${p.organizationType}-${p.id}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.organizationType === "pharmacy" ? (
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <FlaskConical className="h-4 w-4 text-primary shrink-0" />
                          )}
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <ManagerStatusBadge status={p.verificationStatus} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.organizationNumber} · {p.city}, {p.state} · On platform since {formatDate(p.joinedAt)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                          {current && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 px-1.5 py-0.5 font-medium">
                              <Building2 className="h-3 w-3" /> Currently managed{p.managerAssignedAt ? ` since ${formatDate(p.managerAssignedAt)}` : ""}
                            </span>
                          )}
                          {past && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-1.5 py-0.5 font-medium">
                              <ArrowLeftRight className="h-3 w-3" /> Assignment {p.managerRelationshipStatus}
                            </span>
                          )}
                          {acquired && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-700 px-1.5 py-0.5 font-medium">
                              <Handshake className="h-3 w-3" /> Acquired by this manager{p.acquiredAt ? ` on ${formatDate(p.acquiredAt)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">{p.organizationType}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "history" && (
        <SectionCard title="Assignment history" icon={ArrowLeftRight} description="Immutable assignment records — reassignment closes the prior row">
          {data.assignments.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No assignments" description="No assignment history recorded for this manager." compact />
          ) : (
            <ol className="px-4 py-3">
              {data.assignments.map((a, i) => (
                <li key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5" />
                    {i < data.assignments.length - 1 && <div className="flex-1 w-px bg-border mt-1" style={{ minHeight: 16 }} />}
                  </div>
                  <div className="min-w-0 flex-1 pb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{a.organizationName}</p>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{a.organizationType}</span>
                      <span className="text-xs text-muted-foreground">({SOURCE_LABELS[a.source] ?? a.source})</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(a.startsAt)} — {a.endsAt ? formatDate(a.endsAt) : "present"} ·{" "}
                      {RELATIONSHIP_STATUS_LABELS[a.relationshipStatus as keyof typeof RELATIONSHIP_STATUS_LABELS] ?? a.relationshipStatus} · Assigned by {a.assignedBy}
                    </p>
                    {a.reason ? <p className="text-xs text-muted-foreground mt-0.5 italic">Reason: {a.reason}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      )}

      {tab === "rules" && (
        <SectionCard
          title="Revenue share rules"
          icon={Percent}
          description="Effective-dated rules; overlapping active rules are rejected by the server"
          action={<RevenueShareRuleDialog managerId={m.id} onDone={() => void load()} />}
        >
          {data.rules.length === 0 ? (
            <EmptyState icon={Percent} title="No rules" description="No revenue share rules configured for this manager yet." compact />
          ) : (
            <ul className="divide-y divide-border/40">
              {data.rules.map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {TRANSACTION_TYPE_LABELS[r.transactionType as keyof typeof TRANSACTION_TYPE_LABELS] ?? r.transactionType}
                      <span className="text-muted-foreground font-normal"> · {r.organizationType}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Effective {formatDate(r.effectiveFrom)} — {r.effectiveUntil ? formatDate(r.effectiveUntil) : "open"} · Created by {r.createdBy}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{formatRateBps(r.rateBps)}</p>
                    <StatusBadge status={r.status} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function Field({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2.5 sm:border-0 sm:pb-0">
      <dt className="text-muted-foreground flex items-center gap-1.5 shrink-0">{icon}{label}</dt>
      <dd className={`font-medium text-right min-w-0 truncate ${mono ? "font-mono text-xs pt-0.5" : ""}`}>{value}</dd>
    </div>
  );
}

function EarningStat({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-none">{formatCurrency(amount)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin action dialogs
// ---------------------------------------------------------------------------

function AssignOrganizationDialog({ managerId, onDone }: { managerId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [organizationType, setOrganizationType] = useState<"pharmacy" | "laboratory">("pharmacy");
  const [organizationId, setOrganizationId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!organizationId.trim() || !reason.trim()) {
      toast.error("Organization ID and reason are required.");
      return;
    }
    setSubmitting(true);
    try {
      await managerService.adminAssignManager({ organizationType, organizationId: organizationId.trim(), managerId, reason: reason.trim() });
      toast.success("Organization assigned — the manager and organization have been notified.");
      setOpen(false);
      setOrganizationId("");
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign organization.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} size="sm">
        <Building2 className="h-4 w-4" /> Assign organization
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign an organization</DialogTitle>
          <DialogDescription>
            Adds (or reassigns) an organization into this manager&apos;s portfolio. A reason is mandatory and recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Organization type</Label>
            <Select value={organizationType} onValueChange={(v) => setOrganizationType(v as "pharmacy" | "laboratory")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pharmacy">Pharmacy</SelectItem>
                <SelectItem value="laboratory">Laboratory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-org-id">Organization ID <span className="text-rose-500">*</span></Label>
            <Input id="assign-org-id" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder={organizationType === "pharmacy" ? "PHA-003" : "LAB-002"} />
            <p className="text-[11px] text-muted-foreground">Prototype input — paste the organization ID (e.g. from its detail page).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-reason">Reason <span className="text-rose-500">*</span></Label>
            <Textarea id="assign-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this organization being (re)assigned to this manager?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={submitting || !organizationId.trim() || !reason.trim()}>
            {submitting ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevenueShareRuleDialog({ managerId, onDone }: { managerId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [activityType, setActivityType] = useState<"consultation" | "pharmacy" | "laboratory" | "hospital">("consultation");
  const [rateBps, setRateBps] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsed = Number(rateBps);
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000;

  async function submit() {
    if (!valid) {
      toast.error("Rate must be a whole number of basis points between 1 and 10000.");
      return;
    }
    setSubmitting(true);
    try {
      await managerService.adminManagerRule({ action: "create", managerId, activityType, rateBps: parsed });
      toast.success("Revenue share rule created.");
      setOpen(false);
      setRateBps("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create rule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <Percent className="h-4 w-4" /> New revenue share rule
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create revenue share rule</DialogTitle>
          <DialogDescription>
            Effective-dated rule for this manager. An overlapping active rule for the same scope is rejected by the server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Patient activity</Label>
              <Select value={activityType} onValueChange={(v) => setActivityType(v as typeof activityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultation">Consultation</SelectItem><SelectItem value="pharmacy">Pharmacy order</SelectItem><SelectItem value="laboratory">Laboratory booking</SelectItem><SelectItem value="hospital">Hospital payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-rate">Rate (basis points)</Label>
            <Input
              id="rule-rate"
              inputMode="numeric"
              value={rateBps}
              onChange={(e) => setRateBps(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="300"
            />
            <p className="text-[11px] text-muted-foreground">300 = 3% · integer basis points, 10000 = 100%.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={submitting || !valid}>
            {submitting ? "Creating…" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
