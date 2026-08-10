"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/nav";
import {
  appointmentService, prescriptionService, labRequestService, pharmacyOrderService,
  referralService, carePlanService, encounterService, diagnosisService,
} from "@/lib/services";
import type {
  Appointment, ClinicalEncounter, Prescription, LaboratoryRequest, PharmacyOrder,
  Referral, CarePlan, Diagnosis, HealthRecordItem,
} from "@/types";
import { PageHeader, EmptyState, LoadingState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { CompactListItem, ExpandableCard, StatTile } from "@/components/healthcare/compact-list";
import {
  Stethoscope, Pill, FlaskConical, Package, ArrowRight, HeartPulse, AlertCircle,
  Activity, FileText, ShieldCheck, User, Building2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { createdAt } from "../lib/runtime-fields";
import { usePatientContext } from "../use-patient-context";

type TimelineKind = "consultation" | "prescription" | "laboratory" | "referral" | "order" | "diagnosis";
interface TimelineItem {
  id: string;
  kind: TimelineKind;
  date: string;
  title: string;
  subtitle: string;
  status: string;
  ref?: string;
  detail?: React.ReactNode;
  onClick?: () => void;
}

type RecordsTab = "summary" | "timeline" | "care-plan";
type TimelineFilter = "all" | "consultation" | "prescription" | "laboratory" | "referral" | "order";

const KIND_TONE: Record<TimelineKind, { bg: string; text: string }> = {
  consultation: { bg: "bg-emerald-50 ring-emerald-100", text: "text-emerald-700" },
  prescription: { bg: "bg-violet-50 ring-violet-100", text: "text-violet-700" },
  laboratory: { bg: "bg-sky-50 ring-sky-100", text: "text-sky-700" },
  referral: { bg: "bg-amber-50 ring-amber-100", text: "text-amber-700" },
  order: { bg: "bg-rose-50 ring-rose-100", text: "text-rose-700" },
  diagnosis: { bg: "bg-emerald-50 ring-emerald-100", text: "text-emerald-700" },
};

const FILTER_CHIPS: { value: TimelineFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "consultation", label: "Consultations" },
  { value: "prescription", label: "Prescriptions" },
  { value: "laboratory", label: "Lab" },
  { value: "referral", label: "Referrals" },
  { value: "order", label: "Orders" },
];

export function PatientRecords() {
  const { profile } = usePatientContext();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RecordsTab>("summary");
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labRequests, setLabRequests] = useState<LaboratoryRequest[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      appointmentService.list({ patientId: profile.id }),
      prescriptionService.list({ patientId: profile.id }),
      labRequestService.list({ patientId: profile.id }),
      pharmacyOrderService.list({ patientId: profile.id }),
      referralService.list({ patientId: profile.id }),
      carePlanService.list(profile.id),
      diagnosisService.list(profile.id),
    ]).then(async ([appts, rx, labs, ords, refs, plans, dx]) => {
      if (cancelled) return;
      setAppointments(appts);
      setPrescriptions(rx);
      setLabRequests(labs);
      setOrders(ords);
      setReferrals(refs);
      setCarePlans(plans);
      setDiagnoses(dx);
      const completed = appts.filter((a) => a.status === "completed");
      const encs: ClinicalEncounter[] = [];
      for (const a of completed) {
        try {
          const e = await encounterService.byAppointment(a.id);
          if (e) encs.push(e);
        } catch { /* skip */ }
      }
      if (!cancelled) setEncounters(encs);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    encounters.forEach((e) => {
      const subtitle = e.documentation?.diagnosis || e.documentation?.chiefComplaint || "Clinical encounter";
      items.push({
        id: `enc-${e.id}`,
        kind: "consultation",
        date: e.createdAt,
        title: `Consultation with ${e.provider ? fullName(e.provider) : "Provider"}`,
        subtitle,
        status: e.status,
        ref: e.encounterNumber,
        onClick: () => navigate("patient", "appointment", { id: e.appointmentId }),
      });
    });
    diagnoses.forEach((d) => {
      items.push({
        id: `dx-${d.id}`,
        kind: "diagnosis",
        date: d.encounterId ? new Date().toISOString() : new Date().toISOString(),
        title: d.description,
        subtitle: `Diagnosis (${d.type}) ${d.code ? `· ${d.code}` : ""}`,
        status: d.status,
        onClick: undefined,
      });
    });
    prescriptions.forEach((p) => {
      const meds = (p.items ?? []).map((i) => i.medicine).join(", ");
      items.push({
        id: `rx-${p.id}`,
        kind: "prescription",
        date: p.validityStartDate,
        title: `Prescription ${p.prescriptionNumber}`,
        subtitle: `${p.items?.length ?? 0} item(s) · Issued by ${p.provider ? fullName(p.provider) : "Provider"}`,
        status: p.status,
        ref: p.prescriptionNumber,
        detail: meds ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
            <p className="text-xs text-foreground leading-relaxed">{meds}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
              <span>Issued: {formatDate(p.validityStartDate)}</span>
              <span>Expires: {formatDate(p.expiryDate)}</span>
            </div>
          </div>
        ) : undefined,
        onClick: () => navigate("patient", "prescription", { id: p.id }),
      });
    });
    labRequests.forEach((l) => {
      const hasResult = !!l.result;
      items.push({
        id: `lab-${l.id}`,
        kind: "laboratory",
        date: l.result?.resultDate ?? createdAt(l) ?? l.requestNumber,
        title: l.tests.join(", "),
        subtitle: hasResult
          ? `Result: ${l.result!.value}${l.result!.unit ? " " + l.result!.unit : ""}`
          : `Request ${l.requestNumber} · ${l.status}`,
        status: l.status,
        ref: l.requestNumber,
        detail: hasResult ? (
          <div className="space-y-2">
            <Row label="Value" value={`${l.result!.value}${l.result!.unit ? ` ${l.result!.unit}` : ""}`} />
            <Row label="Reference range" value={l.result!.referenceRange ?? "—"} />
            <Row label="Indicator" value={<span className="capitalize">{l.result!.abnormalIndicator ?? "normal"}</span>} />
            <Row label="Lab" value={l.result!.laboratory?.name ?? "—"} />
          </div>
        ) : undefined,
        onClick: () => navigate("patient", "laboratory"),
      });
    });
    referrals.forEach((r) => {
      items.push({
        id: `ref-${r.id}`,
        kind: "referral",
        date: createdAt(r) ?? r.referralNumber,
        title: `Referral to ${r.recipientSpecialty || r.recipient?.specialty || "Specialist"}`,
        subtitle: r.reason,
        status: r.status,
        ref: r.referralNumber,
        onClick: undefined,
      });
    });
    orders.forEach((o) => {
      items.push({
        id: `ord-${o.id}`,
        kind: "order",
        date: createdAt(o) ?? o.orderNumber,
        title: `Pharmacy order ${o.orderNumber}`,
        subtitle: `${o.pharmacy?.name ?? "Pharmacy"} · ${o.items?.length ?? 0} item(s)`,
        status: o.status,
        ref: o.orderNumber,
        onClick: () => navigate("patient", "order", { id: o.id }),
      });
    });
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [encounters, diagnoses, prescriptions, labRequests, referrals, orders]);

  if (loading) return <LoadingState label="Loading your records…" />;
  if (!profile) return <EmptyState title="No patient profile" />;

  const activeConditions = profile.conditions.filter((c) => c.status === "active");
  const activeAllergies = profile.allergies.filter((c) => c.status === "active");
  const activeMedications = profile.medications.filter((c) => c.status === "active");
  const activeReferrals = referrals.filter((r) => !["completed", "expired", "declined"].includes(r.status));
  const activeCarePlans = carePlans.filter((c) => c.status === "active");
  const recentTimeline = timeline.slice(0, 3);
  const filteredTimeline = filter === "all"
    ? timeline
    : filter === "consultation"
      ? timeline.filter((t) => t.kind === "consultation" || t.kind === "diagnosis")
      : timeline.filter((t) => t.kind === filter);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Health Records"
        description="A unified view of your clinical journey."
        actions={<Button variant="outline" size="sm" onClick={() => navigate("patient", "consent")}>Manage access</Button>}
      />

      <SegmentedControl<RecordsTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "summary", label: "Summary" },
          { value: "timeline", label: "Timeline" },
          { value: "care-plan", label: "Care Plan" },
        ]}
      />

      {tab === "summary" && (
        <SummaryTab
          conditions={activeConditions}
          allergies={activeAllergies}
          medications={activeMedications}
          referralCount={activeReferrals.length}
          recent={recentTimeline}
          onSeeAllTimeline={() => { setTab("timeline"); setFilter("all"); }}
        />
      )}

      {tab === "timeline" && (
        <div className="space-y-3">
          {/* Filter chips — horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            {FILTER_CHIPS.map((c) => {
              const count = c.value === "all"
                ? timeline.length
                : c.value === "consultation"
                  ? timeline.filter((t) => t.kind === "consultation" || t.kind === "diagnosis").length
                  : timeline.filter((t) => t.kind === c.value).length;
              const active = filter === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => setFilter(c.value)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all tap-highlight-none",
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "bg-card border border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.label}
                  <span className={cn("ml-1.5", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>{count}</span>
                </button>
              );
            })}
          </div>

          {filteredTimeline.length === 0 ? (
            <EmptyState icon={FileText} title="No records" description="Nothing in this category yet." compact />
          ) : (
            <div className="space-y-2">
              {filteredTimeline.map((it) => {
                const tone = KIND_TONE[it.kind];
                const Icon = iconFor(it.kind);
                return (
                  <ExpandableCard
                    key={it.id}
                    leading={
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1", tone.bg)}>
                        <Icon className={cn("h-4 w-4", tone.text)} />
                      </div>
                    }
                    title={it.title}
                    subtitle={it.subtitle}
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={it.status} size="sm" />
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(it.date)}</span>
                      </div>
                    }
                  >
                    <div className="space-y-3 pt-1">
                      {it.detail}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="capitalize">{it.kind}</span>
                        {it.ref && <><span>·</span><span>{it.ref}</span></>}
                      </div>
                      {it.onClick && (
                        <Button size="sm" variant="outline" onClick={it.onClick} className="w-full sm:w-auto">
                          Open details <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </ExpandableCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "care-plan" && (
        <CarePlanTab plans={activeCarePlans} />
      )}
    </div>
  );
}

function SummaryTab({
  conditions, allergies, medications, referralCount, recent, onSeeAllTimeline,
}: {
  conditions: HealthRecordItem[];
  allergies: HealthRecordItem[];
  medications: HealthRecordItem[];
  referralCount: number;
  recent: TimelineItem[];
  onSeeAllTimeline: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* 4 StatTiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label="Conditions" value={conditions.length} icon={Activity} tone="warning" onClick={onSeeAllTimeline} />
        <StatTile label="Allergies" value={allergies.length} icon={AlertCircle} tone="danger" onClick={onSeeAllTimeline} />
        <StatTile label="Medicines" value={medications.length} icon={Pill} tone="info" onClick={onSeeAllTimeline} />
        <StatTile label="Referrals" value={referralCount} icon={ArrowRight} tone="violet" onClick={onSeeAllTimeline} />
      </div>

      {/* Inline lists */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthMiniList label="Active conditions" tone="amber" icon={Activity} items={conditions} />
        <HealthMiniList label="Allergies" tone="rose" icon={AlertCircle} items={allergies} />
        <HealthMiniList label="Current medicines" tone="sky" icon={Pill} items={medications} />
      </div>

      {/* Recent activity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent activity</p>
          <button onClick={onSeeAllTimeline} className="text-xs font-medium text-primary">
            See all
          </button>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={FileText} title="No recent activity" description="Your clinical timeline will grow as you consult with providers." compact />
        ) : (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
            {recent.map((it) => {
              const tone = KIND_TONE[it.kind];
              const Icon = iconFor(it.kind);
              return (
                <CompactListItem
                  key={it.id}
                  leading={
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg ring-1", tone.bg)}>
                      <Icon className={cn("h-3.5 w-3.5", tone.text)} />
                    </div>
                  }
                  title={it.title}
                  subtitle={`${it.subtitle} · ${formatDate(it.date)}`}
                  onClick={it.onClick ?? onSeeAllTimeline}
                  chevron={!!it.onClick}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HealthMiniList({ label, tone, icon: Icon, items }: {
  label: string;
  tone: "amber" | "rose" | "sky";
  icon: React.ComponentType<{ className?: string }>;
  items: HealthRecordItem[];
}) {
  const dotColor = tone === "amber" ? "bg-amber-500" : tone === "rose" ? "bg-rose-500" : "bg-sky-500";
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None recorded</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 4).map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor)} />
                <span className="truncate">{it.name}</span>
              </span>
              <ProvenanceBadge source={it.source} />
            </li>
          ))}
          {items.length > 4 && (
            <li className="text-[11px] text-muted-foreground pl-3">+{items.length - 4} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

function ProvenanceBadge({ source }: { source: HealthRecordItem["source"] }) {
  if (source === "provider-confirmed") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] gap-0.5 h-4 px-1">
        <ShieldCheck className="h-2.5 w-2.5" /> Confirmed
      </Badge>
    );
  }
  if (source === "imported") {
    return (
      <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1">
        <Building2 className="h-2.5 w-2.5" /> Imported
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1">
      <User className="h-2.5 w-2.5" /> Self
    </Badge>
  );
}

function CarePlanTab({ plans }: { plans: CarePlan[] }) {
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={HeartPulse}
        title="No active care plans"
        description="Your provider will create a care plan with goals and milestones when needed."
      />
    );
  }
  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <div key={plan.id} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 shrink-0">
              <HeartPulse className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{plan.title}</p>
              {plan.description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{plan.description}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">
                {formatDate(plan.startDate)} → {plan.endDate ? formatDate(plan.endDate) : "Ongoing"}
              </p>
            </div>
            <StatusBadge status={plan.status} size="sm" />
          </div>
          {plan.goals.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Goals</p>
              <div className="flex flex-wrap gap-2">
                {plan.goals.map((g, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-2.5 py-1 text-xs font-medium"
                  >
                    <CheckCircle2 className="h-3 w-3" /> {g}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function iconFor(k: TimelineKind) {
  return k === "consultation" ? Stethoscope :
    k === "prescription" ? Pill :
    k === "laboratory" ? FlaskConical :
    k === "referral" ? ArrowRight :
    k === "order" ? Package : Activity;
}
