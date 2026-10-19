"use client";

import { Banknote, CalendarDays, ShieldCheck, Wallet } from "lucide-react";

import { PageHeader, SectionCard } from "@/components/healthcare/page-header";
import { StatTile } from "@/components/healthcare/compact-list";

export function ProviderCommercialPolicyPending({ view }: { view: "earnings" | "payouts" }) {
  const payouts = view === "payouts";
  return (
    <div className="space-y-5">
      <PageHeader
        title={payouts ? "Payouts" : "Earnings"}
        description={
          payouts
            ? "Track and request practitioner payouts after the commercial policy is approved."
            : "Review practitioner earnings and settlement periods after the commercial policy is approved."
        }
      />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Available" value="Not configured" icon={Wallet} tone="default" />
        <StatTile label="Pending" value="Not configured" icon={CalendarDays} tone="default" />
        <StatTile label="Paid" value="Not configured" icon={Banknote} tone="default" />
        <StatTile label="Policy" value="Awaiting approval" icon={ShieldCheck} tone="warning" />
      </div>
      <SectionCard title="Commercial policy required" icon={ShieldCheck}>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            This signed screen remains in the product, but monetary values and payout actions stay
            disabled until Royal Palace approves a versioned practitioner earnings and payout
            policy.
          </p>
          <p>
            The policy must define eligible services, effective dates, currencies, refunds and
            disputes, settlement cadence, minimum payout values, recipient ownership, and approval
            roles. Historical earnings will retain the exact policy version used.
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
            No estimated percentage, default currency, bank destination, or payout schedule is
            assumed by the application.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
