"use client";

import type { ManagerComponents } from "@royal-palace/api-client";
import { Building2, FlaskConical, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { managerPortalService } from "@/lib/services";

import { ManagerStatusBadge } from "./manager-shared";

type Referral = ManagerComponents["schemas"]["ReferralStatus"];
type OrganizationType = "PHARMACY" | "LABORATORY";

export function OrganizationListPage({ type }: { type: "pharmacy" | "laboratory" }) {
  const organizationType: OrganizationType = type === "pharmacy" ? "PHARMACY" : "LABORATORY";
  const title = type === "pharmacy" ? "Pharmacy referrals" : "Laboratory referrals";
  const [items, setItems] = useState<Referral[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      try {
        const response = await managerPortalService.referrals({
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
          limit: 25,
          organizationType,
        });
        setItems((current) =>
          nextCursor === undefined ? [...response.data] : [...current, ...response.data],
        );
        setCursor(response.pageInfo.endCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
        setError(null);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Referral statuses could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [organizationType],
  );

  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description="Track applications attributed to your referral links. Applicant and organization records remain private to Support and administrators."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      {loading && items.length === 0 ? (
        <LoadingState label={`Loading ${title.toLowerCase()}…`} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={`No ${type} referrals yet`}
          description="Share an active organization referral link. The applicant completes and submits their own information."
          action={
            <Button onClick={() => navigate("manager", "onboard")}>View referral links</Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ReferralCard key={item.attributionId} item={item} type={type} />
          ))}
          {hasNextPage && cursor !== null ? (
            <Button
              className="w-full"
              variant="outline"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReferralCard({ item, type }: { item: Referral; type: "pharmacy" | "laboratory" }) {
  const Icon = type === "pharmacy" ? Building2 : FlaskConical;
  const destination = type === "pharmacy" ? "pharmacy" : "laboratory";
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/40"
      onClick={() => navigate("manager", destination, { id: item.attributionId })}
    >
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{item.referralLabel}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                Reference {shortReference(item.attributionId)}
              </p>
            </div>
            <ManagerStatusBadge status={item.applicationStatus.toLowerCase()} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Attributed {formatDate(item.createdAt)} · No private organization or payment data is
            disclosed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function shortReference(value: string): string {
  return value.slice(0, 8).toUpperCase();
}
