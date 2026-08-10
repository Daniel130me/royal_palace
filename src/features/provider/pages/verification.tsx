"use client";

import { useEffect, useState, useCallback } from "react";
import { useProviderContext } from "../use-provider-context";
import { applicationService } from "@/lib/services";
import { normalizeApplication } from "../normalize";
import type { ProviderApplication } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { formatDate, relativeDay } from "@/lib/format";
import {
  BadgeCheck, GraduationCap, Award, FileText, ShieldCheck, AlertTriangle,
  Clock, Building, Hash, Calendar, Languages, Stethoscope,
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Professional identity */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Professional identity</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
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
                  <AlertDescription className="text-amber-700 text-xs">
                    Your medical licence expires in {licenceDays} days. Initiate MDCN revalidation to avoid account suspension.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Qualifications */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Qualifications</CardTitle></CardHeader>
            <CardContent>
              {profile.qualifications.length === 0 ? <p className="text-sm text-muted-foreground">No qualifications on record.</p> : (
                <ul className="space-y-2">
                  {profile.qualifications.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-500 mt-0.5">•</span> {q}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Documents (from application if exists) */}
          {application && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Submitted documents</CardTitle></CardHeader>
              <CardContent>
                {application.documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents on file.</p> : (
                  <ul className="space-y-2">
                    {application.documents.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{f.name}</span>
                          <span className="text-xs text-muted-foreground">· {Math.round(f.size / 1024)} KB</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">uploaded {relativeDay(f.uploadedAt)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* Verification history */}
          {application && application.history.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Verification history</CardTitle></CardHeader>
              <CardContent>
                <ol className="relative border-l border-border ml-2 space-y-3 pl-4">
                  {application.history.map((h, i) => (
                    <li key={i} className="text-sm">
                      <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-emerald-500" />
                      <div className="flex items-center gap-2">
                        <StatusBadge status={h.status} />
                        <span className="text-xs text-muted-foreground">{formatDate(h.at)} · {relativeDay(h.at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">By {h.by}{h.note ? ` · ${h.note}` : ""}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className={approved ? "border-emerald-200 bg-emerald-50/40" : ""}>
            <CardContent className="p-4 text-center">
              <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${approved ? "bg-emerald-100" : "bg-amber-100"}`}>
                {approved ? <BadgeCheck className="h-8 w-8 text-emerald-600" /> : <Clock className="h-8 w-8 text-amber-600" />}
              </div>
              <p className="mt-3 text-base font-semibold capitalize">{profile.verificationStatus.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">Provider No. {profile.providerNumber}</p>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">Rating</p>
              <p className="text-lg font-bold text-amber-600">{profile.rating.toFixed(1)} ★</p>
              <p className="text-[10px] text-muted-foreground">{profile.reviewCount} review(s)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Languages className="h-4 w-4" /> Languages</CardTitle></CardHeader>
            <CardContent>
              {profile.languages.length === 0 ? <p className="text-sm text-muted-foreground">No languages on record.</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {profile.languages.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Building className="h-4 w-4" /> Location</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{profile.city}, {profile.state}</p>
              <p className="text-xs text-muted-foreground">Nigeria</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Need to update your details?</p>
              <p>Verification changes (licence number, qualifications, identity) require re-submission and admin review. Contact <span className="text-foreground">verification@royalpalace.health</span> to start the process.</p>
            </CardContent>
          </Card>
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
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`text-sm font-medium ${tone === "warn" ? "text-amber-700" : ""}`}>{value}</p>
      {hint && <p className={`text-[10px] ${tone === "warn" ? "text-amber-600" : "text-muted-foreground"}`}>{hint}</p>}
    </div>
  );
}
