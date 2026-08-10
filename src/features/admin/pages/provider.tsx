"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate, useNav } from "@/lib/nav";
import { providerService, applicationService, adminService } from "@/lib/services";
import type { Provider, ProviderApplication } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import {
  Stethoscope, GraduationCap, IdCard, Banknote, FileText,
  BadgeCheck, ShieldCheck, Ban, RefreshCw, MessageSquareWarning, X,
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
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium break-words">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1 text-xs font-medium">
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 bg-muted/40 animate-pulse rounded-2xl" />
          <div className="h-64 bg-muted/40 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!provider) return <EmptyState icon={Stethoscope} title="Provider not found" description="The provider you are looking for does not exist." action={<Button onClick={() => navigate("admin", "providers")}>Back to providers</Button>} />;

  const status = provider.verificationStatus;

  // Determine primary action for mobile bar
  const primaryAction: VerifyAction | null =
    (status === "submitted" || status === "under_review" || status === "additional_information_requested") ? "approve" :
    status === "approved" ? "suspend" :
    (status === "suspended" || status === "rejected") ? "reactivate" : null;

  const statusTone =
    status === "approved" ? "emerald" :
    status === "suspended" || status === "rejected" ? "rose" :
    "amber";

  const statusBg =
    statusTone === "emerald" ? "border-emerald-200 bg-emerald-50/40" :
    statusTone === "rose" ? "border-rose-200 bg-rose-50/40" :
    "border-amber-200 bg-amber-50/40";

  return (
    <div className="pb-28 lg:pb-0 space-y-6">
      <PageHeader
        title={`${provider.title} ${provider.firstName} ${provider.lastName}`}
        description={`${provider.specialty} · ${provider.providerNumber}`}
        back
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Personal & contact" icon={Stethoscope}>
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {initials(`${provider.firstName} ${provider.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate">{provider.title} {provider.firstName} {provider.lastName}</p>
                <p className="text-xs text-muted-foreground">{provider.providerNumber}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <DetailRow label="Professional title" value={provider.professionalTitle} />
              <DetailRow label="Years of experience" value={`${provider.yearsExperience} years`} />
              <DetailRow label="City / State" value={`${provider.city}, ${provider.state}`} icon={MapPin} />
              <DetailRow label="Languages" value={provider.languages.join(", ")} icon={Languages} />
              <DetailRow label="Rating" value={<span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" /> {provider.rating.toFixed(1)} ({provider.reviewCount} reviews)</span>} />
              <DetailRow label="Consultation modes" value={provider.consultationModes.join(", ")} />
            </div>
          </SectionCard>

          <SectionCard title="Professional details" icon={GraduationCap}>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <DetailRow label="Specialty" value={provider.specialty} icon={Stethoscope} />
              <DetailRow label="Consultation fee" value={`₦${provider.consultationFee.toLocaleString("en-NG")}`} icon={Banknote} />
            </div>
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Qualifications</p>
              <div className="flex flex-wrap gap-2">
                {provider.qualifications.map((q, i) => <Chip key={i} label={q} />)}
              </div>
            </div>
            {provider.biography && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Biography</p>
                <p className="text-sm leading-relaxed">{provider.biography}</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Registration & practising licence" icon={IdCard}>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <DetailRow label="MDCN registration number" value={provider.registrationNumber} icon={FileCheck2} />
              <DetailRow label="Practising licence number" value={provider.licenceNumber} icon={FileCheck2} />
              <DetailRow label="Licence expiry" value={formatDate(provider.licenceExpiry)} icon={Clock} />
              <DetailRow label="Verification status" value={<StatusBadge status={provider.verificationStatus} size="sm" />} />
            </div>
          </SectionCard>

          <SectionCard title="Government ID & bank details" icon={IdCard}>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Government-issued ID</p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="NIN — 12345678901" />
                  <Chip label="Drivers Licence — LR2026" />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Bank account (payout)</p>
                <div className="flex flex-wrap gap-2">
                  <Chip label="Bank — Access Bank" />
                  <Chip label="Acct — 0123456789" />
                  <Chip label="Name — Tunde Adeyemi" />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Supporting documents" icon={FileText}>
            {application && application.documents.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2">
                {application.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
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
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="Verification" icon={ShieldCheck} className={statusBg}>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-3 mb-3">
              <span className="text-sm text-muted-foreground">Current status</span>
              <StatusBadge status={status} size="sm" />
            </div>
            {/* Desktop actions */}
            <div className="hidden lg:grid grid-cols-2 gap-2">
              {status === "submitted" || status === "under_review" ? (
                <>
                  <Button className="col-span-2" onClick={() => handleAction("approve")}>
                    <BadgeCheck className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => handleAction("request_info")}>
                    <MessageSquareWarning className="h-4 w-4" /> Request Info
                  </Button>
                  <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50" onClick={() => handleAction("reject")}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </>
              ) : null}
              {status === "approved" ? (
                <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50 col-span-2" onClick={() => handleAction("suspend")}>
                  <Ban className="h-4 w-4" /> Suspend provider
                </Button>
              ) : null}
              {status === "suspended" || status === "rejected" ? (
                <Button variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 col-span-2" onClick={() => handleAction("reactivate")}>
                  <RefreshCw className="h-4 w-4" /> Reactivate
                </Button>
              ) : null}
              {status === "additional_information_requested" ? (
                <>
                  <Button className="col-span-2" onClick={() => handleAction("approve")}>
                    <BadgeCheck className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50 col-span-2" onClick={() => handleAction("reject")}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              All actions are recorded in the audit trail. Provider will be notified of the outcome.
            </p>
          </SectionCard>

          <SectionCard title="Verification history" icon={Clock} dense>
            <ol className="space-y-0 max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <li className="text-sm text-muted-foreground py-8 text-center">No history recorded.</li>
              ) : history.map((h, i) => (
                <li key={i} className="flex gap-3 px-4 py-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5" />
                    {i < history.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={h.status} size="sm" />
                      <span className="text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
                    </div>
                    <p className="text-sm mt-1 leading-relaxed">{h.note}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">By {h.by}</p>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>

      {/* Mobile bottom action bar */}
      {primaryAction && (
        <BottomActionBar>
          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              variant={ACTION_META[primaryAction].tone === "danger" ? "destructive" : "default"}
              onClick={() => handleAction(primaryAction)}
              disabled={submitting}
            >
              {primaryAction === "approve" && <BadgeCheck className="h-4 w-4" />}
              {primaryAction === "suspend" && <Ban className="h-4 w-4" />}
              {primaryAction === "reactivate" && <RefreshCw className="h-4 w-4" />}
              {ACTION_META[primaryAction].label}
            </Button>
            {status === "submitted" || status === "under_review" || status === "additional_information_requested" ? (
              <>
                <Button variant="outline" size="icon" onClick={() => handleAction("request_info")} aria-label="Request info">
                  <MessageSquareWarning className="h-4 w-4 text-amber-700" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleAction("reject")} aria-label="Reject">
                  <X className="h-4 w-4 text-rose-700" />
                </Button>
              </>
            ) : null}
          </div>
        </BottomActionBar>
      )}

      {/* Notes dialog */}
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
              variant={pendingAction && ACTION_META[pendingAction].tone === "danger" ? "destructive" : "default"}
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
              className={pendingAction && ACTION_META[pendingAction].tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : ""}
            >
              {submitting ? "Saving…" : `Confirm ${pendingAction ? ACTION_META[pendingAction].label.toLowerCase() : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
