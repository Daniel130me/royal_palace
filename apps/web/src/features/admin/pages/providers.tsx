"use client";

import type {
  AdminPractitionerListItem,
  AdminPractitionerScope,
  OnboardingApplicationSummary,
} from "@royal-palace/contracts";
import { BadgeCheck, Search, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactListItem } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import { SegmentedControl } from "@/components/healthcare/segmented-control";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { administrationService, onboardingService } from "@/lib/services";

type StatusFilter = "pending" | "verified" | "all";

const PRACTITIONER_SCOPE: Record<StatusFilter, AdminPractitionerScope> = {
  all: "ALL",
  pending: "PENDING",
  verified: "VERIFIED",
};

export function AdminProviders() {
  const [practitioners, setPractitioners] = useState<readonly AdminPractitionerListItem[]>([]);
  const [applications, setApplications] = useState<readonly OnboardingApplicationSummary[]>([]);
  const [practitionerCursor, setPractitionerCursor] = useState<string | null>(null);
  const [applicationCursor, setApplicationCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState({ all: 0, pending: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = search.trim() || undefined;
      const [practitionerResult, applicationResult] = await Promise.all([
        administrationService.practitioners({
          limit: 25,
          query,
          scope: PRACTITIONER_SCOPE[filter],
        }),
        filter === "verified"
          ? Promise.resolve({ data: [], pageInfo: { endCursor: null, hasNextPage: false } })
          : onboardingService.listForAdmin(undefined, { kind: "PRACTITIONER" }),
      ]);
      const matchingApplications = applicationResult.data.filter((application) =>
        query === undefined
          ? true
          : application.displayName.toLowerCase().includes(query.toLowerCase()),
      );
      setPractitioners(practitionerResult.data);
      setApplications(matchingApplications);
      setPractitionerCursor(practitionerResult.pageInfo.endCursor);
      setApplicationCursor(applicationResult.pageInfo.endCursor);
      setSummary({
        all: practitionerResult.summary.all + matchingApplications.length,
        pending: practitionerResult.summary.pending + matchingApplications.length,
        verified: practitionerResult.summary.verified,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Practitioners could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const rows = useMemo(
    () => [
      ...applications.map((application) => ({
        id: application.id,
        name: application.displayName,
        source: "application" as const,
        status: application.status,
        subtitle: `Practitioner application · updated ${new Date(application.updatedAt).toLocaleDateString()}`,
      })),
      ...practitioners.map((practitioner) => ({
        id: practitioner.id,
        name: practitioner.displayName,
        source: "practitioner" as const,
        status: practitioner.verificationStatus,
        subtitle:
          [practitioner.primaryProfession, practitioner.primarySpecialty]
            .filter(Boolean)
            .join(" · ") || "Practitioner",
      })),
    ],
    [applications, practitioners],
  );

  async function loadMorePractitioners() {
    if (practitionerCursor === null) return;
    const result = await administrationService.practitioners({
      cursor: practitionerCursor,
      limit: 25,
      query: search.trim() || undefined,
      scope: PRACTITIONER_SCOPE[filter],
    });
    setPractitioners((current) => [...current, ...result.data]);
    setPractitionerCursor(result.pageInfo.endCursor);
  }

  async function loadMoreApplications() {
    if (applicationCursor === null) return;
    const result = await onboardingService.listForAdmin(applicationCursor, {
      kind: "PRACTITIONER",
    });
    setApplications((current) => [...current, ...result.data]);
    setApplicationCursor(result.pageInfo.endCursor);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Providers"
        description="Review practitioner applications and govern independent verification status."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Providers" },
        ]}
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, profession, specialty, or practitioner ID"
          className="pl-9"
        />
      </div>
      <SegmentedControl
        options={(
          [
            ["pending", "Pending"],
            ["verified", "Verified"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => ({ value, label, badge: summary[value] }))}
        value={filter}
        onChange={setFilter}
        size="sm"
      />

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error !== null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No providers found"
          description="Try another search or verification filter."
          compact
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40">
            {rows.map((row) => (
              <CompactListItem
                key={`${row.source}-${row.id}`}
                leading={
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials(row.name)}
                    </AvatarFallback>
                  </Avatar>
                }
                title={row.name}
                subtitle={row.subtitle}
                trailing={
                  <div className="flex items-center gap-1.5">
                    {row.status === "VERIFIED" ? (
                      <BadgeCheck className="h-4 w-4 text-emerald-600" />
                    ) : null}
                    <StatusBadge status={row.status.toLowerCase()} size="sm" />
                  </div>
                }
                onClick={() => navigate("admin", "provider", { id: row.id, source: row.source })}
                chevron
              />
            ))}
          </div>
          {practitionerCursor !== null || applicationCursor !== null ? (
            <div className="flex justify-center gap-2">
              {applicationCursor !== null ? (
                <Button variant="outline" onClick={() => void loadMoreApplications()}>
                  More applications
                </Button>
              ) : null}
              {practitionerCursor !== null ? (
                <Button variant="outline" onClick={() => void loadMorePractitioners()}>
                  More practitioners
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
