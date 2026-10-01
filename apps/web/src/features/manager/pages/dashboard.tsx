"use client";

import type {
  ManagerEarningsReportResponse,
  ManagerProfileResponse,
  ManagerReferralStatusResponse,
  ManagerTicketResponse,
} from "@royal-palace/contracts";
import { ClipboardList, Coins, LifeBuoy, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { MetricCard } from "@/components/healthcare/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { managerPortalService } from "@/lib/services";

interface DashboardData {
  earnings: ManagerEarningsReportResponse;
  profile: ManagerProfileResponse;
  referrals: ManagerReferralStatusResponse[];
  tickets: ManagerTicketResponse[];
}

export function ManagerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    void Promise.all([
      managerPortalService.profile(),
      managerPortalService.referrals({ limit: 50 }),
      managerPortalService.earnings({
        from: from.toISOString(),
        granularity: "DAY",
        limit: 10,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        to: to.toISOString(),
      }),
      managerPortalService.tickets({ limit: 50 }),
    ])
      .then(([profile, referrals, earnings, tickets]) =>
        setData({ earnings, profile, referrals: referrals.data, tickets: tickets.data }),
      )
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded."),
      );
  }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (data === null) return <LoadingState label="Loading your dashboard…" />;
  const pending = data.referrals.filter((item) =>
    ["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(item.applicationStatus),
  ).length;
  const openTickets = data.tickets.filter((item) => item.status !== "CLOSED").length;
  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => navigate("manager", "onboard")}>
            <Link2 className="h-4 w-4" />
            Enrollment links
          </Button>
        }
        description="Referral progress and commission only—no patient, payment, or organization private data."
        title={`Welcome, ${data.profile.displayName}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={ClipboardList}
          label="Attributed applications"
          value={data.referrals.length}
          onClick={() => navigate("manager", "applications")}
        />
        <MetricCard
          icon={ClipboardList}
          label="Pending review"
          tone="warning"
          value={pending}
          onClick={() => navigate("manager", "applications")}
        />
        <MetricCard
          icon={Coins}
          label="Currencies earned this month"
          tone="success"
          value={data.earnings.totals.length}
          onClick={() => navigate("manager", "earnings")}
        />
        <MetricCard
          icon={LifeBuoy}
          label="Open tickets"
          tone="info"
          value={openTickets}
          onClick={() => navigate("manager", "support")}
        />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">This month’s commission</CardTitle>
          <CardDescription>
            Each currency is reported separately; currencies are never combined.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {data.earnings.totals.map((total) => (
            <div className="rounded-lg border p-3" key={total.currency}>
              <p className="text-xs text-muted-foreground">{total.currency}</p>
              <p className="font-bold">{formatMinorCurrency(total.amountMinor, total.currency)}</p>
            </div>
          ))}
          {data.earnings.totals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commission recorded this month.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
