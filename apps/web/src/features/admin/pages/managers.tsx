"use client";

import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { navigate } from "@/lib/nav";
import { managerProgramService } from "@/lib/services";

export function AdminManagers() {
  const [principalId, setPrincipalId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [managerProfileId, setManagerProfileId] = useState("");
  const [label, setLabel] = useState("");
  const [audience, setAudience] = useState<"PATIENT" | "ORGANIZATION">("PATIENT");
  const [organizationType, setOrganizationType] = useState<"HOSPITAL" | "PHARMACY" | "LABORATORY">(
    "HOSPITAL",
  );
  const [activityType, setActivityType] = useState<
    "CONSULTATION" | "HOSPITAL" | "PHARMACY" | "LABORATORY"
  >("CONSULTATION");
  const [currency, setCurrency] = useState("");
  const [rateBps, setRateBps] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [draftPolicy, setDraftPolicy] = useState<{ id: string; version: number } | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [referralLinkId, setReferralLinkId] = useState("");
  const [attributionVersion, setAttributionVersion] = useState("1");
  const [removeAttribution, setRemoveAttribution] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await operation();
      toast.success(success);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <Button onClick={() => navigate("admin", "manager-support")} variant="outline">
            Support queue
          </Button>
        }
        description="Create application-owned manager identities, purpose-scoped referral links, and governed commission policies. Sensitive actions require fresh step-up authentication."
        title="Manager programme"
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Create manager</CardTitle>
            <CardDescription>
              The principal must already exist in the identity service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Principal ID">
              <Input onChange={(event) => setPrincipalId(event.target.value)} value={principalId} />
            </Field>
            <Field label="Display name">
              <Input onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
            </Field>
            <Button
              disabled={busy || !principalId || !displayName}
              onClick={() =>
                void run(async () => {
                  const profile = await managerProgramService.createManager({
                    displayName,
                    principalId,
                  });
                  setManagerProfileId(profile.id);
                }, "Manager created.")
              }
            >
              Create manager
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create referral link</CardTitle>
            <CardDescription>
              Links are signed, revocable, and restricted to one applicant purpose.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Manager profile ID">
              <Input
                onChange={(event) => setManagerProfileId(event.target.value)}
                value={managerProfileId}
              />
            </Field>
            <Field label="Label">
              <Input onChange={(event) => setLabel(event.target.value)} value={label} />
            </Field>
            <Field label="Audience">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                onChange={(event) => setAudience(event.target.value as typeof audience)}
                value={audience}
              >
                <option value="PATIENT">Patient</option>
                <option value="ORGANIZATION">Organization</option>
              </select>
            </Field>
            {audience === "ORGANIZATION" ? (
              <Field label="Organization type">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  onChange={(event) =>
                    setOrganizationType(event.target.value as typeof organizationType)
                  }
                  value={organizationType}
                >
                  <option value="HOSPITAL">Hospital</option>
                  <option value="PHARMACY">Pharmacy</option>
                  <option value="LABORATORY">Laboratory</option>
                </select>
              </Field>
            ) : null}
            <Button
              disabled={busy || !managerProfileId || !label}
              onClick={() =>
                void run(
                  () =>
                    managerProgramService.createReferralLink(managerProfileId, {
                      audience,
                      label,
                      ...(audience === "ORGANIZATION" ? { organizationType } : {}),
                    }),
                  "Referral link created.",
                )
              }
            >
              Create link
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Commission policy</CardTitle>
            <CardDescription>
              Create a draft, review it, then activate it separately. No rate or currency is
              assumed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Manager profile ID">
              <Input
                onChange={(event) => setManagerProfileId(event.target.value)}
                value={managerProfileId}
              />
            </Field>
            <Field label="Activity">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                onChange={(event) => setActivityType(event.target.value as typeof activityType)}
                value={activityType}
              >
                <option value="CONSULTATION">Consultation</option>
                <option value="HOSPITAL">Hospital</option>
                <option value="PHARMACY">Pharmacy</option>
                <option value="LABORATORY">Laboratory</option>
              </select>
            </Field>
            <Field label="ISO 4217 currency">
              <Input
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                placeholder="e.g. USD"
                value={currency}
              />
            </Field>
            <Field label="Rate (basis points)">
              <Input
                max={10000}
                min={1}
                onChange={(event) => setRateBps(event.target.value)}
                type="number"
                value={rateBps}
              />
            </Field>
            <Field label="Effective from">
              <Input
                onChange={(event) => setEffectiveFrom(event.target.value)}
                type="datetime-local"
                value={effectiveFrom}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                disabled={busy || !managerProfileId || !currency || !rateBps || !effectiveFrom}
                onClick={() =>
                  void run(async () => {
                    const policy = await managerProgramService.createCommissionPolicy(
                      managerProfileId,
                      {
                        activityType,
                        currency,
                        effectiveFrom: new Date(effectiveFrom).toISOString(),
                        rateBps: Number(rateBps),
                      },
                    );
                    setDraftPolicy(policy);
                  }, "Draft policy created.")
                }
              >
                Create draft
              </Button>
              <Button
                disabled={busy || draftPolicy === null}
                onClick={() =>
                  draftPolicy &&
                  void run(
                    () =>
                      managerProgramService.activateCommissionPolicy(
                        draftPolicy.id,
                        draftPolicy.version,
                      ),
                    "Policy activated.",
                  )
                }
                variant="destructive"
              >
                Activate reviewed draft
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Correct attribution</CardTitle>
            <CardDescription>
              This appends an audited correction; it never overwrites attribution history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Application ID">
              <Input
                onChange={(event) => setApplicationId(event.target.value)}
                value={applicationId}
              />
            </Field>
            <Field label="Current version">
              <Input
                min={1}
                onChange={(event) => setAttributionVersion(event.target.value)}
                type="number"
                value={attributionVersion}
              />
            </Field>
            {!removeAttribution ? (
              <>
                <Field label="Manager profile ID">
                  <Input
                    onChange={(event) => setManagerProfileId(event.target.value)}
                    value={managerProfileId}
                  />
                </Field>
                <Field label="Referral link ID">
                  <Input
                    onChange={(event) => setReferralLinkId(event.target.value)}
                    value={referralLinkId}
                  />
                </Field>
              </>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={removeAttribution}
                onChange={(event) => setRemoveAttribution(event.target.checked)}
                type="checkbox"
              />
              Remove current attribution
            </label>
            <Button
              disabled={
                busy ||
                !applicationId ||
                (!removeAttribution && (!managerProfileId || !referralLinkId))
              }
              onClick={() =>
                void run(
                  () =>
                    managerProgramService.correctAttribution(applicationId, {
                      expectedVersion: Number(attributionVersion),
                      reasonCategory: removeAttribution
                        ? "ADMIN_ATTRIBUTION_REMOVED"
                        : "ADMIN_ATTRIBUTION_CORRECTED",
                      ...(removeAttribution ? {} : { managerProfileId, referralLinkId }),
                    }),
                  "Attribution correction recorded.",
                )
              }
              variant="destructive"
            >
              Record correction
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
