"use client";

import type { PrescriptionComponents } from "@royal-palace/api-client";
import { Download, FileCheck2, PackageSearch, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatDateTime, formatMinorCurrency } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { productionPrescriptionService } from "@/lib/services";

type ScannedPrescription = PrescriptionComponents["schemas"]["PharmacyScannedPrescriptionDetail"];
type CatalogItem = PrescriptionComponents["schemas"]["PharmacyCatalogItem"];
type ReviewAction = "start-review" | "request-information" | "approve" | "reject";

const CATALOG_SEARCH_LIMIT = 25;

export function PharmacyScannedPrescriptionDetail() {
  const { session, view } = useNav();
  const organizationId = session?.profileId;
  const prescriptionId = view.params.id;
  const [prescription, setPrescription] = useState<ScannedPrescription | null>(null);
  const [catalogItems, setCatalogItems] = useState<readonly CatalogItem[]>([]);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [validMinutes, setValidMinutes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => catalogItems.filter((item) => (selectedQuantities[item.id] ?? 0) > 0),
    [catalogItems, selectedQuantities],
  );

  const load = useCallback(async () => {
    if (!organizationId || !prescriptionId) return;
    setLoading(true);
    try {
      setPrescription(
        await productionPrescriptionService.pharmacy.scannedPrescription(
          organizationId,
          prescriptionId,
        ),
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prescription could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [organizationId, prescriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadDocument() {
    if (!organizationId || !prescriptionId) return;
    setBusy(true);
    try {
      const download = await productionPrescriptionService.pharmacy.downloadScannedPrescription(
        organizationId,
        prescriptionId,
      );
      window.location.assign(download.url);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Document could not be opened");
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: ReviewAction) {
    if (!organizationId || !prescription) return;
    if (["request-information", "reject"].includes(action) && note.trim().length < 2) {
      toast.error("Enter a clear patient-visible explanation.");
      return;
    }
    setBusy(true);
    try {
      const updated = await productionPrescriptionService.pharmacy.transitionScannedPrescription(
        organizationId,
        prescription.id,
        action,
        { expectedVersion: prescription.version, patientVisibleNote: note.trim() || null },
      );
      setPrescription(updated);
      setNote("");
      toast.success("Review status updated");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Review could not be updated");
    } finally {
      setBusy(false);
    }
  }

  async function searchCatalog() {
    if (!organizationId || query.trim().length < 2) {
      toast.error("Enter at least two characters to search inventory.");
      return;
    }
    setBusy(true);
    try {
      const page = await productionPrescriptionService.pharmacy.catalogItems(organizationId, {
        limit: CATALOG_SEARCH_LIMIT,
        q: query.trim(),
        status: "ACTIVE",
      });
      setCatalogItems(page.data);
      if (page.data.length === 0) toast.info("No active catalogue items matched that search.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Inventory search failed");
    } finally {
      setBusy(false);
    }
  }

  async function createQuote() {
    if (!organizationId || !prescription) return;
    const minutes = Number(validMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1_440) {
      toast.error("Enter a validity from 1 to 1,440 minutes.");
      return;
    }
    if (selectedItems.length === 0) {
      toast.error("Select at least one inventory item.");
      return;
    }
    setBusy(true);
    try {
      const quote = await productionPrescriptionService.pharmacy.createScannedPrescriptionQuote(
        organizationId,
        prescription.id,
        {
          lines: selectedItems.map((item) => ({
            catalogItemId: item.id,
            quantity: selectedQuantities[item.id]!,
          })),
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

  if (loading) return <LoadingState label="Loading uploaded prescription…" />;
  if (error !== null || prescription === null) {
    return <EmptyState title="Prescription unavailable" description={error ?? "Not found"} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={prescription.uploadNumber}
        description={`${prescription.patient.displayName} · received ${formatDateTime(prescription.createdAt)}`}
        actions={<StatusBadge status={prescription.status.toLowerCase()} />}
      />
      <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        This view contains only the information required to review the assigned document. Patient
        clinical records are not available here.
      </div>
      <SectionCard title="Uploaded document" icon={FileCheck2}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">File</dt>
            <dd>{prescription.originalFilename}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prescriber</dt>
            <dd>{prescription.prescriberName ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Facility</dt>
            <dd>{prescription.prescriberFacility ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Patient note</dt>
            <dd>{prescription.patientNote ?? "None"}</dd>
          </div>
        </dl>
        <Button className="mt-4" variant="outline" onClick={downloadDocument} disabled={busy}>
          <Download className="mr-2 h-4 w-4" /> Open clean document
        </Button>
      </SectionCard>
      {prescription.status === "CLEAN" || prescription.status === "MORE_INFORMATION_REQUIRED" ? (
        <Button onClick={() => void transition("start-review")} disabled={busy}>
          Start review
        </Button>
      ) : prescription.status === "UNDER_REVIEW" ? (
        <SectionCard title="Review decision" icon={ShieldCheck}>
          <Label htmlFor="review-note">Patient-visible explanation</Label>
          <Input
            id="review-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void transition("approve")} disabled={busy}>
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => void transition("request-information")}
              disabled={busy}
            >
              Request information
            </Button>
            <Button variant="destructive" onClick={() => void transition("reject")} disabled={busy}>
              Reject
            </Button>
          </div>
        </SectionCard>
      ) : null}
      {prescription.status === "APPROVED" ? (
        <SectionCard title="Prepare quote from controlled inventory" icon={PackageSearch}>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Medicine, brand, generic name, or SKU"
            />
            <Button variant="outline" onClick={searchCatalog} disabled={busy}>
              Search
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {catalogItems.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_7rem] sm:items-center"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.availableQuantity} available ·{" "}
                    {formatMinorCurrency(item.unitPriceMinor, item.currency)} each
                  </p>
                </div>
                <Input
                  aria-label={`Quantity for ${item.name}`}
                  inputMode="numeric"
                  min={0}
                  max={999}
                  type="number"
                  value={selectedQuantities[item.id] ?? 0}
                  onChange={(event) =>
                    setSelectedQuantities((current) => ({
                      ...current,
                      [item.id]: Math.max(0, Math.min(999, Number(event.target.value) || 0)),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 max-w-xs">
            <Label htmlFor="quote-validity">Quote validity, minutes</Label>
            <Input
              id="quote-validity"
              inputMode="numeric"
              value={validMinutes}
              onChange={(event) => setValidMinutes(event.target.value)}
              placeholder="1–1440"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Prices and stock are revalidated by the server. Controlled medicines cannot be quoted
            through this uploaded-document workflow.
          </p>
          <Button className="mt-4" onClick={createQuote} disabled={busy}>
            Send quote to patient
          </Button>
        </SectionCard>
      ) : null}
    </div>
  );
}
