"use client";

import { CheckCircle2, LogIn, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNav } from "@/lib/nav";
import { productionOrganizationTeamService } from "@/lib/services";

const PENDING_INVITATION_STORAGE_KEY = "royal-palace.pending-organization-team-invitation";

export function TeamInvitationPage() {
  const { session } = useNav();
  const [token] = useState(() => {
    if (typeof window === "undefined") return null;
    const linkToken = new URLSearchParams(window.location.hash.split("?", 2)[1] ?? "").get("token");
    if (linkToken !== null) {
      // Do not send this bearer secret through the login return URL or retain it in
      // browser history. Session storage survives the local authentication redirect
      // while remaining isolated to this browser tab.
      window.sessionStorage.setItem(PENDING_INVITATION_STORAGE_KEY, linkToken);
      window.history.replaceState(null, "", "/#/login/team-invitation");
      return linkToken;
    }
    return window.sessionStorage.getItem(PENDING_INVITATION_STORAGE_KEY);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedOrganization, setAcceptedOrganization] = useState<string | null>(null);
  const returnTo = "/#/login/team-invitation";

  async function accept() {
    if (token === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await productionOrganizationTeamService.acceptInvitation(token);
      setAcceptedOrganization(result.organization.displayName);
      window.sessionStorage.removeItem(PENDING_INVITATION_STORAGE_KEY);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitation could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg space-y-4">
        <PageHeader
          title="Join an organization team"
          description="Accept a secure staff invitation to work in an organization portal."
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Organization staff access
            </CardTitle>
            <CardDescription>
              The invitation grants operational staff access only. It does not grant organization
              administration or platform-wide permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {acceptedOrganization ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Invitation accepted
                </p>
                <p className="mt-1">You now have staff access to {acceptedOrganization}.</p>
              </div>
            ) : token === null ? (
              <p className="text-sm text-destructive">
                This invitation link is incomplete. Ask the organization administrator for a new
                link.
              </p>
            ) : session === null ? (
              <div className="space-y-3">
                <div className="flex gap-2 rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Sign in with the account that should receive access. The invitation stays bound to
                  this browser flow and is accepted only after authentication.
                </div>
                <Button asChild className="w-full">
                  <a href={`/api/bff/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
                    <LogIn className="mr-1 h-4 w-4" /> Continue to sign in
                  </a>
                </Button>
              </div>
            ) : (
              <Button className="w-full" disabled={busy} onClick={() => void accept()}>
                {busy ? "Accepting invitation…" : "Accept staff invitation"}
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
