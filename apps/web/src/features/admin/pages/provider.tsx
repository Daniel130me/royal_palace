"use client";

import type {
  AdminPractitionerDetail,
  OnboardingApplicationDetail,
  PractitionerVerificationStatus,
} from "@royal-palace/contracts";
import {
  BadgeCheck,
  Ban,
  Clock,
  FileText,
  GraduationCap,
  IdCard,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ExpandableCard } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime, formatMinorCurrency, initials } from "@/lib/format";
import { navigate, useNav } from "@/lib/nav";
import { administrationService, onboardingService } from "@/lib/services";

type Tab = "overview" | "documents" | "history";

export function AdminProviderDetail() {
  const { view } = useNav();
  const id = view.params.id ?? "";
  const source = view.params.source === "application" ? "application" : "practitioner";
  const [practitioner, setPractitioner] = useState<AdminPractitionerDetail | null>(null);
  const [application, setApplication] = useState<OnboardingApplicationDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id === "") {
      setError("Missing provider identifier.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (source === "application") {
        const result = await onboardingService.getForAdmin(id);
        if (result.kind !== "PRACTITIONER")
          throw new Error("This is not a practitioner application.");
        setApplication(result);
        setPractitioner(null);
      } else {
        setPractitioner(await administrationService.practitioner(id));
        setApplication(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Provider details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id, source]);

  useEffect(() => void load(), [load]);

  async function decideApplication(command: "approve" | "reject" | "request-information") {
    if (application === null) return;
    if (command !== "approve" && note.trim() === "") {
      toast.error("Give the practitioner a clear reason or information request.");
      return;
    }
    setBusy(true);
    try {
      const result = await onboardingService.decide(application.id, command, {
        expectedVersion: application.version,
        note: note.trim() || undefined,
        reasonCategory:
          command === "approve"
            ? "ADMIN_VERIFIED"
            : command === "reject"
              ? "ADMIN_REJECTED"
              : "MORE_INFORMATION_NEEDED",
      });
      setApplication(result);
      setNote("");
      toast.success("Application status updated.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Application could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function transitionPractitioner(
    status: Exclude<PractitionerVerificationStatus, "PENDING">,
  ) {
    if (practitioner === null) return;
    if (["SUSPENDED", "REVOKED"].includes(status) && note.trim() === "") {
      toast.error("Record a clear reason for this restriction.");
      return;
    }
    setBusy(true);
    try {
      const result = await administrationService.transitionPractitioner(practitioner.id, {
        expectedVersion: practitioner.version,
        note: note.trim() || undefined,
        status,
      });
      setPractitioner(result);
      setNote("");
      toast.success("Verification status updated.");
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Verification status could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocument(applicationId: string, documentId: string) {
    setBusy(true);
    try {
      const result = await onboardingService.downloadForReview("admin", applicationId, documentId);
      const link = document.createElement("a");
      link.href = result.url;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.click();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The document is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
      </div>
    );
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (application !== null) {
    return (
      <ApplicationDetail
        application={application}
        busy={busy}
        note={note}
        setNote={setNote}
        decide={decideApplication}
        download={downloadDocument}
        tab={tab}
        setTab={setTab}
      />
    );
  }
  if (practitioner !== null) {
    return (
      <PractitionerDetail
        practitioner={practitioner}
        busy={busy}
        note={note}
        setNote={setNote}
        transition={transitionPractitioner}
        download={downloadDocument}
        tab={tab}
        setTab={setTab}
      />
    );
  }
  return (
    <EmptyState
      icon={Stethoscope}
      title="Provider not found"
      description="This provider does not exist."
      action={<Button onClick={() => navigate("admin", "providers")}>Back to providers</Button>}
    />
  );
}

function ApplicationDetail(props: {
  application: OnboardingApplicationDetail;
  busy: boolean;
  decide: (command: "approve" | "reject" | "request-information") => Promise<void>;
  download: (applicationId: string, documentId: string) => Promise<void>;
  note: string;
  setNote: (value: string) => void;
  setTab: (tab: Tab) => void;
  tab: Tab;
}) {
  const { application } = props;
  if (application.data.kind !== "PRACTITIONER") return null;
  const values = application.data.values;
  const actionable = ["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(
    application.status,
  );
  return (
    <div className="space-y-4 pb-16">
      <PageHeader
        title={application.displayName}
        description={`${values.credentialType} · ${values.registrationAuthority}`}
        back
        actions={<StatusBadge status={application.status.toLowerCase()} />}
      />
      <IdentityCard
        name={application.displayName}
        subtitle="Practitioner onboarding application"
        status={application.status}
      />
      <Tabs
        tab={props.tab}
        setTab={props.setTab}
        documents={application.documents.length}
        history={application.history.length}
      />
      {props.tab === "overview" ? (
        <div className="space-y-2">
          <ExpandableCard
            leading={<GraduationCap className="h-4 w-4 text-primary" />}
            title="Professional details"
            subtitle={values.credentialType}
          >
            <Detail label="Registration authority" value={values.registrationAuthority} />
            <Detail label="Registration number" value={values.registrationNumber} mono />
            <Detail label="Jurisdiction" value={values.jurisdictionCode} />
            <Detail
              label="Facility declared by practitioner"
              value={values.facilityName ?? "None declared"}
            />
            {values.biography !== null ? (
              <p className="pt-2 text-sm leading-relaxed">{values.biography}</p>
            ) : null}
          </ExpandableCard>
        </div>
      ) : null}
      {props.tab === "documents" ? (
        <Documents
          documents={application.documents}
          applicationId={application.id}
          busy={props.busy}
          download={props.download}
        />
      ) : null}
      {props.tab === "history" ? (
        <History
          entries={application.history.map((entry) => ({
            id: entry.id,
            status: entry.toStatus,
            at: entry.occurredAt,
            reason: entry.reasonCategory,
            note: entry.note,
          }))}
        />
      ) : null}
      {actionable ? (
        <SectionCard title="Verification actions" icon={ShieldCheck}>
          <Textarea
            value={props.note}
            onChange={(event) => props.setNote(event.target.value)}
            placeholder="Required for rejection or an information request; optional for approval."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={props.busy} onClick={() => void props.decide("approve")}>
              <BadgeCheck className="h-4 w-4" /> Approve
            </Button>
            <Button
              disabled={props.busy}
              variant="outline"
              onClick={() => void props.decide("request-information")}
            >
              Request information
            </Button>
            <Button
              disabled={props.busy}
              variant="destructive"
              onClick={() => void props.decide("reject")}
            >
              Reject
            </Button>
          </div>
        </SectionCard>
      ) : null}
      {application.status === "APPROVED" && application.approvedResourceId !== null ? (
        <Button
          onClick={() =>
            navigate("admin", "provider", {
              id: application.approvedResourceId!,
              source: "practitioner",
            })
          }
        >
          Open verified practitioner record
        </Button>
      ) : null}
    </div>
  );
}

function PractitionerDetail(props: {
  busy: boolean;
  download: (applicationId: string, documentId: string) => Promise<void>;
  note: string;
  practitioner: AdminPractitionerDetail;
  setNote: (value: string) => void;
  setTab: (tab: Tab) => void;
  tab: Tab;
  transition: (status: Exclude<PractitionerVerificationStatus, "PENDING">) => Promise<void>;
}) {
  const { practitioner } = props;
  return (
    <div className="space-y-4 pb-16">
      <PageHeader
        title={practitioner.displayName}
        description={practitioner.headline ?? practitioner.primaryProfession ?? "Practitioner"}
        back
        actions={<StatusBadge status={practitioner.verificationStatus.toLowerCase()} />}
      />
      <IdentityCard
        name={practitioner.displayName}
        subtitle={[practitioner.primaryProfession, practitioner.primarySpecialty]
          .filter(Boolean)
          .join(" · ")}
        status={practitioner.verificationStatus}
      />
      <Tabs
        tab={props.tab}
        setTab={props.setTab}
        documents={practitioner.documents.length}
        history={practitioner.verificationHistory.length}
      />
      {props.tab === "overview" ? (
        <div className="space-y-2">
          <ExpandableCard
            leading={<GraduationCap className="h-4 w-4 text-primary" />}
            title="Professional details"
            subtitle={
              practitioner.yearsExperience === null
                ? "Experience not supplied"
                : `${practitioner.yearsExperience} years experience`
            }
            trailing={practitioner.serviceModes.join(", ")}
          >
            <Detail
              label="Professions"
              value={practitioner.professions.map((item) => item.name).join(", ") || "Not supplied"}
            />
            <Detail
              label="Specialties"
              value={practitioner.specialties.map((item) => item.name).join(", ") || "Not supplied"}
            />
            <Detail label="Languages" value={practitioner.languages.join(", ") || "Not supplied"} />
            {practitioner.biography !== null ? (
              <p className="pt-2 text-sm leading-relaxed">{practitioner.biography}</p>
            ) : null}
          </ExpandableCard>
          <ExpandableCard
            leading={<IdCard className="h-4 w-4 text-sky-600" />}
            title="Registration and credentials"
            subtitle={`${practitioner.credentials.length} credential record(s)`}
          >
            {practitioner.credentials.map((credential) => (
              <div key={credential.id} className="mb-3 rounded-lg border p-3 text-sm last:mb-0">
                <p className="font-semibold">{credential.credentialType}</p>
                <Detail label="Issuer" value={credential.issuerName} />
                <Detail label="Registration" value={credential.registrationNumber} mono />
                <Detail label="Jurisdiction" value={credential.jurisdictionCode} />
                <Detail
                  label="Expires"
                  value={
                    credential.expiresAt === null
                      ? "No expiry recorded"
                      : formatDate(credential.expiresAt)
                  }
                />
              </div>
            ))}
          </ExpandableCard>
          <ExpandableCard
            leading={<MapPin className="h-4 w-4 text-emerald-600" />}
            title="Declared affiliations"
            subtitle="Facilities do not control practitioner verification or fees."
          >
            {practitioner.affiliations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No affiliation declared.</p>
            ) : (
              practitioner.affiliations.map((item) => (
                <Detail
                  key={item.id}
                  label={item.roleTitle ?? "Facility"}
                  value={item.facilityName}
                />
              ))
            )}
          </ExpandableCard>
          <ExpandableCard
            leading={<Wallet className="h-4 w-4 text-violet-600" />}
            title="Platform-controlled consultation fees"
            subtitle={`${practitioner.consultationFees.length} effective-dated fee record(s)`}
          >
            {practitioner.consultationFees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consultation fee has been set.</p>
            ) : (
              practitioner.consultationFees.map((fee) => (
                <div key={fee.id} className="mb-3 rounded-lg border p-3 text-sm last:mb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold capitalize">
                      {fee.mode.toLowerCase().replaceAll("_", " ")}
                    </p>
                    <StatusBadge status={fee.status.toLowerCase()} size="sm" />
                  </div>
                  <Detail
                    label="Patient fee"
                    value={formatMinorCurrency(fee.amountMinor, fee.currency)}
                  />
                  <Detail label="Effective from" value={formatDateTime(fee.effectiveFrom)} />
                  <Detail
                    label="Effective until"
                    value={
                      fee.effectiveUntil === null
                        ? "No scheduled end"
                        : formatDateTime(fee.effectiveUntil)
                    }
                  />
                </div>
              ))
            )}
          </ExpandableCard>
        </div>
      ) : null}
      {props.tab === "documents" ? (
        <Documents
          documents={practitioner.documents}
          applicationId={practitioner.approvedApplicationId}
          busy={props.busy}
          download={props.download}
        />
      ) : null}
      {props.tab === "history" ? (
        <History
          entries={practitioner.verificationHistory.map((entry) => ({
            id: entry.id,
            status: entry.toStatus,
            at: entry.occurredAt,
            reason: entry.reasonCode,
            note: entry.note,
          }))}
        />
      ) : null}
      <SectionCard title="Verification actions" icon={ShieldCheck}>
        <Textarea
          value={props.note}
          onChange={(event) => props.setNote(event.target.value)}
          placeholder="A reason is required for suspension or revocation."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {practitioner.verificationStatus !== "VERIFIED" ? (
            <Button disabled={props.busy} onClick={() => void props.transition("VERIFIED")}>
              <RefreshCw className="h-4 w-4" /> Verify or reactivate
            </Button>
          ) : null}
          {practitioner.verificationStatus === "VERIFIED" ? (
            <Button
              disabled={props.busy}
              variant="outline"
              onClick={() => void props.transition("SUSPENDED")}
            >
              <Ban className="h-4 w-4" /> Suspend
            </Button>
          ) : null}
          {practitioner.verificationStatus !== "REVOKED" ? (
            <Button
              disabled={props.busy}
              variant="destructive"
              onClick={() => void props.transition("REVOKED")}
            >
              Revoke verification
            </Button>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Verification is independent of facility affiliation. All changes are version checked and
          permanently recorded.
        </p>
      </SectionCard>
    </div>
  );
}

function IdentityCard({
  name,
  status,
  subtitle,
}: {
  name: string;
  status: string;
  subtitle: string;
}) {
  return (
    <SectionCard>
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary/10 text-primary">{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          <div className="mt-1">
            <StatusBadge status={status.toLowerCase()} size="sm" />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function Tabs({
  documents,
  history,
  setTab,
  tab,
}: {
  documents: number;
  history: number;
  setTab: (tab: Tab) => void;
  tab: Tab;
}) {
  return (
    <SegmentedControl
      options={[
        { value: "overview" as Tab, label: "Overview" },
        { value: "documents" as Tab, label: "Documents", badge: documents },
        { value: "history" as Tab, label: "History", badge: history },
      ]}
      value={tab}
      onChange={setTab}
      size="sm"
    />
  );
}

function Documents({
  applicationId,
  busy,
  documents,
  download,
}: {
  applicationId: string | null;
  busy: boolean;
  documents: readonly {
    id: string;
    originalFilename: string;
    purpose: string;
    status: string;
    declaredSizeBytes: number;
  }[];
  download: (applicationId: string, documentId: string) => Promise<void>;
}) {
  return (
    <SectionCard title="Supporting documents" icon={FileText} dense>
      {documents.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No supporting documents recorded.</p>
      ) : (
        <ul className="divide-y">
          {documents.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3">
              <FileText className="h-4 w-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.originalFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {item.purpose.replaceAll("_", " ")} · {Math.ceil(item.declaredSizeBytes / 1024)}{" "}
                  KB · {item.status}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || applicationId === null || item.status !== "CLEAN"}
                onClick={() =>
                  applicationId === null ? undefined : void download(applicationId, item.id)
                }
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function History({
  entries,
}: {
  entries: readonly {
    at: string;
    id: string;
    note: string | null;
    reason: string;
    status: string;
  }[];
}) {
  return (
    <SectionCard title="Verification history" icon={Clock} dense>
      {entries.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No later verification changes recorded. Initial approval remains in the onboarding
          evidence.
        </p>
      ) : (
        <ol className="divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={entry.status.toLowerCase()} size="sm" />
                <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
              </div>
              <p className="mt-1 text-sm">{entry.reason.replaceAll("_", " ")}</p>
              {entry.note !== null ? (
                <p className="text-xs text-muted-foreground">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function Detail({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="mt-2 flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
