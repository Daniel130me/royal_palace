import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AdministrationService } from "../src/administration/application/administration.service.js";
import {
  administrationFilterHash,
  decodeAdministrationCursor,
  encodeAdministrationCursor,
  InvalidAdministrationCursorError,
} from "../src/administration/application/administration-cursor.js";
import type {
  AdministrationRepository,
  TransitionAdminComplaintInput,
} from "../src/administration/domain/administration.types.js";
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

  it("exposes the operations dashboard only to administrators", async () => {
    const getDashboard = vi.fn(async () => emptyDashboard);
    const service = createService({ getDashboard });

    await expect(
      service.getDashboard(context("FINANCE"), { dayFrom, dayTo }),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await expect(service.getDashboard(context("ADMINISTRATOR"), { dayFrom, dayTo })).resolves.toBe(
      emptyDashboard,
    );
    expect(getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ dayFrom: new Date(dayFrom), dayTo: new Date(dayTo) }),
    );
  });

  it("binds complaint filters to pagination and enforces valid status transitions", async () => {
    const listComplaints = vi.fn(async () => emptyComplaints);
    const transitionComplaint = vi.fn(async (input: TransitionAdminComplaintInput) => ({
      complaintNumber: "CMP-000001",
      complainantType: "PATIENT" as const,
      createdAt: dayFrom,
      description: "Delivery was delayed.",
      id: input.complaintId,
      priority: "HIGH" as const,
      resolvedAt: null,
      status: input.status,
      subject: "Delayed order",
      updatedAt: dayTo,
      version: input.expectedVersion + 1,
    }));
    const service = createService({ listComplaints, transitionComplaint });

    await service.listComplaints(context("ADMINISTRATOR"), {
      priority: "HIGH",
      query: "CMP-000001",
      scope: "OPEN",
    });
    await service.transitionComplaint(
      context("ADMINISTRATOR"),
      "0199a18e-a400-7000-8000-000000000299",
      { expectedVersion: 2, status: "RESOLVED" },
    );

    expect(listComplaints).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "HIGH", query: "CMP-000001", scope: "OPEN" }),
    );
    expect(transitionComplaint).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedFromStatuses: ["OPEN", "INVESTIGATING"],
        expectedVersion: 2,
        status: "RESOLVED",
      }),
    );
  });

  it("returns privacy-minimized delivery oversight only to administrators", async () => {
    const listDeliveries = vi.fn(async () => emptyDeliveries);
    const service = createService({ listDeliveries });

    await expect(
      service.listDeliveries(context("SUPPORT"), { scope: "ACTIVE" }),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await expect(
      service.listDeliveries(context("ADMINISTRATOR"), { query: "Lagos", scope: "ACTIVE" }),
    ).resolves.toBe(emptyDeliveries);
    expect(listDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, query: "Lagos", scope: "ACTIVE" }),
    );
  });

  it("keeps practitioner verification administrator-only and server-attributed", async () => {
    const listPractitioners = vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      summary: { all: 0, pending: 0, revoked: 0, suspended: 0, verified: 0 },
    }));
    const transitionPractitioner = vi.fn(async () => null);
    const service = createService({ listPractitioners, transitionPractitioner });

    await expect(
      service.listPractitioners(context("SUPPORT"), { scope: "ALL" }),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
    await service.listPractitioners(context("ADMINISTRATOR"), { scope: "VERIFIED" });
    expect(listPractitioners).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, scope: "VERIFIED" }),
    );

    await expect(
      service.transitionPractitioner(
        context("ADMINISTRATOR"),
        "0199a18e-a400-7000-8000-000000000203",
        { expectedVersion: 1, note: "Credential expired", status: "SUSPENDED" },
      ),
    ).rejects.toMatchObject({ code: "practitioner_conflict", status: 409 });
    expect(transitionPractitioner).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedFromStatuses: ["VERIFIED"],
        expectedVersion: 1,
        status: "SUSPENDED",
      }),
    );
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
    getDashboard: vi.fn(async () => emptyDashboard),
    listAppointments: vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      summary: { all: 0, completed: 0, today: 0, unsuccessful: 0, upcoming: 0 },
    })),
    listAuditEvents: vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    })),
    listComplaints: vi.fn(async () => emptyComplaints),
    listDeliveries: vi.fn(async () => emptyDeliveries),
    listPractitioners: vi.fn(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      summary: { all: 0, pending: 0, revoked: 0, suspended: 0, verified: 0 },
    })),
    getPractitioner: vi.fn(async () => null),
    transitionComplaint: vi.fn(async () => null),
    transitionPractitioner: vi.fn(async () => null),
    ...overrides,
  };
  const authorization = new AuthorizationService(new PolicyEngine(), {
    append: vi.fn(async () => undefined),
  });
  return new AdministrationService(repository, authorization);
}

const emptyDashboard = {
  attention: { expiringCredentials: 0, openComplaints: 0, pendingApplications: 0 },
  counts: {
    activeDeliveries: 0,
    appointmentsToday: 0,
    laboratoryBookings: 0,
    patients: 0,
    verifiedPractitioners: 0,
  },
  paymentVolume: [],
  recentAuditEvents: [],
  recentComplaints: [],
};

const emptyComplaints = {
  data: [],
  pageInfo: { endCursor: null, hasNextPage: false },
  summary: { all: 0, open: 0, resolved: 0, urgent: 0 },
};

const emptyDeliveries = {
  data: [],
  pageInfo: { endCursor: null, hasNextPage: false },
  summary: { active: 0, all: 0, delivered: 0, exception: 0 },
};

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
