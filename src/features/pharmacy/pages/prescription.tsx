"use client";

import { useEffect, useMemo, useState } from "react";
import { useNav, navigate } from "@/lib/nav";
import { prescriptionService, pharmacyService, pharmacyOrderService, patientService } from "@/lib/services";
import type { Prescription, PharmacyProduct, Patient } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { formatCurrency, formatDate, initials } from "@/lib/format";
import {
  AlertCircle, CheckCircle2, Pill, ShieldAlert, Clock,
  PackageCheck, FileText, Ban, User, Stethoscope, CalendarClock,
  Pill as PillIcon,
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

  const handleAccept = async () => {
    if (!pharmacyId) return;
    if (!rx.patientId) {
      toast.error("Prescription has no linked patient.");
      return;
    }
    setBusy(true);
    try {
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
      await prescriptionService.list({ id: rx.id });
      toast.success("Prescription rejected.", { description: "The patient and prescriber have been notified." });
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
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={rx.prescriptionNumber}
        description={`Issued ${formatDate(rx.validityStartDate)} · Expires ${formatDate(rx.expiryDate)}`}
        back
      />

      {/* Allergy warning — prominent rose banner */}
      {activeAllergies.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-100 p-2 shrink-0">
              <AlertCircle className="h-5 w-5 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-rose-900 uppercase tracking-wide">
                Allergy warning — review before dispensing
              </p>
              <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                This patient has {activeAllergies.length} active allerg{activeAllergies.length === 1 ? "y" : "ies"}. Cross-check each prescribed item before dispensing.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activeAllergies.map((a, i) => (
                  <span key={i} className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy notice */}
      <Alert className="mb-4 border-sky-200 bg-sky-50">
        <ShieldAlert className="h-4 w-4 text-sky-600" />
        <AlertTitle className="text-sky-800">Dispensing view</AlertTitle>
        <AlertDescription className="text-sky-700">
          You are viewing prescription and dispensing information only. Clinical notes, diagnoses
          and full patient history are intentionally hidden to protect patient privacy.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Items + prescriber note */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Prescribed items"
            icon={Pill}
            description={`${itemMatches.length} medicine(s)`}
          >
            <ul className="space-y-3">
              {itemMatches.map(({ item, product }) => (
                <li key={item.id} className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{item.medicine} {item.strength} {item.dosageForm}</p>
                      {item.genericName && (
                        <p className="text-xs text-muted-foreground mt-0.5">Generic: {item.genericName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      <Badge variant="outline" className="text-[10px] h-5 bg-primary/5">Qty: {item.quantity}</Badge>
                      <Badge variant="outline" className="text-[10px] h-5 bg-primary/5">Refills: {item.refillAllowance}</Badge>
                    </div>
                  </div>

                  {/* Dosage chips */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.dose && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-0.5 border-emerald-200 bg-emerald-50 text-emerald-700">
                        <PillIcon className="h-2.5 w-2.5" /> Dose: {item.dose}
                      </Badge>
                    )}
                    {item.route && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-0.5 border-sky-200 bg-sky-50 text-sky-700">
                        Route: {item.route}
                      </Badge>
                    )}
                    {item.frequency && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-0.5 border-violet-200 bg-violet-50 text-violet-700">
                        <Clock className="h-2.5 w-2.5" /> {item.frequency}
                      </Badge>
                    )}
                    {item.duration && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-0.5 border-amber-200 bg-amber-50 text-amber-700">
                        <CalendarClock className="h-2.5 w-2.5" /> {item.duration}
                      </Badge>
                    )}
                  </div>

                  {item.instructions && (
                    <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                      <span className="font-medium">Instructions:</span> {item.instructions}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs">
                      <span className="font-medium">Substitution: </span>
                      <span className={item.substitutionAllowed ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>
                        {item.substitutionAllowed ? "Allowed" : "Not allowed (Dispense as written)"}
                      </span>
                    </div>
                    {product ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1">
                        <PackageCheck className="h-3 w-3" /> In stock · {formatCurrency(product.price)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 gap-1">
                        <AlertCircle className="h-3 w-3" /> No matching product
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          {rx.notes && (
            <SectionCard title="Dispensing note from prescriber" icon={FileText}>
              <p className="text-sm leading-relaxed">{rx.notes}</p>
            </SectionCard>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <SectionCard title="Patient identity" icon={User}>
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {rx.patient ? initials(`${rx.patient.firstName} ${rx.patient.lastName}`) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate">{rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : "—"}</p>
                <p className="text-xs text-muted-foreground">{rx.patient?.patientNumber ?? "—"}</p>
              </div>
            </div>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Gender</dt>
                <dd className="capitalize text-right">{rx.patient?.gender ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="text-right">{patient?.phone ?? rx.patient?.phone ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Prescriber" icon={Stethoscope}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium text-right">
                  {rx.provider ? `${rx.provider.title} ${rx.provider.firstName} ${rx.provider.lastName}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Specialty</dt>
                <dd className="text-right">{rx.provider?.specialty ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Reg. No.</dt>
                <dd className="text-right font-mono text-xs">{rx.provider?.registrationNumber ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Validity" icon={CalendarClock}>
            <dl className="text-sm space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Starts</dt>
                <dd>{formatDate(rx.validityStartDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Expires</dt>
                <dd className="font-medium">{formatDate(rx.expiryDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <StatusBadge status={rx.status} size="sm" />
              </div>
            </dl>
          </SectionCard>

          {/* Desktop actions */}
          {isActive ? (
            <Card className="hidden lg:block">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold mb-1">Pharmacy actions</p>
                <Button className="w-full" onClick={handleAccept} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Accept & create order
                </Button>
                <Button variant="outline" className="w-full" onClick={handleClarification} disabled={busy}>
                  <Clock className="h-4 w-4" /> Request clarification
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-rose-700 hover:bg-rose-50 hover:text-rose-800" disabled={busy}>
                      <Ban className="h-4 w-4" /> Reject prescription
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
                      <AlertDialogAction onClick={handleReject} className="bg-destructive hover:bg-destructive/90">
                        Reject prescription
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {!allMatched && itemMatches.length > 0 && (
                  <p className="text-xs text-amber-700 pt-1 leading-relaxed">
                    Some items have no matching product. Accept will create a partial order.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert className="hidden lg:flex border-muted bg-muted/30">
              <AlertDescription className="text-xs">
                This prescription is no longer active and cannot be accepted.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Mobile bottom action bar */}
      {isActive && (
        <BottomActionBar>
          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={handleAccept} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" /> Accept
            </Button>
            <Button variant="outline" size="icon" onClick={handleClarification} disabled={busy} aria-label="Request clarification">
              <Clock className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" disabled={busy} aria-label="Reject">
                  <Ban className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject this prescription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will notify the patient and prescriber that you cannot dispense this prescription.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReject} className="bg-destructive hover:bg-destructive/90">
                    Reject prescription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </BottomActionBar>
      )}
    </div>
  );
}
