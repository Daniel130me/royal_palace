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
import { PageHeader, EmptyState, LoadingState, SectionCard } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Stethoscope, Pill, FlaskConical, Package, ArrowRight, HeartPulse, AlertCircle,
  Activity, FileText, ChevronRight, ShieldCheck, User, Building2,
} from "lucide-react";
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
  onClick?: () => void;
}

const KIND_TONE: Record<TimelineKind, { bg: string; text: string; dot: string }> = {
  consultation: { bg: "bg-emerald-50 ring-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  prescription: { bg: "bg-violet-50 ring-violet-100", text: "text-violet-700", dot: "bg-violet-500" },
  laboratory: { bg: "bg-sky-50 ring-sky-100", text: "text-sky-700", dot: "bg-sky-500" },
  referral: { bg: "bg-amber-50 ring-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  order: { bg: "bg-rose-50 ring-rose-100", text: "text-rose-700", dot: "bg-rose-500" },
  diagnosis: { bg: "bg-emerald-50 ring-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

export function PatientRecords() {
  const { profile } = usePatientContext();
  const [loading, setLoading] = useState(true);
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
      items.push({
        id: `enc-${e.id}`,
        kind: "consultation",
        date: e.createdAt,
        title: `Consultation with ${e.provider ? fullName(e.provider) : "Provider"}`,
        subtitle: e.documentation?.diagnosis || e.documentation?.chiefComplaint || "Clinical encounter",
        status: e.status,
        ref: e.encounterNumber,
        onClick: () => navigate("patient", "appointment", { id: e.appointmentId }),
      });
    });
    diagnoses.forEach((d) => {
      items.push({
        id: `dx-${d.id}`,
        kind: "diagnosis",
        date: formatDate(d.encounterId ? new Date().toISOString() : new Date().toISOString()),
        title: d.description,
        subtitle: `Diagnosis (${d.type}) ${d.code ? `· ${d.code}` : ""}`,
        status: d.status,
        onClick: undefined,
      });
    });
    prescriptions.forEach((p) => {
      items.push({
        id: `rx-${p.id}`,
        kind: "prescription",
        date: p.validityStartDate,
        title: `Prescription ${p.prescriptionNumber}`,
        subtitle: `${p.items?.length ?? 0} item(s) · Issued by ${p.provider ? fullName(p.provider) : "Provider"}`,
        status: p.status,
        ref: p.prescriptionNumber,
        onClick: () => navigate("patient", "prescription", { id: p.id }),
      });
    });
    labRequests.forEach((l) => {
      items.push({
        id: `lab-${l.id}`,
        kind: "laboratory",
        date: l.result?.resultDate ?? createdAt(l) ?? l.requestNumber,
        title: l.tests.join(", "),
        subtitle: l.result?.value ? `Result: ${l.result.value}${l.result.unit ? " " + l.result.unit : ""}` : `Request ${l.requestNumber} · ${l.status}`,
        status: l.status,
        ref: l.requestNumber,
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
  const recentResults = labRequests.filter((l) => l.result).slice(0, 3);
  const activeReferrals = referrals.filter((r) => !["completed", "expired", "declined"].includes(r.status));
  const activeCarePlans = carePlans.filter((c) => c.status === "active");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health Records"
        description="A unified timeline of your clinical journey."
        actions={<Button variant="outline" size="sm" onClick={() => navigate("patient", "consent")}>Manage access</Button>}
      />

      {/* Health summary — highlighted */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-1">
        <SectionCard title="Health summary" icon={HeartPulse}>
          <div className="grid gap-4 sm:grid-cols-3">
            <HealthColumn
              label="Active conditions"
              tone="amber"
              icon={Activity}
              items={activeConditions}
              emptyText="No active conditions recorded"
            />
            <HealthColumn
              label="Allergies"
              tone="rose"
              icon={AlertCircle}
              items={activeAllergies}
              emptyText="No allergies recorded"
            />
            <HealthColumn
              label="Current medicines"
              tone="sky"
              icon={Pill}
              items={activeMedications}
              emptyText="No active medicines"
            />
          </div>
        </SectionCard>
      </div>

      {/* Recent results, active referrals, care plans */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard title="Recent results" icon={FlaskConical} dense>
          {recentResults.length === 0 ? (
            <div className="p-5"><p className="text-sm text-muted-foreground">No results yet.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {recentResults.map((l) => (
                <li key={l.id} className="px-4 sm:px-5 py-3">
                  <p className="text-sm font-medium">{l.result?.test}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {l.result?.value}{l.result?.unit ? ` ${l.result.unit}` : ""} · {l.result?.abnormalIndicator ?? "normal"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(l.result?.resultDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Active referrals" icon={ArrowRight} dense>
          {activeReferrals.length === 0 ? (
            <div className="p-5"><p className="text-sm text-muted-foreground">No active referrals.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {activeReferrals.map((r) => (
                <li key={r.id} className="px-4 sm:px-5 py-3">
                  <p className="text-sm font-medium">{r.recipientSpecialty || r.recipient?.specialty || "Specialist"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{r.reason}</p>
                  <div className="mt-1.5"><StatusBadge status={r.status} size="sm" /></div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Active care plans" icon={HeartPulse} dense>
          {activeCarePlans.length === 0 ? (
            <div className="p-5"><p className="text-sm text-muted-foreground">No active care plans.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {activeCarePlans.map((c) => (
                <li key={c.id} className="px-4 sm:px-5 py-3">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDate(c.startDate)} → {c.endDate ? formatDate(c.endDate) : "Ongoing"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Timeline tabs */}
      <Tabs defaultValue="all">
        <div className="sticky top-14 lg:top-16 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur-md">
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="all">All ({timeline.length})</TabsTrigger>
            <TabsTrigger value="consultation">Consultations ({encounters.length})</TabsTrigger>
            <TabsTrigger value="prescription">Prescriptions ({prescriptions.length})</TabsTrigger>
            <TabsTrigger value="laboratory">Laboratory ({labRequests.length})</TabsTrigger>
            <TabsTrigger value="referral">Referrals ({referrals.length})</TabsTrigger>
            <TabsTrigger value="order">Orders ({orders.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-5">
          <Timeline items={timeline} />
        </TabsContent>
        <TabsContent value="consultation" className="mt-5">
          <Timeline items={timeline.filter((t) => t.kind === "consultation" || t.kind === "diagnosis")} />
        </TabsContent>
        <TabsContent value="prescription" className="mt-5">
          <Timeline items={timeline.filter((t) => t.kind === "prescription")} />
        </TabsContent>
        <TabsContent value="laboratory" className="mt-5">
          <Timeline items={timeline.filter((t) => t.kind === "laboratory")} />
        </TabsContent>
        <TabsContent value="referral" className="mt-5">
          <Timeline items={timeline.filter((t) => t.kind === "referral")} />
        </TabsContent>
        <TabsContent value="order" className="mt-5">
          <Timeline items={timeline.filter((t) => t.kind === "order")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HealthColumn({ label, tone, icon: Icon, items, emptyText }: {
  label: string; tone: "amber" | "rose" | "sky";
  icon: React.ComponentType<{ className?: string }>;
  items: HealthRecordItem[]; emptyText: string;
}) {
  const dotColor = tone === "amber" ? "bg-amber-500" : tone === "rose" ? "bg-rose-500" : "bg-sky-500";
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shrink-0`} />
                <span className="truncate">{it.name}</span>
              </span>
              <ProvenanceBadge source={it.source} />
            </li>
          ))}
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

function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={FileText} title="No records yet" description="Your clinical timeline will appear here as you consult with providers." />;
  }
  return (
    <ol className="relative space-y-3">
      {/* Vertical line */}
      <div className="absolute left-[18px] sm:left-[22px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {items.map((it) => {
        const tone = KIND_TONE[it.kind];
        const Icon = iconFor(it.kind);
        return (
          <li key={it.id} className="relative pl-12 sm:pl-14">
            {/* Dot */}
            <div className={`absolute left-0 top-3 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl ring-1 ${tone.bg}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${tone.text}`} />
            </div>
            <button
              onClick={it.onClick}
              disabled={!it.onClick}
              className={`block w-full text-left rounded-2xl border border-border/80 bg-card p-4 shadow-soft transition-all ${it.onClick ? "hover:shadow-soft-md hover:border-primary/30 cursor-pointer tap-highlight-none" : "cursor-default"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{it.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{it.subtitle}</p>
                </div>
                <StatusBadge status={it.status} size="sm" />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDateTime(it.date)}</span>
                {it.ref && <span>· {it.ref}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function iconFor(k: TimelineKind) {
  return k === "consultation" ? Stethoscope :
    k === "prescription" ? Pill :
    k === "laboratory" ? FlaskConical :
    k === "referral" ? ArrowRight :
    k === "order" ? Package : Activity;
}
