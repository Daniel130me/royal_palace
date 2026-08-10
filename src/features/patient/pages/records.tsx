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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Stethoscope, Pill, FlaskConical, Package, ArrowRight, HeartPulse, AlertCircle,
  Activity, FileText, ChevronRight, ShieldCheck, User, Building2, Calendar,
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
      setAppointments(appts);
      setPrescriptions(rx);
      setLabRequests(labs);
      setOrders(ords);
      setReferrals(refs);
      setCarePlans(plans);
      setDiagnoses(dx);
      // Resolve encounters from completed appointments
      const completed = appts.filter((a) => a.status === "completed");
      const encs: ClinicalEncounter[] = [];
      for (const a of completed) {
        try {
          const e = await encounterService.byAppointment(a.id);
          if (e) encs.push(e);
        } catch { /* skip */ }
      }
      setEncounters(encs);
    }).finally(() => setLoading(false));
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
    <div>
      <PageHeader
        title="Health Records"
        description="A unified timeline of your clinical journey."
        actions={<Button variant="outline" size="sm" onClick={() => navigate("patient", "consent")}>Manage access</Button>}
      />

      {/* Health summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <SummaryCard
          title="Active conditions"
          icon={Activity}
          tone="amber"
          items={activeConditions}
          emptyText="No active conditions recorded"
        />
        <SummaryCard
          title="Allergies"
          icon={AlertCircle}
          tone="rose"
          items={activeAllergies}
          emptyText="No allergies recorded"
        />
        <SummaryCard
          title="Current medicines"
          icon={Pill}
          tone="sky"
          items={activeMedications}
          emptyText="No active medicines"
        />
      </div>

      {/* Recent results, active referrals, care plans */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><FlaskConical className="h-4 w-4" /> Recent results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results yet.</p>
            ) : recentResults.map((l) => (
              <div key={l.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">{l.result?.test}</p>
                <p className="text-xs text-muted-foreground">
                  {l.result?.value}{l.result?.unit ? ` ${l.result.unit}` : ""} · {l.result?.abnormalIndicator ?? "normal"}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatDate(l.result?.resultDate)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><ArrowRight className="h-4 w-4" /> Active referrals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeReferrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active referrals.</p>
            ) : activeReferrals.map((r) => (
              <div key={r.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">{r.recipientSpecialty || r.recipient?.specialty || "Specialist"}</p>
                <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                <StatusBadge status={r.status} className="mt-1 text-[10px]" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><HeartPulse className="h-4 w-4" /> Active care plans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeCarePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active care plans.</p>
            ) : activeCarePlans.map((c) => (
              <div key={c.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDate(c.startDate)} → {c.endDate ? formatDate(c.endDate) : "Ongoing"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Tabs defaultValue="all">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="all">All ({timeline.length})</TabsTrigger>
          <TabsTrigger value="consultation">Consultations ({encounters.length})</TabsTrigger>
          <TabsTrigger value="prescription">Prescriptions ({prescriptions.length})</TabsTrigger>
          <TabsTrigger value="laboratory">Laboratory ({labRequests.length})</TabsTrigger>
          <TabsTrigger value="referral">Referrals ({referrals.length})</TabsTrigger>
          <TabsTrigger value="order">Orders ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <Timeline items={timeline} />
        </TabsContent>
        <TabsContent value="consultation" className="mt-4">
          <Timeline items={timeline.filter((t) => t.kind === "consultation" || t.kind === "diagnosis")} />
        </TabsContent>
        <TabsContent value="prescription" className="mt-4">
          <Timeline items={timeline.filter((t) => t.kind === "prescription")} />
        </TabsContent>
        <TabsContent value="laboratory" className="mt-4">
          <Timeline items={timeline.filter((t) => t.kind === "laboratory")} />
        </TabsContent>
        <TabsContent value="referral" className="mt-4">
          <Timeline items={timeline.filter((t) => t.kind === "referral")} />
        </TabsContent>
        <TabsContent value="order" className="mt-4">
          <Timeline items={timeline.filter((t) => t.kind === "order")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ title, icon: Icon, tone, items, emptyText }: {
  title: string; icon: React.ComponentType<{ className?: string }>; tone: "amber" | "rose" | "sky";
  items: HealthRecordItem[]; emptyText: string;
}) {
  const toneClass = tone === "amber" ? "text-amber-600 bg-amber-50" : tone === "rose" ? "text-rose-600 bg-rose-50" : "text-sky-600 bg-sky-50";
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : items.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${tone === "amber" ? "bg-amber-500" : tone === "rose" ? "bg-rose-500" : "bg-sky-500"}`} />
              {it.name}
            </span>
            <ProvenanceBadge source={it.source} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProvenanceBadge({ source }: { source: HealthRecordItem["source"] }) {
  if (source === "provider-confirmed") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] gap-0.5">
        <ShieldCheck className="h-2.5 w-2.5" /> Confirmed
      </Badge>
    );
  }
  if (source === "imported") {
    return (
      <Badge variant="outline" className="text-[9px] gap-0.5">
        <Building2 className="h-2.5 w-2.5" /> Imported
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] gap-0.5">
      <User className="h-2.5 w-2.5" /> Self-reported
    </Badge>
  );
}

function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={FileText} title="No records yet" description="Your clinical timeline will appear here as you consult with providers." />;
  }
  const iconFor = (k: TimelineKind) =>
    k === "consultation" ? Stethoscope :
    k === "prescription" ? Pill :
    k === "laboratory" ? FlaskConical :
    k === "referral" ? ArrowRight :
    k === "order" ? Package : Activity;
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const Icon = iconFor(it.kind);
        return (
          <Card key={it.id} className={it.onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} >
            <CardContent className="p-4 flex items-start gap-3" onClick={it.onClick}>
              <div className="rounded-lg bg-muted p-2 shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{it.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                  </div>
                  <StatusBadge status={it.status} className="text-[10px] shrink-0" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {formatDateTime(it.date)}
                  {it.ref && <span>· {it.ref}</span>}
                </div>
              </div>
              {it.onClick && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
