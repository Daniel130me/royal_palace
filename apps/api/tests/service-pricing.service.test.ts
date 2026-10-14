import type { CurrentSession, ServicePriceResponse } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { ServicePricingService } from "../src/laboratory/application/service-pricing.service.js";
import type { ServicePricingRepository } from "../src/laboratory/domain/service-pricing.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(role: CurrentSession["roles"][number]): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: testConfig.identity.privilegedAssuranceContext,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId: createOpaqueId(),
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function price(status: ServicePriceResponse["status"] = "DRAFT"): ServicePriceResponse {
  return {
    currency: "SGD",
    effectiveFrom: new Date().toISOString(),
    effectiveUntil: null,
    id: createOpaqueId(),
    patientPriceMinor: "12500",
    providerPayoutMinor: "10000",
    service: {
      category: "Laboratory Services",
      code: "diagnostic-testing",
      id: createOpaqueId(),
      name: "Diagnostic Testing",
    },
    status,
    version: status === "DRAFT" ? 1 : 2,
  };
}

function service(repository: Partial<ServicePricingRepository>) {
  return new ServicePricingService(
    repository as ServicePricingRepository,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    testConfig,
  );
}

describe("ServicePricingService", () => {
  it("allows only administrators to read commercial price history", async () => {
    const list = vi.fn(async () => ({ data: [price("ACTIVE")] }));
    await expect(
      service({ list }).list({ actor: session("SUPPORT"), requestId: "pricing-list-denied" }),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await expect(
      service({ list }).list({ actor: session("ADMINISTRATOR"), requestId: "pricing-list" }),
    ).resolves.toMatchObject({ data: [{ status: "ACTIVE" }] });
  });

  it("normalizes currency and rejects payout above the patient price", async () => {
    const create = vi.fn<ServicePricingRepository["create"]>(async () => price());
    const pricing = service({ create });
    const actor = session("ADMINISTRATOR");
    await expect(
      pricing.create(
        { actor, requestId: "pricing-invalid" },
        {
          currency: "sgd",
          effectiveFrom: new Date().toISOString(),
          patientPriceMinor: "10000",
          providerPayoutMinor: "10001",
          serviceId: createOpaqueId(),
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_provider_payout", status: 400 });

    await pricing.create(
      { actor, requestId: "pricing-valid" },
      {
        currency: "sgd",
        effectiveFrom: new Date().toISOString(),
        patientPriceMinor: "12500",
        providerPayoutMinor: "10000",
        serviceId: createOpaqueId(),
      },
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ currency: "SGD" }));
  });

  it("requires fresh privileged assurance before activating a price", async () => {
    const activate = vi.fn<ServicePricingRepository["activate"]>(async () => price("ACTIVE"));
    const actor = {
      ...session("ADMINISTRATOR"),
      assuranceContext: "urn:example:weak",
    };
    await expect(
      service({ activate }).activate({ actor, requestId: "pricing-step-up" }, createOpaqueId(), 1),
    ).rejects.toMatchObject({ code: "step_up_required", status: 403 });
    expect(activate).not.toHaveBeenCalled();
  });
});
