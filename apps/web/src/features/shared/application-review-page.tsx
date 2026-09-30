"use client";

import type {
  OnboardingApplicationDetail,
  OnboardingApplicationSummary,
} from "@royal-palace/contracts";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { onboardingService } from "@/lib/services";

export function ApplicationReviewPage({ authority }: { authority: "ADMIN" | "SUPPORT" }) {
  const [applications, setApplications] = useState<readonly OnboardingApplicationSummary[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<OnboardingApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result =
        authority === "ADMIN"
          ? await onboardingService.listForAdmin()
          : await onboardingService.listForSupport();
      setApplications(result.data);
      setEndCursor(result.pageInfo.endCursor);
      if (selected !== null) {
        const refreshed =
          authority === "ADMIN"
            ? await onboardingService.getForAdmin(selected.id)
            : await onboardingService.getForSupport(selected.id);
        setSelected(refreshed);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Applications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [authority, selected?.id]);

  useEffect(() => {
    void load();
  }, [authority]);

  async function select(applicationId: string) {
    setBusy(true);
    try {
      setSelected(
        authority === "ADMIN"
          ? await onboardingService.getForAdmin(applicationId)
          : await onboardingService.getForSupport(applicationId),
      );
      setNote("");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Application could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (endCursor === null) return;
    setBusy(true);
    try {
      const result =
        authority === "ADMIN"
          ? await onboardingService.listForAdmin(endCursor)
          : await onboardingService.listForSupport(endCursor);
      setApplications((current) => [...current, ...result.data]);
      setEndCursor(result.pageInfo.endCursor);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "More applications could not load.");
    } finally {
      setBusy(false);
    }
  }

  async function startReview() {
    if (selected === null) return;
    await run(() => onboardingService.startReview(selected.id, selected.version));
  }

  async function decide(command: "approve" | "reject" | "request-information") {
    if (selected === null) return;
    if (command !== "approve" && note.trim() === "") {
      toast.error("Give the applicant a clear reason or information request.");
      return;
    }
    const reasonCategory =
      command === "approve"
        ? "ADMIN_VERIFIED"
        : command === "reject"
          ? "ADMIN_REJECTED"
          : "MORE_INFORMATION_NEEDED";
    await run(() =>
      onboardingService.decide(selected.id, command, {
        expectedVersion: selected.version,
        note: note.trim() || undefined,
        reasonCategory,
      }),
    );
  }

  async function run(operation: () => Promise<OnboardingApplicationDetail>) {
    setBusy(true);
    try {
      const result = await operation();
      setSelected(result);
      setApplications((current) =>
        current.map((item) =>
          item.id === result.id
            ? {
                ...item,
                status: result.status,
                updatedAt: result.updatedAt,
                version: result.version,
              }
            : item,
        ),
      );
      setNote("");
      toast.success("Application status updated.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Application could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && applications.length === 0)
    return <LoadingState label="Loading onboarding applications…" />;
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Onboarding applications"
        description={
          authority === "ADMIN"
            ? "Administrators independently verify and decide patient, organization, and practitioner applications."
            : "Support can inspect applications and begin review. Decisions remain administrator-only."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      {applications.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No applications"
          description="The review queue is currently empty."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <Card>
            <CardContent className="divide-y p-0">
              {applications.map((application) => (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => void select(application.id)}
                  className={`flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 ${selected?.id === application.id ? "bg-muted" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{application.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {application.kind.toLowerCase()} · {application.id}
                    </p>
                  </div>
                  <StatusBadge status={application.status.toLowerCase()} size="sm" />
                </button>
              ))}
              {endCursor !== null ? (
                <div className="p-4 text-center">
                  <Button variant="outline" disabled={busy} onClick={() => void loadMore()}>
                    Load more
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {selected === null ? (
            <Card>
              <CardContent className="grid min-h-56 place-items-center text-sm text-muted-foreground">
                Select an application to inspect it.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>{selected.displayName}</span>
                  <StatusBadge status={selected.status.toLowerCase()} size="sm" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Type" value={selected.kind} />
                  <Detail label="Application ID" value={selected.id} />
                  <Detail label="Submitted" value={selected.submittedAt ?? "Not submitted"} />
                  <Detail label="Version" value={String(selected.version)} />
                </dl>
                <div>
                  <p className="mb-2 text-sm font-semibold">Submitted information</p>
                  <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                    {JSON.stringify(selected.data.values, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Status history</p>
                  <div className="space-y-2">
                    {selected.history.map((entry) => (
                      <div key={entry.id} className="rounded-lg border p-3 text-xs">
                        <p className="font-medium">
                          {entry.fromStatus ?? "CREATED"} → {entry.toStatus}
                        </p>
                        <p className="text-muted-foreground">
                          {entry.reasonCategory} · {entry.occurredAt}
                        </p>
                        {entry.note !== null ? <p className="mt-1">{entry.note}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
                {authority === "SUPPORT" && selected.status === "SUBMITTED" ? (
                  <Button disabled={busy} onClick={() => void startReview()}>
                    Start review
                  </Button>
                ) : null}
                {authority === "ADMIN" &&
                ["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(
                  selected.status,
                ) ? (
                  <div className="space-y-3 border-t pt-4">
                    <Textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Required for rejection or information requests; optional internal note for approval."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy} onClick={() => void decide("approve")}>
                        Approve
                      </Button>
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() => void decide("request-information")}
                      >
                        Request information
                      </Button>
                      <Button
                        disabled={busy}
                        variant="destructive"
                        onClick={() => void decide("reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value}</dd>
    </div>
  );
}
