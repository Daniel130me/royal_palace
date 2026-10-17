import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AdministrationService } from "../src/administration/application/administration.service.js";
import {
  administrationFilterHash,
  decodeAdministrationCursor,
  encodeAdministrationCursor,
  InvalidAdministrationCursorError,
} from "../src/administration/application/administration-cursor.js";
import type { AdministrationRepository } from "../src/administration/domain/administration.types.js";
import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";

const dayFrom = "2026-10-17T00:00:00.000Z";
const dayTo = "2026-10-18T00:00:00.000Z";

describe("AdministrationService", () => {
  it("authorizes administrators and passes a bounded appointment query", async () => {
    const listAppointments = vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      summary: { all: 0, completed: 0, today: 0, unsuccessful: 0, upcoming: 0 },
    }));
    const service = createService({ listAppointments });

    await service.listAppointments(context("ADMINISTRATOR"), {
      dayFrom,
      dayTo,
      limit: 50,
      query: "Ada",
      scope: "TODAY",
    });

    expect(listAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, query: "Ada", scope: "TODAY" }),
    );
  });

  it("denies finance access to the clinical appointment projection", async () => {
    const service = createService({});
    await expect(
      service.listAppointments(context("FINANCE"), { dayFrom, dayTo, scope: "ALL" }),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("binds cursors to the complete filter set", () => {
    const filters = { dayFrom, dayTo, scope: "ALL" };
    const hash = administrationFilterHash(filters);
    const encoded = encodeAdministrationCursor(
      { id: "0199a18e-a400-7000-8000-000000000203", timestamp: new Date(dayFrom) },
      hash,
    );
    expect(decodeAdministrationCursor(encoded, hash)?.id).toBe(
      "0199a18e-a400-7000-8000-000000000203",
    );
    expect(() =>
      decodeAdministrationCursor(encoded, administrationFilterHash({ ...filters, scope: "TODAY" })),
    ).toThrow(InvalidAdministrationCursorError);
  });
});

function createService(overrides: Partial<AdministrationRepository>): AdministrationService {
  const repository: AdministrationRepository = {
    listAppointments: vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      summary: { all: 0, completed: 0, today: 0, unsuccessful: 0, upcoming: 0 },
    })),
    listAuditEvents: vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    })),
    ...overrides,
  };
  const authorization = new AuthorizationService(new PolicyEngine(), {
    append: vi.fn(async () => undefined),
  });
  return new AdministrationService(repository, authorization);
}

function context(role: PlatformRole) {
  const actor: CurrentSession = {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: "urn:royal-palace:aal2",
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId: "0199a18e-a400-7000-8000-000000000201",
    roles: [role],
    sessionId: "0199a18e-a400-7000-8000-000000000202",
  };
  return { actor, requestId: "administration-test" };
}
