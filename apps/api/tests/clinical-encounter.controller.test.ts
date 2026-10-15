import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ClinicalEncounterService } from "../src/clinical/application/clinical-encounter.service.js";
import { ProviderClinicalEncounterController } from "../src/clinical/presentation/clinical-encounter.controller.js";
import type { AuthenticatedInternalRequest } from "../src/identity/presentation/authenticated-internal-request.guard.js";

const request = {
  currentSession: {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId: "0199a18e-a400-7000-8000-000000000201",
    roles: ["PROVIDER"],
    sessionId: "0199a18e-a400-7000-8000-000000000202",
  },
  headers: { "x-request-id": "clinical-controller-test" },
} as unknown as AuthenticatedInternalRequest;

describe("ProviderClinicalEncounterController validation", () => {
  const service = { open: vi.fn(), saveDraft: vi.fn(), sign: vi.fn() };
  const controller = new ProviderClinicalEncounterController(
    service as unknown as ClinicalEncounterService,
  );

  it("rejects missing or unsafe idempotency keys before the application service", async () => {
    await expect(
      controller.open(
        { appointmentId: "0199a18e-a400-7000-8000-000000000203" },
        "../../unsafe",
        request,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(service.open).not.toHaveBeenCalled();
  });

  it("rejects unversioned, empty, and unknown clinical documentation fields", async () => {
    await expect(
      controller.saveDraft(
        "0199a18e-a400-7000-8000-000000000204",
        {
          documentation: { sections: [] },
          expectedLatestRevision: 0,
          schemaVersion: 1,
          unexpected: "must fail closed",
        },
        "clinical-draft-001",
        request,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it("rejects ambiguous observation payloads", async () => {
    await expect(
      controller.sign(
        "0199a18e-a400-7000-8000-000000000204",
        {
          diagnoses: [{ display: "Synthetic", status: "ACTIVE", type: "PRIMARY" }],
          documentation: {
            sections: [{ code: "plan", text: "Synthetic plan", title: "Plan" }],
          },
          expectedLatestRevision: 0,
          expectedVersion: 1,
          observations: [
            {
              code: "synthetic",
              display: "Synthetic observation",
              numericValue: "1",
              observedAt: new Date().toISOString(),
              textValue: "ambiguous",
              valueType: "QUANTITY",
            },
          ],
          schemaVersion: 1,
        },
        "clinical-sign-001",
        request,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(service.sign).not.toHaveBeenCalled();
  });
});
