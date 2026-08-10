"use client";

import { useEffect, useState, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { applicationService } from "@/lib/services";
import { normalizeApplication } from "../normalize";
import type { ProviderApplication } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, SectionCard, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { formatDate, relativeDay } from "@/lib/format";
import {
  BadgeCheck, GraduationCap, Award, FileText, ShieldCheck, AlertTriangle,
  Clock, Building, Hash, Calendar, Languages, Stethoscope, Star,
} from "lucide-react";

export function ProviderVerification() {
  const { profile, providerId } = useProviderContext();
  const [application, setApplication] = useState<ProviderApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerId) return;
    setLoading(true);
    setError(null);
    try {
      const apps = await applicationService.list();
      const mine = apps.find((a) => a.providerId === providerId) ?? null;
      setApplication(mine ? normalizeApplication(mine) : null);
    } catch (e) {
      setError((e as Error).message ?? "Failed to load verification.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading verification record…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <ErrorState message="Provider profile not found." />;

  const approved = profile.verificationStatus === "approved";
  const licenceDays = (() => {
    const d = new Date(profile.licenceExpiry.length === 10 ? profile.licenceExpiry + "T00:00:00" : profile.licenceExpiry);
    if (isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - Date.now()) / 86400000);
  })();

  return (
    <div>
      <PageHeader
        title="Verification & credentials"
        description="Your professional registration, licence and platform verification status."
      />

      {/* Status banner */}
      {approved ? (
        <Alert className="mb-6 border-emerald-200 bg-emerald-50">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-800">Verified provider</AlertTitle>
          <AlertDescription className="text-emerald-700">
            Your account is verified and active on the Royal Palace platform. Patients can book appointments with you.
          </AlertDescription>
        </Alert>
      ) : profile.verificationStatus === "under_review" || profile.verificationStatus === "submitted" ? (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Verification under review</AlertTitle>
          <AlertDescription className="text-amber-700">
            Your application is being reviewed by our admin team. You will be notified once verification is complete.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-6 border-rose-200 bg-rose-50">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <AlertTitle className="text-rose-800 capitalize">{profile.verificationStatus.replace(/_/g, " ")}</AlertTitle>
          <AlertDescription className="text-rose-700">
            Please contact support to resolve your verification status.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* Professional identity */}
          <SectionCard title="Professional identity" icon={Stethoscope}>
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <Field icon={Stethoscope} label="Name" value={`${profile.title} ${profile.firstName} ${profile.lastName}`} />
                <Field icon={Award} label="Professional title" value={profile.professionalTitle} />
                <Field icon={Building} label="Specialty" value={profile.specialty} />
                <Field icon={Hash} label="Provider No." value={profile.providerNumber} />
                <Field icon={Hash} label="MDCN Reg. No." value={profile.registrationNumber} />
                <Field icon={Hash} label="Licence No." value={profile.licenceNumber} />
                <Field icon={Calendar} label="Licence expiry" value={formatDate(profile.licenceExpiry)} hint={licenceDays !== null ? `${licenceDays} days remaining` : undefined} tone={licenceDays !== null && licenceDays < 90 ? "warn" : undefined} />
                <Field icon={Clock} label="Years of experience" value={`${profile.yearsExperience} years`} />
              </div>
              {licenceDays !== null && licenceDays < 90 && (
                <Alert className="border-amber-200 bg-amber-50 mt-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 text-xs leading-relaxed">
                    Your medical licence expires in {licenceDays} days. Initiate MDCN revalidation to avoid account suspension.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </SectionCard>

          {/* Qualifications */}
          <SectionCard title="Qualifications" icon={GraduationCap}>
            {profile.qualifications.length === 0 ? <p className="text-sm text-muted-foreground">No qualifications on record.</p> : (
              <div className="flex flex-wrap gap-2">
                {profile.qualifications.map((q, i) => (
                  <Badge key={i} variant="secondary" className="h-6 text-xs">
                    <GraduationCap className="h-3 w-3 mr-1" /> {q}
                  </Badge>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Documents (from application if exists) */}
          {application && (
            <SectionCard title="Submitted documents" icon={FileText} description={`${application.documents.length} document(s) on file`}>
              {application.documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents on file.</p> : (
                <div className="space-y-2">
                  {application.documents.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-2.5 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{Math.round(f.size / 1024)} KB</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-5 shrink-0">uploaded {relativeDay(f.uploadedAt)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Verification history */}
          {application && application.history.length > 0 && (
            <SectionCard title="Verification history" icon={Clock}>
              <ol className="relative border-l border-border ml-2 space-y-4 pl-5">
                {application.history.map((h, i) => (
                  <li key={i} className="text-sm">
                    <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={h.status} size="sm" />
                      <span className="text-xs text-muted-foreground">{formatDate(h.at)} · {relativeDay(h.at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">By {h.by}{h.note ? ` · ${h.note}` : ""}</p>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Status hero card */}
          <div className={`rounded-2xl border p-5 shadow-soft text-center ${approved ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
            <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${approved ? "bg-emerald-100" : "bg-amber-100"}`}>
              {approved ? <BadgeCheck className="h-8 w-8 text-emerald-600" /> : <Clock className="h-8 w-8 text-amber-600" />}
            </div>
            <p className="mt-3 text-base font-bold capitalize">{profile.verificationStatus.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Provider No. {profile.providerNumber}</p>
            <Separator className="my-3" />
            <div className="flex items-center justify-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
              <p className="text-lg font-bold text-amber-600">{profile.rating.toFixed(1)}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{profile.reviewCount} review(s)</p>
          </div>

          <SectionCard title="Languages" icon={Languages}>
            {profile.languages.length === 0 ? <p className="text-sm text-muted-foreground">No languages on record.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {profile.languages.map((l) => <Badge key={l} variant="secondary" className="h-6">{l}</Badge>)}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Location" icon={Building}>
            <div className="text-sm space-y-1">
              <p className="font-semibold">{profile.city}, {profile.state}</p>
              <p className="text-xs text-muted-foreground">Nigeria</p>
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1.5">Need to update your details?</p>
            Verification changes (licence number, qualifications, identity) require re-submission and admin review. Contact <span className="font-medium text-foreground">verification@royalpalace.health</span> to start the process.
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value, hint, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-medium">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className={`text-sm font-semibold mt-1 ${tone === "warn" ? "text-amber-700" : ""}`}>{value}</p>
      {hint && <p className={`text-[10px] mt-0.5 ${tone === "warn" ? "text-amber-600" : "text-muted-foreground"}`}>{hint}</p>}
    </div>
  );
}
