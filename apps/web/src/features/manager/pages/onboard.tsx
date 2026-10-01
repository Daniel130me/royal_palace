"use client";

import type { ManagerReferralLinkResponse } from "@royal-palace/contracts";
import { Check, Copy, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { managerPortalService } from "@/lib/services";

export function ManagerOnboard() {
  const [links, setLinks] = useState<ManagerReferralLinkResponse[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void managerPortalService
      .referralLinks()
      .then(setLinks)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Referral links could not be loaded."),
      );
  }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (links === null) return <LoadingState label="Loading secure referral links…" />;

  async function copy(link: ManagerReferralLinkResponse) {
    const page = link.audience === "PATIENT" ? "signup" : "organization-signup";
    const parameters = new URLSearchParams({ code: link.referralToken });
    if (link.organizationType !== null) {
      parameters.set("type", link.organizationType.toLowerCase());
    }
    await navigator.clipboard.writeText(
      `${window.location.origin}/#/login/${page}?${parameters.toString()}`,
    );
    setCopied(link.id);
    toast.success("Secure referral link copied.");
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enrollment links"
        description="Share the appropriate secure link. Applicants authenticate and submit their own information directly to Royal Palace."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {links.map((link) => (
          <Card key={link.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{link.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {link.organizationType ?? link.audience} · {link.status}
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={link.status !== "ACTIVE"}
                onClick={() => void copy(link)}
                variant="outline"
              >
                {copied === link.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === link.id ? "Copied" : "Copy secure link"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {links.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No referral links are active. An administrator must create purpose-scoped links for you.
        </p>
      ) : null}
    </div>
  );
}
