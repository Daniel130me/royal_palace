"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  LaboratoryResultResponse,
  ProviderAppointmentResponse,
  ProviderPatientRosterItem,
} from "@royal-palace/contracts";
import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Activity, Calendar, FileText, FlaskConical, Pill, PlayCircle, User } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { LaboratoryResultCard } from "@/features/shared/laboratory-result-card";
import { formatDate, formatTime, initials } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import {
  encounterService,
  productionClinicalService,
  productionLaboratoryService,
  productionPrescriptionService,
  schedulingPaymentService,
} from "@/lib/services";
import type { ClinicalEncounter } from "@/types";

type Prescription = PrescriptionComponents["schemas"]["Prescription"];
type Tab = "overview" | "records" | "activity";
const ACTIVE_STATUSES = new Set([
  "RESERVED",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
]);

export function ProviderPatientDetail() {
  const patientId = useNav().view.params.id;
  const [patient, setPatient] = useState<ProviderPatientRosterItem | null>(null);
  const [appointments, setAppointments] = useState<readonly ProviderAppointmentResponse[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labResults, setLabResults] = useState<readonly LaboratoryResultResponse[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const [person, appointmentPage, clinicalRecords, prescriptionPage, resultPage] =
        await Promise.all([
          productionClinicalService.provider.getPatient(patientId),
          schedulingPaymentService.providerAppointments({ limit: 50, patientId, scope: "ALL" }),
          encounterService.listProvider(patientId),
          productionPrescriptionService.provider.list(patientId, undefined, 50),
          productionLaboratoryService.provider.results(undefined, 50, patientId),
        ]);
      setPatient(person);
      setAppointments(appointmentPage.data);
      setEncounters(clinicalRecords);
      setPrescriptions([...prescriptionPage.data]);
      setLabResults(resultPage.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Patient record could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => void load(), [load]);

  const nextAppointment = useMemo(
    () =>
      [...appointments]
        .filter(
          (item) =>
            ACTIVE_STATUSES.has(item.status) && new Date(item.endsAt).getTime() >= Date.now(),
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0],
    [appointments],
  );

  async function startEncounter(appointment: ProviderAppointmentResponse) {
    try {
      const encounter = await productionClinicalService.provider.open(appointment.id);
      toast.success("Clinical encounter started.");
      navigate("provider", "encounter", { id: encounter.id });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Encounter could not be started.");
    }
  }

  if (loading) return <LoadingState label="Loading patient record…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!patient) return <ErrorState message="Patient record not found." />;

  return (
    <div>
      <PageHeader
        title={patient.name}
        description={`Relationship-scoped clinical record · ${patient.encounterCount} encounter${patient.encounterCount === 1 ? "" : "s"}`}
        breadcrumbs={[
          { label: "Patients", onClick: () => navigate("provider", "patients") },
          { label: patient.name },
        ]}
        back
        actions={
          nextAppointment ? (
            <Button size="sm" onClick={() => startEncounter(nextAppointment)}>
              <PlayCircle className="mr-1 h-4 w-4" /> Start encounter
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-soft">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {initials(patient.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{patient.name}</p>
          <p className="text-xs text-muted-foreground">
            Last clinical encounter {formatDate(patient.lastEncounterAt)}
          </p>
        </div>
        <Badge variant="outline">Clinical relationship verified</Badge>
      </div>
      <div className="sticky top-14 z-20 mb-4 bg-background/95 pb-3 backdrop-blur-md lg:top-16">
        <SegmentedControl
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          options={[
            { value: "overview", label: "Overview", icon: User },
            { value: "records", label: "Records", icon: FileText },
            { value: "activity", label: "Activity", icon: Activity },
          ]}
        />
      </div>
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Appointments" icon={Calendar}>
            {appointments.length === 0 ? (
              <EmptyState
                title="No appointments"
                description="No linked appointment is available."
              />
            ) : (
              <RecordList>
                {appointments.slice(0, 8).map((item) => (
                  <RecordRow
                    key={item.id}
                    title={`${formatDate(item.startsAt)} · ${formatTime(item.startsAt)}`}
                    detail={`${item.mode.replaceAll("_", " ")} · ${item.status.replaceAll("_", " ")}`}
                    onClick={() => navigate("provider", "appointment", { id: item.id })}
                  />
                ))}
              </RecordList>
            )}
          </SectionCard>
          <SectionCard title="Clinical encounters" icon={FileText}>
            {encounters.length === 0 ? (
              <EmptyState title="No encounters" description="No clinical note is available." />
            ) : (
              <RecordList>
                {encounters.slice(0, 8).map((item) => (
                  <RecordRow
                    key={item.id}
                    title={item.encounterNumber}
                    detail={`${formatDate(item.createdAt)} · ${item.status}`}
                    onClick={() => navigate("provider", "encounter", { id: item.id })}
                  />
                ))}
              </RecordList>
            )}
          </SectionCard>
        </div>
      )}
      {tab === "records" && (
        <div className="space-y-4">
          <SectionCard title="Prescriptions" icon={Pill}>
            {prescriptions.length === 0 ? (
              <EmptyState title="No prescriptions" description="No prescription is available." />
            ) : (
              <RecordList>
                {prescriptions.map((item) => (
                  <RecordRow
                    key={item.id}
                    title={item.prescriptionNumber}
                    detail={`${formatDate(item.createdAt)} · ${item.status}`}
                    onClick={() => navigate("provider", "prescription", { id: item.id })}
                  />
                ))}
              </RecordList>
            )}
          </SectionCard>
          <SectionCard title="Laboratory results" icon={FlaskConical}>
            {labResults.length === 0 ? (
              <EmptyState
                title="No laboratory results"
                description="No published result is available."
              />
            ) : (
              <div className="space-y-3">
                {labResults.map((item) => (
                  <LaboratoryResultCard
                    key={item.id}
                    result={item}
                    showPatient
                    downloadAttachment={(resultId, attachmentId) =>
                      productionLaboratoryService.provider.resultAttachmentDownload(
                        resultId,
                        attachmentId,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
      {tab === "activity" && (
        <SectionCard title="Clinical activity" icon={Activity}>
          {encounters.length === 0 ? (
            <EmptyState title="No activity" description="No clinical activity is available." />
          ) : (
            <RecordList>
              {encounters.map((item) => (
                <RecordRow
                  key={item.id}
                  title={`${item.encounterNumber} · ${item.status}`}
                  detail={formatDate(item.createdAt)}
                  onClick={() => navigate("provider", "encounter", { id: item.id })}
                />
              ))}
            </RecordList>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function RecordList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border/60">{children}</div>;
}
function RecordRow({
  detail,
  onClick,
  title,
}: {
  detail: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button className="w-full px-1 py-3 text-left hover:bg-muted/40" onClick={onClick}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs capitalize text-muted-foreground">{detail}</p>
    </button>
  );
}
