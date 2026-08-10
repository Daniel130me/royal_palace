"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { providerService, applicationService, adminService } from "@/lib/services";
import type { Provider, ProviderApplication } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/healthcare/page-header";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  ArrowLeft, Stethoscope, GraduationCap, IdCard, Banknote, FileText,
  BadgeCheck, ShieldCheck, ShieldAlert, Ban, RefreshCw, MessageSquareWarning, X,
  Star, MapPin, Languages, Clock, FileCheck2,
} from "lucide-react";

const ADMIN_ACTOR_ID = "ADM-001";

type VerifyAction = "approve" | "reject" | "request_info" | "suspend" | "reactivate";

const ACTION_META: Record<VerifyAction, { label: string; tone: "success" | "danger" | "warning" | "info"; needsNotes: boolean; description: string }> = {
  approve: { label: "Approve", tone: "success", needsNotes: false, description: "Approve this provider and publish them on the platform. They will be visible to patients immediately." },
  reject: { label: "Reject", tone: "danger", needsNotes: true, description: "Reject this application. The provider will not be listed." },
  request_info: { label: "Request Info", tone: "warning", needsNotes: true, description: "Request additional information from the provider. They will be notified." },
  suspend: { label: "Suspend", tone: "danger", needsNotes: true, description: "Suspend this provider. They will be hidden from search and unable to take appointments." },
  reactivate: { label: "Reactivate", tone: "info", needsNotes: false, description: "Reactivate this provider. They will return to approved status." },
};

function DetailRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium">
      <FileText className="h-3 w-3 text-muted-foreground" /> {label}
    </span>
  );
}

export function AdminProviderDetail() {
  const { view } = useNav();
  const providerId = view.params.id ?? "";
  const [provider, setProvider] = useState<Provider | null>(null);
  const [application, setApplication] = useState<ProviderApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<VerifyAction | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!providerId) { setError("Missing provider id."); return; }
    setLoading(true);
    setError(null);
    Promise.all([
      providerService.get(providerId),
      applicationService.list().then((apps) => apps.find((a) => a.providerId === providerId) ?? null),
    ])
      .then(([p, app]) => { setProvider(p); setApplication(app ?? null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load provider"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [providerId]);

  const history = useMemo(() => application?.history ?? [], [application]);

  const handleAction = (action: VerifyAction) => {
    setPendingAction(action);
    if (ACTION_META[action].needsNotes) {
      setNotes("");
      setNotesOpen(true);
    } else {
      setConfirmOpen(true);
    }
  };

  const confirmSubmit = async () => {
    if (!pendingAction || !provider) return;
    setSubmitting(true);
    try {
      await adminService.verifyProvider(provider.id, pendingAction, notes.trim() || undefined, ADMIN_ACTOR_ID);
      toast.success(`Provider ${ACTION_META[pendingAction].label.toLowerCase()} successful.`);
      setNotesOpen(false);
      setConfirmOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading provider…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!provider) return <EmptyState icon={Stethoscope} title="Provider not found" description="The provider you are looking for does not exist." action={<Button onClick={() => navigate("admin", "providers")}>Back to providers</Button>} />;

  const status = provider.verificationStatus;

  return (
    <div>
      <PageHeader
        title={`${provider.title} ${provider.firstName} ${provider.lastName}`}
        description={`${provider.specialty} · ${provider.providerNumber}`}
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Providers", onClick: () => navigate("admin", "providers") },
          { label: `${provider.firstName} ${provider.lastName}` },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate("admin", "providers")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal & contact */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><Stethoscope className="h-4 w-4" /> Personal &amp; contact</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-x-6">
              <DetailRow label="Full name" value={`${provider.title} ${provider.firstName} ${provider.lastName}`} />
              <DetailRow label="Provider number" value={provider.providerNumber} />
              <DetailRow label="Professional title" value={provider.professionalTitle} />
              <DetailRow label="Years of experience" value={`${provider.yearsExperience} years`} />
              <DetailRow label="City / State" value={`${provider.city}, ${provider.state}`} icon={MapPin} />
              <DetailRow label="Languages" value={provider.languages.join(", ")} icon={Languages} />
              <DetailRow label="Rating" value={<span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" /> {provider.rating.toFixed(1)} ({provider.reviewCount} reviews)</span>} />
              <DetailRow label="Consultation modes" value={provider.consultationModes.join(", ")} />
            </CardContent>
          </Card>

          {/* Professional */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><GraduationCap className="h-4 w-4" /> Professional details</CardTitle></CardHeader>
            <CardContent>
              <DetailRow label="Specialty" value={provider.specialty} icon={Stethoscope} />
              <DetailRow label="Consultation fee" value={`₦${provider.consultationFee.toLocaleString("en-NG")}`} icon={Banknote} />
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">Qualifications</p>
                <div className="flex flex-wrap gap-2">
                  {provider.qualifications.map((q, i) => <Chip key={i} label={q} />)}
                </div>
              </div>
              {provider.biography && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">Biography</p>
                  <p className="text-sm leading-relaxed">{provider.biography}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registration & licence */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><IdCard className="h-4 w-4" /> Registration &amp; practising licence</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-x-6">
              <DetailRow label="MDCN registration number" value={provider.registrationNumber} icon={FileCheck2} />
              <DetailRow label="Practising licence number" value={provider.licenceNumber} icon={FileCheck2} />
              <DetailRow label="Licence expiry" value={formatDate(provider.licenceExpiry)} icon={Clock} />
              <DetailRow label="Verification status" value={<StatusBadge status={provider.verificationStatus} />} />
            </CardContent>
          </Card>

          {/* Government ID & bank details (mock) */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><IdCard className="h-4 w-4" /> Government ID &amp; bank details</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Government-issued ID</p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="NIN — 12345678901" />
                  <Chip label="Drivers Licence — LR2026" />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Bank account (payout)</p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="Bank — Access Bank" />
                  <Chip label="Acct — 0123456789" />
                  <Chip label="Name — Tunde Adeyemi" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Supporting documents from application */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><FileText className="h-4 w-4" /> Supporting documents</CardTitle></CardHeader>
            <CardContent>
              {application && application.documents.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-2">
                  {application.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="rounded-md bg-muted p-2 shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{(doc.size / 1024).toFixed(0)} KB · {doc.type}</p>
                      </div>
                      <Button variant="ghost" size="sm">View</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No documents submitted with the application.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — verification actions + history */}
        <div className="space-y-6">
          {/* Verification actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Verification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Current status</span>
                <StatusBadge status={status} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {status === "submitted" || status === "under_review" ? (
                  <>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 col-span-2" onClick={() => handleAction("approve")}>
                      <BadgeCheck className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => handleAction("request_info")}>
                      <MessageSquareWarning className="h-4 w-4 mr-1" /> Request Info
                    </Button>
                    <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50" onClick={() => handleAction("reject")}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </>
                ) : null}
                {status === "approved" ? (
                  <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50 col-span-2" onClick={() => handleAction("suspend")}>
                    <Ban className="h-4 w-4 mr-1" /> Suspend provider
                  </Button>
                ) : null}
                {status === "suspended" || status === "rejected" ? (
                  <Button variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 col-span-2" onClick={() => handleAction("reactivate")}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Reactivate
                  </Button>
                ) : null}
                {status === "additional_information_requested" ? (
                  <>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 col-span-2" onClick={() => handleAction("approve")}>
                      <BadgeCheck className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50 col-span-2" onClick={() => handleAction("reject")}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                All actions are recorded in the audit trail. Provider will be notified of the outcome.
              </p>
            </CardContent>
          </Card>

          {/* Verification history */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><Clock className="h-4 w-4" /> Verification history</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No history recorded.</p>
              ) : history.map((h, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5" />
                    {i < history.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={h.status} />
                      <span className="text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
                    </div>
                    <p className="text-sm mt-1">{h.note}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">By {h.by}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notes dialog (for actions that need a note) */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction ? ACTION_META[pendingAction].label : ""} provider</DialogTitle>
            <DialogDescription>
              {pendingAction ? ACTION_META[pendingAction].description : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes / reason <span className="text-rose-500">*</span></Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Provide a reason or note that will be visible to the provider and in the audit trail."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesOpen(false)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={() => { setNotesOpen(false); setConfirmOpen(true); }}
              disabled={!notes.trim() || submitting}
              className={pendingAction && ACTION_META[pendingAction].tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : pendingAction && ACTION_META[pendingAction].tone === "success" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm: {pendingAction ? ACTION_META[pendingAction].label : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction ? ACTION_META[pendingAction].description : ""}
              {notes.trim() && (
                <span className="block mt-2 text-xs">Note: <span className="italic">&ldquo;{notes.trim()}&rdquo;</span></span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmSubmit(); }}
              disabled={submitting}
              className={pendingAction && ACTION_META[pendingAction].tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : pendingAction && ACTION_META[pendingAction].tone === "success" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {submitting ? "Saving…" : `Confirm ${pendingAction ? ACTION_META[pendingAction].label.toLowerCase() : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
