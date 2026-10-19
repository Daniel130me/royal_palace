"use client";

import type { PractitionerVerificationResponse } from "@royal-palace/contracts";
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Building,
  Calendar,
  Clock,
  FileText,
  GraduationCap,
  Hash,
  Languages,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate, relativeDay } from "@/lib/format";
import { productionAccountProfileService } from "@/lib/services";

export function ProviderVerification() {
  const [record, setRecord] = useState<PractitionerVerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecord(await productionAccountProfileService.practitioner.verification());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Verification record could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  if (loading) return <LoadingState label="Loading verification record…" />;
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (record === null) return <ErrorState message="Verification record not found." />;

  const approved = record.verificationStatus === "VERIFIED";
  const nextExpiry =
    record.credentials
      .filter((credential) => credential.expiresAt !== null)
      .sort((left, right) => left.expiresAt!.localeCompare(right.expiresAt!))[0]?.expiresAt ?? null;
  const expiryDays =
    nextExpiry === null ? null : Math.ceil((Date.parse(nextExpiry) - Date.now()) / 86_400_000);

  return (
    <div>
      <PageHeader
        title="Verification & credentials"
        description="Your professional credentials and Royal Palace verification status."
      />
      <VerificationBanner status={record.verificationStatus} />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Professional identity" icon={Stethoscope}>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <Field icon={Stethoscope} label="Name" value={record.displayName} />
              <Field
                icon={Award}
                label="Profession"
                value={record.primaryProfession ?? "Not listed"}
              />
              <Field
                icon={Building}
                label="Specialty"
                value={record.primarySpecialty ?? "Not listed"}
              />
              <Field
                icon={Clock}
                label="Years of experience"
                value={
                  record.yearsExperience === null ? "Not listed" : `${record.yearsExperience} years`
                }
              />
            </div>
            {nextExpiry !== null && expiryDays !== null && expiryDays < 90 ? (
              <Alert className="mt-4 border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700">
                  A credential expires {relativeDay(nextExpiry)}. Complete renewal with the relevant
                  regulator and submit updated evidence for review.
                </AlertDescription>
              </Alert>
            ) : null}
          </SectionCard>

          <SectionCard title="Credentials" icon={GraduationCap}>
            {record.credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No credentials are recorded.</p>
            ) : (
              <div className="space-y-2">
                {record.credentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="rounded-xl border border-border/70 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {credential.credentialType.replaceAll("_", " ")}
                      </p>
                      <Badge variant="outline">
                        {credential.verifiedAt === null ? "Awaiting verification" : "Verified"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {credential.issuerName} · {credential.jurisdictionCode}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs">
                      <Hash className="h-3 w-3" />
                      {credential.registrationNumber}
                    </p>
                    {credential.expiresAt === null ? null : (
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        <Calendar className="h-3 w-3" />
                        Expires {formatDate(credential.expiresAt)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Submitted documents"
            icon={FileText}
            description={`${record.documents.length} document(s) on file`}
          >
            {record.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No supporting documents are recorded.</p>
            ) : (
              <div className="space-y-2">
                {record.documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{document.originalFilename}</p>
                      <p className="text-xs text-muted-foreground">
                        {document.purpose.replaceAll("_", " ")} ·{" "}
                        {Math.ceil(document.declaredSizeBytes / 1024)} KB
                      </p>
                    </div>
                    <StatusBadge status={document.status.toLowerCase()} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Verification history" icon={Clock}>
            {record.verificationHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No verification changes are recorded.</p>
            ) : (
              <ol className="space-y-4 border-l border-border pl-5">
                {record.verificationHistory.map((event) => (
                  <li key={event.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={event.toStatus.toLowerCase()} size="sm" />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.occurredAt)} · {relativeDay(event.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.reasonCode.replaceAll("_", " ")}
                      {event.note ? ` · ${event.note}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <div
            className={`rounded-2xl border p-5 text-center shadow-soft ${approved ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}
          >
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${approved ? "bg-emerald-100" : "bg-amber-100"}`}
            >
              {approved ? (
                <BadgeCheck className="h-8 w-8 text-emerald-600" />
              ) : (
                <Clock className="h-8 w-8 text-amber-600" />
              )}
            </div>
            <p className="mt-3 text-base font-bold capitalize">
              {record.verificationStatus.toLowerCase()}
            </p>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              Verification decisions are made only by authorized Royal Palace administrators.
            </p>
          </div>
          <SectionCard title="Languages" icon={Languages}>
            {record.languages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No languages are recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {record.languages.map((language) => (
                  <Badge key={language} variant="secondary">
                    {language}
                  </Badge>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard title="Affiliations" icon={Building}>
            {record.affiliations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Independent practitioner; no facility affiliation is recorded.
              </p>
            ) : (
              <div className="space-y-2">
                {record.affiliations.map((affiliation) => (
                  <div key={affiliation.id}>
                    <p className="text-sm font-semibold">{affiliation.facilityName}</p>
                    <p className="text-xs text-muted-foreground">
                      {affiliation.roleTitle ?? "Affiliated practitioner"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
            Credential changes require new evidence and administrator review. Use the platform
            support flow to request an update.
          </div>
        </div>
      </div>
    </div>
  );
}

function VerificationBanner({
  status,
}: {
  status: PractitionerVerificationResponse["verificationStatus"];
}) {
  if (status === "VERIFIED")
    return (
      <Alert className="mb-6 border-emerald-200 bg-emerald-50">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <AlertTitle className="text-emerald-800">Verified practitioner</AlertTitle>
        <AlertDescription className="text-emerald-700">
          Your professional record is verified and active.
        </AlertDescription>
      </Alert>
    );
  if (status === "PENDING")
    return (
      <Alert className="mb-6 border-amber-200 bg-amber-50">
        <Clock className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Verification under review</AlertTitle>
        <AlertDescription className="text-amber-700">
          Royal Palace administrators are reviewing your submitted evidence.
        </AlertDescription>
      </Alert>
    );
  return (
    <Alert className="mb-6 border-rose-200 bg-rose-50">
      <AlertTriangle className="h-4 w-4 text-rose-600" />
      <AlertTitle className="capitalize text-rose-800">{status.toLowerCase()}</AlertTitle>
      <AlertDescription className="text-rose-700">
        Use platform support to follow up on this verification status.
      </AlertDescription>
    </Alert>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
