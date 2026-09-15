"use client";

// Bank details page (plan §3.1/§3.6): the masked payout account for the
// signed-in manager. Account numbers are ALWAYS masked — the API only ever
// returns the masked form, and this page explains that to the manager.

import { useEffect, useState } from "react";
import { managerService } from "@/lib/services";
import { PageHeader, LoadingState, ErrorState, SectionCard } from "@/components/healthcare/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ManagerStatusBadge, ManagerEmptyState } from "../components/manager-shared";
import { Landmark, Info, ShieldCheck } from "lucide-react";

interface BankAccountView {
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  verificationStatus: string;
}

export function ManagerBankDetails() {
  const [account, setAccount] = useState<BankAccountView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    managerService
      .payouts()
      .then((d) => {
        if (!live) return;
        setAccount(d.bankAccount ?? null);
        setLoaded(true);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load bank details."))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!loaded) return <LoadingState label="Loading bank details…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bank Details"
        description="Your payout account, held securely by Royal Palace. Payouts are disbursed here after review."
      />

      {account ? (
        <SectionCard title="Payout account" icon={Landmark} description="The account that receives your Manager Earnings payouts">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 shrink-0 self-start">
              <Landmark className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Account number</p>
              <p className="mt-1 text-2xl sm:text-3xl font-bold tracking-widest leading-none">{account.accountNumberMasked}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {account.bankName} · {account.accountName}
              </p>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Verification</p>
              <div className="mt-1">
                <ManagerStatusBadge
                  status={account.verificationStatus === "verified" ? "verified" : account.verificationStatus === "failed" ? "rejected" : "pending"}
                  label={account.verificationStatus === "verified" ? "Account verified" : account.verificationStatus === "failed" ? "Verification failed" : "Verification pending"}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      ) : (
        <ManagerEmptyState
          title="No bank account on file"
          description="Your payout account is registered by Royal Palace. Contact Royal Palace support and the finance team will add and verify your account details."
        />
      )}

      <Card className="border-sky-200 bg-sky-50/60">
        <CardContent className="p-4 sm:p-5 flex items-start gap-3">
          <div className="rounded-lg bg-sky-100 p-2 shrink-0">
            <Info className="h-4 w-4 text-sky-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sky-900">Why you only see a masked number</p>
            <p className="mt-1 text-sm text-sky-800/90 leading-relaxed">
              For security, account numbers are always masked in the prototype. Production stores encrypted/tokenized credentials only.
            </p>
          </div>
        </CardContent>
      </Card>

      {account ? (
        <SectionCard title="Account security" icon={ShieldCheck} description="How Royal Palace protects payout credentials">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">Account numbers are masked in every API response and every screen — including this one.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">Verification is performed by the Royal Palace finance team; you are notified when the account is verified.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">Changes to payout details go through Royal Palace support, never self-service, to prevent diversion of payouts.</span>
            </li>
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
