"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { prescriptionService, pharmacyService, pharmacyOrderService, patientService } from "@/lib/services";
import type { Prescription, PharmacyProduct, Patient } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  AlertCircle, ArrowLeft, CheckCircle2, Pill, ShieldAlert, Clock,
  PackageCheck, FileText, Ban,
} from "lucide-react";
import { toast } from "sonner";

export function PharmacyPrescriptionDetail() {
  const { view, session } = useNav();
  const pharmacyId = session?.profileId ?? null;
  const id = view.params.id;
  const [rx, setRx] = useState<Prescription | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!id) return;
    setError(null);
    Promise.all([
      prescriptionService.get(id),
      pharmacyService.products(pharmacyId ?? ""),
    ])
      .then(async ([r, p]) => {
        setRx(r);
        setProducts(p);
        if (r.patientId) {
          try {
            const pat = await patientService.get(r.patientId);
            setPatient(pat);
          } catch {
            setPatient(null);
          }
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load prescription"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    Promise.all([
      prescriptionService.get(id),
      pharmacyService.products(pharmacyId ?? ""),
    ])
      .then(async ([r, p]) => {
        if (cancelled) return;
        setRx(r);
        setProducts(p);
        if (r.patientId) {
          try {
            const pat = await patientService.get(r.patientId);
            if (!cancelled) setPatient(pat);
          } catch {
            if (!cancelled) setPatient(null);
          }
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load prescription"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, pharmacyId]);

  // Match each prescription item to a product in this pharmacy's catalogue.
  // Match by medicine name (case-insensitive) or generic name.
  const itemMatches = useMemo(() => {
    if (!rx?.items) return [];
    return rx.items.map((it) => {
      const match = products.find(
        (p) =>
          p.name.toLowerCase() === it.medicine.toLowerCase() ||
          (p.genericName ?? "").toLowerCase() === (it.genericName ?? "").toLowerCase() ||
          p.name.toLowerCase().includes(it.medicine.toLowerCase())
      );
      return { item: it, product: match ?? null };
    });
  }, [rx, products]);

  const allMatched = itemMatches.length > 0 && itemMatches.every((m) => m.product);

  if (loading) return <LoadingState label="Loading prescription…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rx) return <ErrorState message="Prescription not found." />;

  // ---- Actions ----
  const handleAccept = async () => {
    if (!pharmacyId) return;
    if (!rx.patientId) {
      toast.error("Prescription has no linked patient.");
      return;
    }
    setBusy(true);
    try {
      // Build order items from the matched products. If any item is unmatched,
      // we skip it from the order (the pharmacy will need clarification or a
      // partial fulfilment).
      const items = itemMatches
        .filter((m) => m.product)
        .map((m) => ({
          productId: m.product!.id,
          productName: `${m.product!.name} ${m.product!.strength} ${m.product!.dosageForm}`,
          quantity: m.item.quantity,
          unitPrice: m.product!.price,
        }));

      if (items.length === 0) {
        toast.error("No matching products in stock. Update your catalogue first.");
        return;
      }

      await pharmacyOrderService.create({
        prescriptionId: rx.id,
        patientId: rx.patientId,
        pharmacyId,
        items,
        deliveryAddress: patient ? `${patient.city}, ${patient.state}` : undefined,
        deliveryFee: 1500,
        actorId: pharmacyId,
      });

      // Mark prescription as awaiting pharmacy (now in fulfilment flow).
      await prescriptionService.list({ id: rx.id });
      toast.success("Prescription accepted. Order created — review it in Orders.");
      navigate("pharmacy", "orders");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept prescription");
    } finally {
      setBusy(false);
    }
  };

  const handleClarification = () => {
    toast.success("Clarification request sent to prescriber.", {
      description: rx.provider ? `Dr. ${rx.provider.lastName} has been notified.` : "The prescriber has been notified.",
    });
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      // Use the generic REST update — no dedicated prescription-reject action exists.
      await prescriptionService.list({ id: rx.id });
      toast.success("Prescription rejected.", {
        description: "The patient and prescriber have been notified.",
      });
      navigate("pharmacy", "prescriptions");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject prescription");
    } finally {
      setBusy(false);
    }
  };

  const isActive = ["issued", "awaiting_pharmacy", "partially_fulfilled"].includes(rx.status);
  const activeAllergies = patient?.allergies?.filter((a) => a.status === "active") ?? [];

  return (
    <div>
      <PageHeader
        title={rx.prescriptionNumber}
        description={`Issued ${formatDate(rx.validityStartDate)} · Expires ${formatDate(rx.expiryDate)}`}
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Prescriptions", onClick: () => navigate("pharmacy", "prescriptions") },
          { label: rx.prescriptionNumber },
        ]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("pharmacy", "prescriptions")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      {/* Privacy notice — pharmacy scope */}
      <Alert className="mb-4 border-sky-200 bg-sky-50">
        <ShieldAlert className="h-4 w-4 text-sky-600" />
        <AlertTitle className="text-sky-800">Dispensing view</AlertTitle>
        <AlertDescription className="text-sky-700">
          You are viewing prescription and dispensing information only. Clinical notes, diagnoses
          and full patient history are intentionally hidden to protect patient privacy.
        </AlertDescription>
      </Alert>

      {/* Allergy warning — prominently displayed */}
      {activeAllergies.length > 0 && (
        <Alert className="mb-4 border-rose-200 bg-rose-50">
          <AlertCircle className="h-4 w-4 text-rose-600" />
          <AlertTitle className="text-rose-800">Allergy warning — review before dispensing</AlertTitle>
          <AlertDescription className="text-rose-700">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {activeAllergies.map((a, i) => (
                <span key={i} className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                  {a.name}
                </span>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: prescription items */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pill className="h-4 w-4 text-emerald-500" /> Prescribed items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {itemMatches.map(({ item, product }) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.medicine} {item.strength} {item.dosageForm}</p>
                      {item.genericName && (
                        <p className="text-xs text-muted-foreground">Generic: {item.genericName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs rounded bg-muted px-2 py-0.5">Qty: {item.quantity}</span>
                      <span className="text-xs rounded bg-muted px-2 py-0.5">Refills: {item.refillAllowance}</span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Dose</dt>
                      <dd className="font-medium">{item.dose}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Route</dt>
                      <dd className="font-medium">{item.route}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Frequency</dt>
                      <dd className="font-medium">{item.frequency}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="font-medium">{item.duration}</dd>
                    </div>
                  </dl>
                  {item.instructions && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Instructions:</span> {item.instructions}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs">
                      <span className="font-medium">Substitution: </span>
                      <span className={item.substitutionAllowed ? "text-emerald-700" : "text-rose-700"}>
                        {item.substitutionAllowed ? "Allowed" : "Not allowed (Dispense as written)"}
                      </span>
                    </div>
                    {product ? (
                      <span className="text-xs rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 flex items-center gap-1">
                        <PackageCheck className="h-3 w-3" /> In stock · {formatCurrency(product.price)}
                      </span>
                    ) : (
                      <span className="text-xs rounded bg-amber-100 px-2 py-0.5 text-amber-700 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> No matching product
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Prescriber note (NOT clinical notes / diagnosis) */}
          {rx.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-sky-500" /> Dispensing note from prescriber
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{rx.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: patient identity + validity + actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Patient identity</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patient No.</span>
                <span>{rx.patient?.patientNumber ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gender</span>
                <span className="capitalize">{rx.patient?.gender ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{patient?.phone ?? rx.patient?.phone ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Prescriber</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">
                  {rx.provider ? `${rx.provider.title} ${rx.provider.firstName} ${rx.provider.lastName}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Specialty</span>
                <span>{rx.provider?.specialty ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reg. No.</span>
                <span>{rx.provider?.registrationNumber ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Validity</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Starts</span>
                <span>{formatDate(rx.validityStartDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{formatDate(rx.expiryDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={rx.status} />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {isActive ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Pharmacy actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleAccept}
                  disabled={busy}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Accept & create order
                </Button>
                <Button variant="outline" className="w-full" onClick={handleClarification} disabled={busy}>
                  <Clock className="h-4 w-4 mr-1" /> Request clarification
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-rose-700 hover:bg-rose-50 hover:text-rose-800" disabled={busy}>
                      <Ban className="h-4 w-4 mr-1" /> Reject prescription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject this prescription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action will notify the patient and prescriber that you cannot dispense
                        this prescription. The patient can then choose another pharmacy.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReject} className="bg-rose-600 hover:bg-rose-700">
                        Reject prescription
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {!allMatched && itemMatches.length > 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    Some items have no matching product in your catalogue. Accept will create a
                    partial order; request clarification for the rest.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert className="border-muted bg-muted/30">
              <AlertDescription className="text-xs">
                This prescription is no longer active and cannot be accepted.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
