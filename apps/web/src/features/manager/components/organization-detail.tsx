"use client";

import type { ManagerComponents } from "@royal-palace/api-client";
import { Building2, CalendarClock, FileCheck2, FlaskConical, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
} from "@/components/healthcare/page-header";
import { formatDateTime } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { managerPortalService } from "@/lib/services";

import { ManagerStatusBadge } from "./manager-shared";

type Referral = ManagerComponents["schemas"]["ReferralStatus"];

export function OrganizationDetailPage({ type }: { type: "pharmacy" | "laboratory" }) {
  const { view } = useNav();
  const attributionId = view.params.id;
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!attributionId) {
      setError("No referral selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await managerPortalService.referral(attributionId);
      const expectedType = type === "pharmacy" ? "PHARMACY" : "LABORATORY";
      if (response.organizationType !== expectedType) {
        throw new Error("Referral type does not match this page.");
      }
      setReferral(response);
      setError(null);
    } catch (reason) {
      setReferral(null);
      setError(reason instanceof Error ? reason.message : "Referral status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [attributionId, type]);

  useEffect(() => void load(), [load]);
  const Icon = type === "pharmacy" ? Building2 : FlaskConical;

  return (
    <div className="space-y-4">
      <PageHeader
        back
        title={type === "pharmacy" ? "Pharmacy referral" : "Laboratory referral"}
        description="Privacy-limited application tracking for an organization referred through your link."
        actions={
          referral ? (
            <ManagerStatusBadge status={referral.applicationStatus.toLowerCase()} />
          ) : undefined
        }
      />
      {loading ? (
        <LoadingState label="Loading referral status…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : referral ? (
        <>
          <SectionCard
            title={referral.referralLabel}
            icon={Icon}
            description="Referral attribution"
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Reference" value={referral.attributionId} mono />
              <Detail
                label="Organization type"
                value={referral.organizationType ?? "Organization"}
              />
              <Detail
                label="Application stage"
                value={referral.applicationStatus.replaceAll("_", " ")}
              />
              <Detail label="Attributed" value={formatDateTime(referral.createdAt)} />
              <Detail
                label="Submitted"
                value={
                  referral.submittedAt ? formatDateTime(referral.submittedAt) : "Not submitted"
                }
              />
              <Detail
                label="Decision recorded"
                value={referral.decidedAt ? formatDateTime(referral.decidedAt) : "No decision yet"}
              />
            </dl>
          </SectionCard>
          <div className="grid gap-3 md:grid-cols-2">
            <SectionCard title="What you can track" icon={CalendarClock} description="Status only">
              <p className="text-sm leading-relaxed text-muted-foreground">
                You can track whether an attributed application is awaiting submission, under
                review, needs more information, approved, rejected, or withdrawn.
              </p>
            </SectionCard>
            <SectionCard
              title="Protected information"
              icon={ShieldCheck}
              description="Controlled access"
            >
              <p className="text-sm leading-relaxed text-muted-foreground">
                Applicant identity, contact details, submitted documents, verification evidence,
                patient records, and platform payments are available only to authorized Support and
                administrators.
              </p>
            </SectionCard>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              Royal Palace administrators make every approval, rejection, and information request
              decision. Managers cannot alter application data or verification outcomes.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          mono ? "mt-1 break-all font-mono text-xs" : "mt-1 text-sm font-medium capitalize"
        }
      >
        {value}
      </dd>
    </div>
  );
}
