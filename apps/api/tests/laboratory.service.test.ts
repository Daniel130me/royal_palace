import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import { LaboratoryService } from "../src/laboratory/application/laboratory.service.js";
import type {
  LaboratoryRepository,
  LaboratoryRequestAccessRecord,
} from "../src/laboratory/domain/laboratory.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function session(
  role: CurrentSession["roles"][number],
  options: { organizationId?: string; principalId?: string } = {},
): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: null,
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships:
      options.organizationId === undefined
        ? []
        : [
            {
              organizationId: options.organizationId,
              organizationType: "LABORATORY",
              roles: [role],
            },
          ],
    principalId: options.principalId ?? createOpaqueId(),
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

function laboratoryRequest(
  overrides: Partial<LaboratoryRequestAccessRecord> = {},
): LaboratoryRequestAccessRecord {
  return {
    appointmentId: createOpaqueId(),
    bookings: [],
    cancelledAt: null,
    clinicalIndication: "Synthetic diagnostic indication",
    completedAt: null,
    createdAt: new Date().toISOString(),
    id: createOpaqueId(),
    orderedAt: new Date().toISOString(),
    patient: { displayName: "Synthetic Patient", id: createOpaqueId() },
    patientPrincipalId: createOpaqueId(),
    practitioner: { displayName: "Synthetic Practitioner", id: createOpaqueId() },
    practitionerPrincipalId: createOpaqueId(),
    priority: "ROUTINE",
    requestNumber: `LAB-${createOpaqueId()}`,
    service: { code: "synthetic-test", id: createOpaqueId(), name: "Synthetic Test" },
    specimenInstructions: null,
    status: "ACTIVE",
    statusHistory: [],
    updatedAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

function createService(repository: Partial<LaboratoryRepository>, enabled = true) {
  return new LaboratoryService(
    repository as LaboratoryRepository,
    new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
    {
      ...testConfig,
      clinicalWorkflow: { mode: enabled ? ("synthetic" as const) : ("disabled" as const) },
    },
  );
}

describe("LaboratoryService", () => {
  it("fails closed outside the qualified synthetic workflow", async () => {
    await expect(
      createService({}, false).get(
        { actor: session("PATIENT"), requestId: "request-disabled" },
        createOpaqueId(),
      ),
    ).rejects.toMatchObject({ code: "clinical_workflow_disabled", status: 503 });
  });

  it("requires a verified practitioner before issuing a request", async () => {
    const principalId = createOpaqueId();
    await expect(
      createService({
        findPractitionerByPrincipal: vi.fn(async () => ({
          id: createOpaqueId(),
          principalId,
          verificationStatus: "PENDING" as const,
        })),
      }).createRequest(
        { actor: session("PROVIDER", { principalId }), requestId: "request-unverified" },
        {
          appointmentId: createOpaqueId(),
          clinicalIndication: "Synthetic indication",
          patientId: createOpaqueId(),
          priority: "ROUTINE",
          serviceId: createOpaqueId(),
        },
      ),
    ).rejects.toMatchObject({ code: "verified_practitioner_required", status: 403 });
  });

  it("does not expose laboratory clinical requests to managers", async () => {
    const current = laboratoryRequest();
    await expect(
      createService({ findById: vi.fn(async () => current) }).get(
        { actor: session("MANAGER"), requestId: "request-manager" },
        current.id,
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });
  });

  it("scopes patient lists and bookings to the authenticated owner", async () => {
    const patientPrincipalId = createOpaqueId();
    const current = laboratoryRequest({ patientPrincipalId });
    const listByPatient = vi.fn<LaboratoryRepository["listByPatient"]>(async () => ({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    }));
    const book = vi.fn<LaboratoryRepository["book"]>(async () => current);
    const service = createService({ book, findById: vi.fn(async () => current), listByPatient });
    const actor = session("PATIENT", { principalId: patientPrincipalId });

    await service.listForPatient({ actor, requestId: "request-list" }, { limit: 25 });
    await service.book({ actor, requestId: "request-book" }, current.id, "laboratory-booking-001", {
      collectionMode: "FACILITY",
      expectedVersion: 1,
      laboratoryOrganizationId: createOpaqueId(),
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(listByPatient).toHaveBeenCalledWith({ limit: 25, patientPrincipalId });
    expect(book).toHaveBeenCalledWith(
      expect.objectContaining({
        patientPrincipalId,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("persists a structured home-collection snapshot and redacts it from practitioners", async () => {
    const patientPrincipalId = createOpaqueId();
    const practitionerPrincipalId = createOpaqueId();
    const organizationId = createOpaqueId();
    const homeCollection = {
      addressLine1: "12 Synthetic Collection Road",
      administrativeArea: "Lagos",
      collectionInstructions: "Call on arrival",
      countryCode: "NG",
      locality: "Ikeja",
      postalCode: "100001",
    };
    const current = laboratoryRequest({
      bookings: [
        {
          acceptedAt: new Date().toISOString(),
          bookingNumber: `LABBOOK-${createOpaqueId()}`,
          cancelledAt: null,
          collectionMode: "HOME",
          completedAt: null,
          homeCollection: { ...homeCollection, addressLine2: null },
          id: createOpaqueId(),
          laboratory: { displayName: "Synthetic Laboratory", id: organizationId },
          processingStartedAt: null,
          resultReadyAt: null,
          sampleCollectedAt: null,
          scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
          status: "CONFIRMED",
          statusHistory: [],
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      ],
      laboratoryOrganizationId: organizationId,
      patientPrincipalId,
      practitionerPrincipalId,
    });
    const book = vi.fn<LaboratoryRepository["book"]>(async () => current);
    const service = createService({ book, findById: vi.fn(async () => current) });

    const patientResult = await service.book(
      { actor: session("PATIENT", { principalId: patientPrincipalId }), requestId: "request-home" },
      current.id,
      "laboratory-home-booking-001",
      {
        collectionMode: "HOME",
        expectedVersion: 1,
        homeCollection,
        laboratoryOrganizationId: organizationId,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    );
    expect(book).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ collectionMode: "HOME", homeCollection }),
      }),
    );
    expect(patientResult.bookings[0]?.homeCollection).toMatchObject(homeCollection);

    const practitionerResult = await service.get(
      {
        actor: session("PROVIDER", { principalId: practitionerPrincipalId }),
        requestId: "request-practitioner",
      },
      current.id,
    );
    expect(practitionerResult.bookings[0]?.collectionMode).toBe("HOME");
    expect(practitionerResult.bookings[0]?.homeCollection).toBeNull();
  });

  it("requires exact laboratory membership and removes consultation linkage", async () => {
    const organizationId = createOpaqueId();
    const current = laboratoryRequest({ laboratoryOrganizationId: organizationId });
    const service = createService({ findById: vi.fn(async () => current) });

    await expect(
      service.get(
        { actor: session("ORGANIZATION_STAFF"), requestId: "request-unassigned" },
        current.id,
      ),
    ).rejects.toMatchObject({ name: "AuthorizationDeniedError" });

    const response = await service.get(
      {
        actor: session("ORGANIZATION_STAFF", { organizationId }),
        requestId: "request-assigned",
      },
      current.id,
    );
    expect(response).not.toHaveProperty("appointmentId");
    expect(response).not.toHaveProperty("statusHistory");
    expect(response).not.toHaveProperty("patientPrincipalId");
  });

  it("scopes cancelled booking detail to the exact laboratory", async () => {
    const organizationId = createOpaqueId();
    const otherOrganizationId = createOpaqueId();
    const bookingId = createOpaqueId();
    const current = laboratoryRequest({
      bookings: [
        {
          acceptedAt: new Date().toISOString(),
          bookingNumber: `LABBOOK-${createOpaqueId()}`,
          cancelledAt: new Date().toISOString(),
          collectionMode: "FACILITY",
          completedAt: null,
          homeCollection: null,
          id: bookingId,
          laboratory: { displayName: "Synthetic Laboratory", id: organizationId },
          processingStartedAt: null,
          resultReadyAt: null,
          sampleCollectedAt: null,
          scheduledAt: null,
          status: "CANCELLED",
          statusHistory: [],
          updatedAt: new Date().toISOString(),
          version: 2,
        },
        {
          acceptedAt: new Date().toISOString(),
          bookingNumber: `LABBOOK-${createOpaqueId()}`,
          cancelledAt: null,
          collectionMode: "FACILITY",
          completedAt: null,
          homeCollection: null,
          id: createOpaqueId(),
          laboratory: { displayName: "Other Laboratory", id: otherOrganizationId },
          processingStartedAt: null,
          resultReadyAt: null,
          sampleCollectedAt: null,
          scheduledAt: null,
          status: "CONFIRMED",
          statusHistory: [],
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      ],
      laboratoryOrganizationId: otherOrganizationId,
    });
    const findByBooking = vi.fn<LaboratoryRepository["findByBooking"]>(async () => current);
    const result = await createService({ findByBooking }).getLaboratoryBooking(
      {
        actor: session("ORGANIZATION_STAFF", { organizationId }),
        requestId: "request-cancelled-booking",
      },
      organizationId,
      bookingId,
    );

    expect(findByBooking).toHaveBeenCalledWith({ bookingId, organizationId });
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]?.laboratory.id).toBe(organizationId);
  });

  it("returns the laboratory's own booking after cancellation", async () => {
    const organizationId = createOpaqueId();
    const bookingId = createOpaqueId();
    const current = laboratoryRequest({
      bookings: [
        {
          acceptedAt: new Date().toISOString(),
          bookingNumber: `LABBOOK-${createOpaqueId()}`,
          cancelledAt: new Date().toISOString(),
          collectionMode: "FACILITY",
          completedAt: null,
          homeCollection: null,
          id: bookingId,
          laboratory: { displayName: "Synthetic Laboratory", id: organizationId },
          processingStartedAt: null,
          resultReadyAt: null,
          sampleCollectedAt: null,
          scheduledAt: null,
          status: "CANCELLED",
          statusHistory: [],
          updatedAt: new Date().toISOString(),
          version: 2,
        },
      ],
    });
    const transitionBooking = vi.fn<LaboratoryRepository["transitionBooking"]>(async () => current);
    const result = await createService({ transitionBooking }).transitionBooking(
      {
        actor: session("ORGANIZATION_STAFF", { organizationId }),
        requestId: "request-cancel-booking",
      },
      organizationId,
      bookingId,
      { expectedVersion: 1, reasonCode: "laboratory_cancelled", toStatus: "CANCELLED" },
    );

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]?.status).toBe("CANCELLED");
  });
});
