"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Pill, Receipt, ShieldCheck, User } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type Prescription = PrescriptionComponents["schemas"]["PharmacyPrescription"];

export function PharmacyPrescriptionDetail() {
  const { session, view } = useNav();
  const organizationId = session?.profileId;
  const prescriptionId = view.params.id;
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("");
  const [validMinutes, setValidMinutes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!prescriptionId) return;
    setLoading(true);
    try {
      const current = await productionPrescriptionService.pharmacy.prescription(prescriptionId);
      if ("appointmentId" in current) throw new Error("Pharmacy-minimized view was not applied");
      setPrescription(current);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prescription could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [prescriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acceptPrescription() {
    if (!organizationId || prescription === null) return;
    setBusy(true);
    try {
      setPrescription(
        await productionPrescriptionService.pharmacy.acceptPrescription(
          organizationId,
          prescription.id,
          prescription.version,
        ),
      );
      toast.success("Prescription accepted for review");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Prescription could not be accepted");
    } finally {
      setBusy(false);
    }
  }

  async function createQuote() {
    if (!organizationId || prescription === null) return;
    const normalizedCurrency = currency.trim().toUpperCase();
    const minutes = Number(validMinutes);
    if (
      !/^[A-Z]{3}$/.test(normalizedCurrency) ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1_440
    ) {
      toast.error("Enter a three-letter currency and a validity from 1 to 1,440 minutes.");
      return;
    }
    const lines = prescription.items.map((item) => ({
      prescriptionItemId: item.id,
      quantity: item.balance.remainingQuantity,
      unitPriceMinor: prices[item.id] ?? "",
    }));
    if (lines.some((line) => !/^\d{1,16}$/.test(line.unitPriceMinor))) {
      toast.error("Enter each unit price as a whole number of currency minor units.");
      return;
    }
    setBusy(true);
    try {
      const quote = await productionPrescriptionService.pharmacy.createQuote(
        organizationId,
        prescription.id,
        {
          charges: [],
          currency: normalizedCurrency,
          expectedPrescriptionVersion: prescription.version,
          fillNumber: 0,
          lines,
          validForSeconds: minutes * 60,
        },
        crypto.randomUUID(),
      );
      toast.success(`Quote ${quote.quoteNumber} sent to the patient`);
      navigate("pharmacy", "prescriptions");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Quote could not be created");
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
      />
    );
  }

  const canQuote = ["ACCEPTED", "PARTIALLY_DISPENSED"].includes(prescription.status);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={prescription.prescriptionNumber}
        description={`Valid until ${formatDate(prescription.validUntil)}`}
        actions={<StatusBadge status={prescription.status.toLowerCase()} />}
      />
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 flex gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" /> Consultation linkage and the
        practitioner&apos;s private clinical note are intentionally hidden.
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Patient" icon={User}>
          <p className="font-medium">{prescription.patient.displayName}</p>
        </SectionCard>
        <SectionCard title="Prescriber" icon={ShieldCheck}>
          <p className="font-medium">{prescription.practitioner.displayName}</p>
          <p className="text-sm text-muted-foreground">
            Jurisdiction: {prescription.jurisdictionCode}
          </p>
        </SectionCard>
      </div>
      <SectionCard title={`Medicines (${prescription.items.length})`} icon={Pill} dense>
        <ul className="divide-y">
          {prescription.items.map((item) => (
            <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_13rem] sm:items-center">
              <div>
                <p className="font-medium">
                  {item.medicationName} {item.strength ?? ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Remaining {item.balance.remainingQuantity} {item.quantityUnit} · {item.dose} ·{" "}
                  {item.frequency}
                </p>
              </div>
              {canQuote && (
                <div>
                  <Label className="text-xs">Unit price, minor units</Label>
                  <Input
                    inputMode="numeric"
                    value={prices[item.id] ?? ""}
                    onChange={(event) =>
                      setPrices((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
      {prescription.status === "SENT" ? (
        <Button onClick={acceptPrescription} disabled={busy || !organizationId}>
          Accept prescription
        </Button>
      ) : canQuote ? (
        <SectionCard title="Create immutable quote" icon={Receipt}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>ISO 4217 currency</Label>
              <Input
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                placeholder="Currency code"
              />
            </div>
            <div>
              <Label>Quote validity, minutes</Label>
              <Input
                inputMode="numeric"
                value={validMinutes}
                onChange={(event) => setValidMinutes(event.target.value)}
                placeholder="1–1440"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Taxes and fees are not guessed by the browser. This quote contains no additional charges
            unless an approved pricing policy supplies them.
          </p>
          <Button className="mt-4" onClick={createQuote} disabled={busy || !organizationId}>
            Send quote to patient
          </Button>
        </SectionCard>
      ) : null}
    </div>
  );
}
