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
import { StatusBadge } from "@/components/healthcare/status-badge";
import {
  PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState, EmptyState, SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { ExpandableCard } from "@/components/healthcare/compact-list";
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
  approve: { label: "Approve", tone: "success", needsNotes: false, description: "Approve this provider and publish them on the platform." },
  reject: { label: "Reject", tone: "danger", needsNotes: true, description: "Reject this application. The provider will not be listed." },
  request_info: { label: "Request Info", tone: "warning", needsNotes: true, description: "Request additional information from the provider." },
  suspend: { label: "Suspend", tone: "danger", needsNotes: true, description: "Suspend this provider. They will be hidden from search." },
  reactivate: { label: "Reactivate", tone: "info", needsNotes: false, description: "Reactivate this provider to approved status." },
};

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1 text-xs font-medium">
      <FileText className="h-3 w-3 text-muted-foreground" /> {label}
    </span>
  );
}

type Tab = "overview" | "documents" | "history";

export function AdminProviderDetail() {
  const { view } = useNav();
  const providerId = view.params.id ?? "";
  const [provider, setProvider] = useState<Provider | null>(null);
  const [application, setApplication] = useState<ProviderApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("overview");
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
      <div className="space-y-5">
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg" />
        <SkeletonGrid count={4} />
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
    <div className="pb-28 lg:pb-0 space-y-4">
      <PageHeader
        title={`${provider.title} ${provider.firstName} ${provider.lastName}`}
        description={`${provider.specialty} · ${provider.providerNumber}`}
        back
        actions={<StatusBadge status={provider.verificationStatus} />}
      />

      {/* Provider identity compact card */}
      <SectionCard className={statusBg}>
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {initials(`${provider.firstName} ${provider.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{provider.title} {provider.firstName} {provider.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{provider.specialty} · {provider.professionalTitle}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {provider.city}</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {provider.rating.toFixed(1)}</span>
              <span className="flex items-center gap-1"><Languages className="h-3 w-3" /> {provider.languages.length}</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Segmented control for tabs */}
      <SegmentedControl
        options={[
          { value: "overview" as Tab, label: "Overview" },
          { value: "documents" as Tab, label: "Documents" },
          { value: "history" as Tab, label: "History", badge: history.length },
        ]}
        value={tab}
        onChange={setTab}
        size="sm"
      />

      {tab === "overview" && (
        <div className="space-y-2">
          {/* Professional details as ExpandableCard */}
          <ExpandableCard
            leading={<div className="rounded-lg bg-primary/10 p-2"><GraduationCap className="h-4 w-4 text-primary" /></div>}
            title="Professional details"
            subtitle={`${provider.yearsExperience} years · ₦${provider.consultationFee.toLocaleString("en-NG")} consultation`}
            trailing={provider.consultationModes.join(", ")}
          >
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Specialty</span>
                <span className="font-medium">{provider.specialty}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Consultation fee</span>
                <span className="font-medium">₦{provider.consultationFee.toLocaleString("en-NG")}</span>
              </div>
              {provider.qualifications.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Qualifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.qualifications.map((q, i) => <Chip key={i} label={q} />)}
                  </div>
                </div>
              )}
              {provider.biography && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Biography</p>
                  <p className="text-sm leading-relaxed">{provider.biography}</p>
                </div>
              )}
            </div>
          </ExpandableCard>

          {/* Registration & licence */}
          <ExpandableCard
            leading={<div className="rounded-lg bg-sky-50 p-2 ring-1 ring-sky-100"><IdCard className="h-4 w-4 text-sky-600" /></div>}
            title="Registration & licence"
            subtitle={`${provider.registrationNumber} · ${provider.licenceNumber}`}
            trailing={<StatusBadge status={provider.verificationStatus} size="sm" />}
          >
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">MDCN reg.</span>
                <span className="font-medium font-mono text-xs">{provider.registrationNumber}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Licence no.</span>
                <span className="font-medium font-mono text-xs">{provider.licenceNumber}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{formatDate(provider.licenceExpiry)}</span>
              </div>
            </div>
          </ExpandableCard>

          {/* Bank & ID */}
          <ExpandableCard
            leading={<div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-100"><Banknote className="h-4 w-4 text-emerald-600" /></div>}
            title="Government ID & bank"
            subtitle="Payout account details"
          >
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Government ID</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip label="NIN — 12345678901" />
                  <Chip label="Drivers Licence — LR2026" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Bank (payout)</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip label="Access Bank" />
                  <Chip label="Acct — 0123456789" />
                  <Chip label="Name — Tunde Adeyemi" />
                </div>
              </div>
            </div>
          </ExpandableCard>
        </div>
      )}

      {tab === "documents" && (
        <SectionCard title="Supporting documents" icon={FileText} dense>
          {application && application.documents.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {application.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 p-3">
                  <div className="rounded-md bg-muted p-2 shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{(doc.size / 1024).toFixed(0)} KB · {doc.type}</p>
                  </div>
                  <Button variant="ghost" size="sm">View</Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={FileText} title="No documents" description="No documents submitted with the application." compact />
          )}
        </SectionCard>
      )}

      {tab === "history" && (
        <SectionCard title="Verification history" icon={Clock} dense>
          <ol className="space-y-0 max-h-[28rem] overflow-y-auto">
            {history.length === 0 ? (
              <li className="text-sm text-muted-foreground py-8 text-center">No history recorded.</li>
            ) : history.map((h, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <div className="flex flex-col items-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5" />
                  {i < history.length - 1 && <div className="flex-1 w-px bg-border mt-1" style={{ minHeight: 16 }} />}
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
      )}

      {/* Verification status compact + desktop actions */}
      {primaryAction && (
        <SectionCard title="Verification actions" icon={ShieldCheck} className={statusBg}>
          <div className="hidden lg:grid grid-cols-2 gap-2">
            {(status === "submitted" || status === "under_review" || status === "additional_information_requested") && (
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
            )}
            {status === "approved" && (
              <Button variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50 col-span-2" onClick={() => handleAction("suspend")}>
                <Ban className="h-4 w-4" /> Suspend provider
              </Button>
            )}
            {(status === "suspended" || status === "rejected") && (
              <Button variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 col-span-2" onClick={() => handleAction("reactivate")}>
                <RefreshCw className="h-4 w-4" /> Reactivate
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            All actions are recorded in the audit trail. Provider will be notified of the outcome.
          </p>
        </SectionCard>
      )}

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
            {(status === "submitted" || status === "under_review" || status === "additional_information_requested") ? (
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
