"use client";

import type { ManagerReferralStatusResponse } from "@royal-palace/contracts";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { managerPortalService } from "@/lib/services";

import { ManagerStatusBadge } from "../components/manager-shared";

export function ManagerApplications() {
  const [items, setItems] = useState<ManagerReferralStatusResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    void managerPortalService
      .referrals({ limit: 50 })
      .then((result) => setItems(result.data))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Referral status could not be loaded."),
      );
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (items === null) return <LoadingState label="Loading referral status…" />;
  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={load} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
        description="Only application type, lifecycle status, and timestamps are available. Applicant and reviewer data remain private."
        title="Enrollment status"
      />
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item.attributionId}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{item.applicationKind}</p>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(item.createdAt)}
                </p>
              </div>
              <ManagerStatusBadge status={item.applicationStatus} />
            </CardContent>
          </Card>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No attributed applications yet.
        </p>
      ) : null}
    </div>
  );
}
