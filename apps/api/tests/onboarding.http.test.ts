import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { CurrentSession, OnboardingApplicationDetail } from "@royal-palace/contracts";
import { createInternalRequestHeaders } from "@royal-palace/security";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedInternalRequestGuard } from "../src/identity/presentation/authenticated-internal-request.guard.js";
import { IdentityService } from "../src/identity/application/identity.service.js";
import { OnboardingService } from "../src/onboarding/application/onboarding.service.js";
import {
  AdminOnboardingController,
  ApplicantOnboardingController,
  SupportOnboardingController,
} from "../src/onboarding/presentation/onboarding.controller.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { SERVICE_CONFIG } from "../src/tokens.js";
import { testConfig } from "./test-config.js";

const principalId = createOpaqueId();
const applicationId = createOpaqueId();
const session: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: null,
  authenticatedAt: "2026-09-30T00:00:00.000Z",
  authenticationMethods: ["pwd"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [],
  principalId,
  roles: ["ADMINISTRATOR"],
  sessionId: createOpaqueId(),
};
const application: OnboardingApplicationDetail = {
  approvedResourceId: null,
  createdAt: "2026-09-30T00:00:00.000Z",
  data: {
    kind: "PATIENT",
    values: {
      countryCode: "GB",
      dateOfBirth: null,
      familyName: "Applicant",
      givenName: "Synthetic",
      phoneE164: null,
      preferredLanguage: null,
    },
  },
  displayName: "Synthetic Applicant",
  documents: [],
  history: [],
  id: applicationId,
  kind: "PATIENT",
  status: "DRAFT",
  submittedAt: null,
  updatedAt: "2026-09-30T00:00:00.000Z",
  version: 1,
};
const onboarding = {
  createApplication: vi.fn(async () => application),
  decide: vi.fn(async () => ({ ...application, status: "APPROVED" })),
  getForReview: vi.fn(async () => application),
  getOwnApplication: vi.fn(async () => application),
  listForReview: vi.fn(async () => ({
    data: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  })),
  listOwnApplications: vi.fn(async () => ({
    data: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  })),
  reserveDocument: vi.fn(),
  startReview: vi.fn(),
  submitOwnApplication: vi.fn(),
  updateOwnApplication: vi.fn(),
  withdrawOwnApplication: vi.fn(),
};
@Module({
  controllers: [
    ApplicantOnboardingController,
    SupportOnboardingController,
    AdminOnboardingController,
  ],
  providers: [
    { provide: OnboardingService, useValue: onboarding },
    { provide: SERVICE_CONFIG, useValue: testConfig },
    { provide: IdentityService, useValue: { currentSession: vi.fn(async () => session) } },
    AuthenticatedInternalRequestGuard,
  ],
})
class OnboardingHttpTestModule {}

describe("onboarding HTTP boundary", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      OnboardingHttpTestModule,
      new FastifyAdapter(),
      { abortOnError: false, logger: false, rawBody: true },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it("validates and delegates an authenticated patient application", async () => {
    const payload = {
      countryCode: "gb",
      dateOfBirth: null,
      familyName: "Applicant",
      givenName: "Synthetic",
      phoneE164: null,
      preferredLanguage: "en-GB",
    };
    const response = await app.inject({
      headers: signedHeaders("POST", "/v1/applications/patients", payload, "request-http-1"),
      method: "POST",
      payload,
      url: "/v1/applications/patients",
    });

    expect(response.statusCode).toBe(201);
    expect(onboarding.createApplication).toHaveBeenCalledWith(
      {
        actor: session,
        correlationId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        requestId: "request-http-1",
      },
      expect.objectContaining({
        kind: "PATIENT",
        values: expect.objectContaining({ countryCode: "GB" }),
      }),
    );
  });

  it("maps an administrator approval command without accepting actor identity in the body", async () => {
    const payload = { expectedVersion: 1, reasonCategory: "ADMIN_VERIFIED" };
    const path = `/v1/admin/applications/${applicationId}/approve`;
    const response = await app.inject({
      headers: signedHeaders("POST", path, payload, "request-http-2"),
      method: "POST",
      payload,
      url: path,
    });

    expect(response.statusCode).toBe(200);
    expect(onboarding.decide).toHaveBeenCalledWith(
      {
        actor: session,
        correlationId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        requestId: "request-http-2",
      },
      applicationId,
      { expectedVersion: 1, reasonCategory: "ADMIN_VERIFIED", toStatus: "APPROVED" },
    );
  });

  it("rejects unknown fields and oversized page requests", async () => {
    const invalidPatient = {
      countryCode: null,
      dateOfBirth: null,
      familyName: "Applicant",
      givenName: "Synthetic",
      phoneE164: null,
      preferredLanguage: null,
      role: "ADMINISTRATOR",
    };
    const responses = await Promise.all([
      app.inject({
        headers: signedHeaders(
          "POST",
          "/v1/applications/patients",
          invalidPatient,
          "request-http-3",
        ),
        method: "POST",
        payload: invalidPatient,
        url: "/v1/applications/patients",
      }),
      app.inject({
        headers: signedHeaders("GET", "/v1/support/applications", undefined, "request-http-4"),
        method: "GET",
        url: "/v1/support/applications?limit=51",
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([400, 400]);
  });
});

function signedHeaders(
  method: string,
  path: string,
  payload: unknown,
  requestId: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    "x-request-id": requestId,
    ...createInternalRequestHeaders(
      {
        body: payload === undefined ? "" : JSON.stringify(payload),
        method,
        path,
        requestId,
        sessionReference: session.sessionId,
      },
      testConfig.identity.bffInternalSecret,
    ),
  };
}
