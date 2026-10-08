"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Building2, Pill, Send, ShieldCheck, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService, publicDiscoveryService } from "@/lib/services";

type Prescription = PrescriptionComponents["schemas"]["Prescription"];
type PharmacySummary = Awaited<
  ReturnType<typeof publicDiscoveryService.pharmacies>
>["data"][number];

export function PatientPrescriptionDetail() {
  const prescriptionId = useNav().view.params.id;
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [pharmacies, setPharmacies] = useState<readonly PharmacySummary[]>([]);
  const [pharmacyId, setPharmacyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!prescriptionId) return;
    setLoading(true);
    setError(null);
    try {
      const [current, available] = await Promise.all([
        productionPrescriptionService.patient.get(prescriptionId),
        publicDiscoveryService.pharmacies({ limit: 50 }),
      ]);
      if (!("appointmentId" in current)) throw new Error("Prescription view is not available");
      setPrescription(current);
      setPharmacies(available.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prescription could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [prescriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendToPharmacy() {
    if (prescription === null || pharmacyId.length === 0) return;
    setBusy(true);
    try {
      const updated = await productionPrescriptionService.patient.send(
        prescription.id,
        pharmacyId,
        prescription.version,
      );
      setPrescription(updated);
      toast.success("Prescription sent to the selected pharmacy");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Prescription could not be sent");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading prescription…" />;
  if (error !== null || prescription === null) {
    return (
      <EmptyState
        title="Prescription unavailable"
        description={error ?? "Prescription was not found"}
        action={<Button onClick={() => navigate("patient", "prescriptions")}>Back</Button>}
      />
    );
  }

  const canRoute = prescription.status === "SIGNED";
  const activeRoute = prescription.routes.find((route) => route.status !== "CANCELLED");

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={prescription.prescriptionNumber}
        description={`Signed ${formatDate(prescription.signedAt)} · valid until ${formatDate(prescription.validUntil)}`}
        actions={<StatusBadge status={prescription.status.toLowerCase()} />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Prescriber" icon={Stethoscope}>
          <p className="font-medium">{prescription.practitioner.displayName}</p>
          <p className="text-sm text-muted-foreground">
            Jurisdiction: {prescription.jurisdictionCode}
          </p>
        </SectionCard>
        <SectionCard title="Pharmacy routing" icon={Building2}>
          {activeRoute ? (
            <div className="space-y-2">
              <p className="font-medium">{activeRoute.pharmacy.displayName}</p>
              <StatusBadge status={activeRoute.status.toLowerCase()} size="sm" />
              <p className="text-xs text-muted-foreground">
                Only this pharmacy can access the dispensing view.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={pharmacyId} onValueChange={setPharmacyId} disabled={!canRoute || busy}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a verified pharmacy" />
                </SelectTrigger>
                <SelectContent>
                  {pharmacies.map((pharmacy) => (
                    <SelectItem key={pharmacy.id} value={pharmacy.id}>
                      {pharmacy.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={sendToPharmacy} disabled={!canRoute || !pharmacyId || busy}>
                <Send className="h-4 w-4" /> Send securely
              </Button>
              {!canRoute && (
                <p className="text-xs text-muted-foreground">
                  This prescription cannot be routed in its current state.
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Medicines (${prescription.items.length})`} icon={Pill} dense>
        <ul className="divide-y">
          {prescription.items.map((item) => (
            <li key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {item.medicationName} {item.strength ?? ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.dose} · {item.frequency}
                    {item.duration ? ` · ${item.duration}` : ""}
                  </p>
                  {item.instructions && <p className="mt-1 text-sm">{item.instructions}</p>}
                </div>
                <span className="text-sm font-medium">
                  {item.quantity} {item.quantityUnit}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        The pharmacy receives a purpose-limited view. Your consultation linkage and private clinical
        note are not disclosed.
      </div>
    </div>
  );
}
