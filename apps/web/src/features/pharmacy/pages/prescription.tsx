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
type CatalogItem = PrescriptionComponents["schemas"]["PharmacyCatalogItem"];
const CATALOG_SEARCH_LIMIT = 25;

export function PharmacyPrescriptionDetail() {
  const { session, view } = useNav();
  const organizationId = session?.profileId;
  const prescriptionId = view.params.id;
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [catalogItems, setCatalogItems] = useState<readonly CatalogItem[]>([]);
  const [catalogQueries, setCatalogQueries] = useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});
  const [searchingItemId, setSearchingItemId] = useState<string | null>(null);
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
      setCatalogQueries(
        Object.fromEntries(current.items.map((item) => [item.id, item.medicationName])),
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prescription could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [organizationId, prescriptionId]);

  async function searchCatalog(prescriptionItemId: string) {
    if (!organizationId) return;
    const query = catalogQueries[prescriptionItemId]?.trim();
    if (!query) {
      toast.error("Enter a medicine name, brand, generic name, or SKU.");
      return;
    }
    setSearchingItemId(prescriptionItemId);
    try {
      const result = await productionPrescriptionService.pharmacy.catalogItems(organizationId, {
        limit: CATALOG_SEARCH_LIMIT,
        q: query,
        status: "ACTIVE",
      });
      setCatalogItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of result.data) byId.set(item.id, item);
        return [...byId.values()];
      });
      if (result.data.length === 0) toast.info("No active catalogue items matched that search.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Catalogue search failed");
    } finally {
      setSearchingItemId(null);
    }
  }

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
    const minutes = Number(validMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1_440) {
      toast.error("Enter a validity from 1 to 1,440 minutes.");
      return;
    }
    const selected = prescription.items.map((item) =>
      catalogItems.find((catalogItem) => catalogItem.id === selectedItems[item.id]),
    );
    if (selected.some((item) => item === undefined)) {
      toast.error("Select an inventory item for every prescription line.");
      return;
    }
    const resolvedItems = selected as CatalogItem[];
    const currencies = new Set(resolvedItems.map((item) => item.currency));
    if (currencies.size !== 1) {
      toast.error("All items in one quote must use the same configured currency.");
      return;
    }
    const lines = prescription.items.map((item, index) => ({
      catalogItemId: resolvedItems[index]!.id,
      prescriptionItemId: item.id,
      quantity: item.balance.remainingQuantity,
      unitPriceMinor: resolvedItems[index]!.unitPriceMinor,
    }));
    setBusy(true);
    try {
      const quote = await productionPrescriptionService.pharmacy.createQuote(
        organizationId,
        prescription.id,
        {
          charges: [],
          currency: resolvedItems[0]!.currency,
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
            <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_18rem] sm:items-center">
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
                  <Label className="text-xs">Inventory item</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={catalogQueries[item.id] ?? ""}
                      onChange={(event) =>
                        setCatalogQueries((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder="Search catalogue"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={searchingItemId !== null}
                      onClick={() => void searchCatalog(item.id)}
                    >
                      {searchingItemId === item.id ? "Searching…" : "Search"}
                    </Button>
                  </div>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedItems[item.id] ?? ""}
                    onChange={(event) =>
                      setSelectedItems((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select matching stock</option>
                    {matchingCatalogItems(catalogItems, item).map((catalogItem) => (
                      <option key={catalogItem.id} value={catalogItem.id}>
                        {catalogItem.name} · {catalogItem.availableQuantity} available ·{" "}
                        {catalogItem.currency} {catalogItem.unitPriceMinor} minor units
                      </option>
                    ))}
                  </select>
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

function matchingCatalogItems(
  catalogItems: readonly CatalogItem[],
  prescriptionItem: Prescription["items"][number],
): readonly CatalogItem[] {
  return catalogItems.filter((catalogItem) => {
    if (prescriptionItem.medicationCode !== null) {
      return (
        catalogItem.medicationCode === prescriptionItem.medicationCode &&
        catalogItem.medicationCodeSystem === prescriptionItem.medicationCodeSystem
      );
    }
    const expectedName = normalizeMedicationText(prescriptionItem.medicationName);
    const names = [catalogItem.name, catalogItem.genericName, catalogItem.brandName]
      .filter((value): value is string => value !== null)
      .map(normalizeMedicationText);
    return (
      names.includes(expectedName) &&
      normalizeMedicationText(catalogItem.strength ?? "") ===
        normalizeMedicationText(prescriptionItem.strength ?? "")
    );
  });
}

function normalizeMedicationText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}
