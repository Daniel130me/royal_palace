import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import {
  type ManagerFlowError,
  ManagerService,
} from "../src/manager/application/manager.service.js";
import type { ReferralClaimService } from "../src/manager/application/referral-claim.service.js";
import type { ManagerRepository } from "../src/manager/domain/manager-repository.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(
  role: CurrentSession["roles"][number],
  principalId = createOpaqueId(),
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: testConfig.identity.privilegedAssuranceContext,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId,
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function service(repository: Partial<ManagerRepository>) {
  return new ManagerService(
    repository as ManagerRepository,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    { issue: vi.fn(() => "signed-referral") } as unknown as ReferralClaimService,
    testConfig,
  );
}

describe("ManagerService", () => {
  it("returns minimal referral status and uses the repository keyset cursor", async () => {
    const principalId = createOpaqueId();
    const managerProfileId = createOpaqueId();
    const applicationId = createOpaqueId();
    const updatedAt = new Date("2026-09-30T10:00:00.000Z");
    const manager = service({
      findManagerByPrincipal: vi.fn<ManagerRepository["findManagerByPrincipal"]>(async () => ({
        displayName: "Synthetic Manager",
        id: managerProfileId,
        status: "ACTIVE" as const,
      })),
      listReferralStatuses: vi.fn<ManagerRepository["listReferralStatuses"]>(async () => ({
        cursor: { applicationId, updatedAt },
        data: [
          {
            applicationKind: "PATIENT" as const,
            applicationStatus: "UNDER_REVIEW" as const,
            attributionId: createOpaqueId(),
            createdAt: "2026-09-30T09:00:00.000Z",
            decidedAt: null,
            submittedAt: "2026-09-30T09:05:00.000Z",
          },
        ],
        hasNextPage: true,
      })),
    });

    const result = await manager.listOwnReferralStatuses(
      { actor: session("MANAGER", principalId), requestId: "request-1" },
      { limit: 20 },
    );

    expect(result.pageInfo.endCursor).not.toBeNull();
    expect(result.data[0]).not.toHaveProperty("applicantPrincipalId");
    expect(result.data[0]).not.toHaveProperty("reviewerNote");
  });

  it("never accepts stale privileged authentication for financial policy activation", async () => {
    const activate = vi.fn();
    const manager = service({ activateCommissionPolicy: activate });
    const actor = {
      ...session("ADMINISTRATOR"),
      authenticatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };

    await expect(
      manager.activateCommissionPolicy({ actor, requestId: "request-2" }, createOpaqueId(), 1),
    ).rejects.toMatchObject<Partial<ManagerFlowError>>({ code: "step_up_required", status: 403 });
    expect(activate).not.toHaveBeenCalled();
  });

  it("rejects mixed-currency assumptions and invalid report ranges before querying", async () => {
    const listEarnings = vi.fn();
    const principalId = createOpaqueId();
    const manager = service({
      findManagerByPrincipal: vi.fn<ManagerRepository["findManagerByPrincipal"]>(async () => ({
        displayName: "Synthetic Manager",
        id: createOpaqueId(),
        status: "ACTIVE" as const,
      })),
      listEarnings,
    });

    await expect(
      manager.getOwnEarnings(
        { actor: session("MANAGER", principalId), requestId: "request-3" },
        {
          from: "2025-01-01T00:00:00.000Z",
          granularity: "MONTH",
          timeZone: "UTC",
          to: "2026-09-30T00:00:00.000Z",
        },
      ),
    ).rejects.toMatchObject<Partial<ManagerFlowError>>({ code: "invalid_report_range" });
    expect(listEarnings).not.toHaveBeenCalled();
  });

  it("returns only commission projections and keeps currencies separated", async () => {
    const principalId = createOpaqueId();
    const managerProfileId = createOpaqueId();
    const report = {
      buckets: [
        { amountMinor: "500", currency: "USD", periodStart: "2026-09-30" },
        { amountMinor: "700", currency: "EUR", periodStart: "2026-09-30" },
      ],
      entries: [
        {
          activityType: "CONSULTATION" as const,
          amountMinor: "500",
          currency: "USD",
          id: createOpaqueId(),
          occurredAt: "2026-09-30T10:00:00.000Z",
          status: "AVAILABLE" as const,
        },
      ],
      pageInfo: { endCursor: null, hasNextPage: false },
      range: {
        from: "2026-09-01T00:00:00.000Z",
        timeZone: "Europe/London",
        to: "2026-10-01T00:00:00.000Z",
      },
      totals: [
        { amountMinor: "500", currency: "USD" },
        { amountMinor: "700", currency: "EUR" },
      ],
    };
    const listEarnings = vi.fn<ManagerRepository["listEarnings"]>(async () => report);
    const manager = service({
      findManagerByPrincipal: vi.fn<ManagerRepository["findManagerByPrincipal"]>(async () => ({
        displayName: "Synthetic Manager",
        id: managerProfileId,
        status: "ACTIVE" as const,
      })),
      listEarnings,
    });

    const result = await manager.getOwnEarnings(
      { actor: session("MANAGER", principalId), requestId: "request-4" },
      {
        from: report.range.from,
        granularity: "DAY",
        timeZone: report.range.timeZone,
        to: report.range.to,
      },
    );

    expect(result).toEqual(report);
    expect(JSON.stringify(result)).not.toMatch(
      /grossAmount|patientId|payment|policyId|rateBps|royalPalaceRevenue/i,
    );
    expect(result.totals).toEqual([
      { amountMinor: "500", currency: "USD" },
      { amountMinor: "700", currency: "EUR" },
    ]);
  });

  it("normalizes private settlement input without using floating-point money", async () => {
    const record = vi.fn<ManagerRepository["recordSettledPatientActivity"]>(async () => ({
      earningCreated: true,
      earningId: createOpaqueId(),
      settlementId: createOpaqueId(),
    }));
    const manager = service({ recordSettledPatientActivity: record });
    const actor = session("SYSTEM_WORKER");

    await manager.recordSettledPatientActivity(
      { actor, requestId: "request-5" },
      {
        activityType: "PHARMACY",
        currency: "usd",
        grossAmountMinor: "10005",
        patientId: createOpaqueId(),
        settledAt: "2026-09-30T10:00:00.000Z",
        sourceEventKey: "payment-provider:event-1",
        sourceType: "PAYMENT_PROVIDER",
      },
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "USD",
        grossAmountMinor: 10_005n,
        recordedByPrincipalId: actor.principalId,
        settledAt: new Date("2026-09-30T10:00:00.000Z"),
      }),
    );
  });
});
