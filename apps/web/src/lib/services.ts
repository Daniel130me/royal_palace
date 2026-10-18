// Royal Palace Health Care — typed service layer.
// The UI consumes these functions instead of performing raw fetches, so the
// backend can be replaced without touching components (see spec section 58).

import {
  createManagerClient,
  createAdministrationClient,
  createClinicalEncounterClient,
  createLaboratoryClient,
  createLogisticsClient,
  createNotificationClient,
  createOnboardingClient,
  createPublicDiscoveryClient,
  createPrescriptionClient,
  createSchedulingPaymentClient,
  createOrganizationFinanceClient,
  createOrganizationTeamClient,
} from "@royal-palace/api-client";
import type {
  LaboratoryComponents,
  ClinicalEncounterComponents,
  LogisticsComponents,
  OrganizationFinanceComponents,
  OrganizationTeamComponents,
  PrescriptionComponents,
} from "@royal-palace/api-client";
import type {
  OnboardingApplicationDetail,
  OnboardingApplicationListResponse,
  ClinicalCatalogueEntry,
  ClinicalCatalogueListResponse,
  OrganizationApplicationData,
  PatientApplicationData,
  PractitionerApplicationData,
  PublicOrganizationType,
  ManagerProfileResponse,
  ManagerReferralLinkResponse,
  ManagerReferralStatusResponse,
  ManagerEarningsReportResponse,
  ManagerTicketResponse,
  SupportManagerTicketResponse,
  CommissionPolicyResponse,
  ReferralAttributionCorrectionResponse,
  AppointmentResponse,
  ClinicalEncounterResponse,
  HostedCheckoutResponse,
  PaymentStatusResponse,
  PractitionerAvailabilityResponse,
  ServicePriceResponse,
  AdminAppointmentScope,
  AdminComplaintPriority,
  AdminComplaintScope,
  AdminComplaintStatus,
  AdminDeliveryScope,
  AdminPractitionerDetail,
  AdminPractitionerScope,
  PractitionerVerificationStatus,
  PlatformRole,
} from "@royal-palace/contracts";
import {
  api,
  ApiError,
  resource,
  action,
  csrfToken,
  sessionApi,
  type Paginated,
} from "./api-client";
import type {
  Appointment,
  ClinicalEncounter,
  Consent,
  Diagnosis,
  LaboratoryBooking,
  LaboratoryRequest,
  Manager,
  ManagerBankAccount,
  ManagerDashboardSummary,
  ManagerEarning,
  ManagerOrganization,
  ManagerOrganizationApplication,
  ManagerOrganizationDto,
  ManagerRevenueShareRule,
  Notification,
  OrganizationPayment,
  PayoutRequest,
  Patient,
  Payment,
  Pharmacy,
  PharmacyProduct,
  Provider,
  ProviderApplication,
  RecordAccessGrant,
  Referral,
  Service,
  ServicePrice,
  Settlement,
  SupportTicket,
  SupportTicketMessage,
  User,
  CarePlan,
  AuditLog,
  Complaint,
  Laboratory,
  Hospital,
  ProviderVerificationStatus,
  EncounterDocumentation,
} from "@/types";

// --- generic fetchers (deserialize JSON string fields handled by API) ---
export const patientService = {
  list: (params?: Record<string, string>) => resource.list<Patient>("patient", params),
  get: (id: string) => resource.get<Patient>("patient", id),
  byUser: (userId: string) => resource.list<Patient>("patient", { userId }),
  create: (data: Partial<Patient>) => resource.create<Patient>("patient", data),
  update: (id: string, data: Partial<Patient>) => resource.update<Patient>("patient", id, data),
};

export const providerService = {
  list: (params?: Record<string, string>) => resource.list<Provider>("provider", params),
  get: (id: string) => resource.get<Provider>("provider", id),
  update: (id: string, data: Partial<Provider>) => resource.update<Provider>("provider", id, data),
};

export const pharmacyService = {
  list: () => resource.list<Pharmacy>("pharmacy"),
  get: (id: string) => resource.get<Pharmacy>("pharmacy", id),
  update: (id: string, data: Partial<Pharmacy>) => resource.update<Pharmacy>("pharmacy", id, data),
  products: (pharmacyId: string) =>
    resource.list<PharmacyProduct>("pharmacyProduct", { pharmacyId }),
  product: (id: string) => resource.get<PharmacyProduct>("pharmacyProduct", id),
  createProduct: (data: Partial<PharmacyProduct>) =>
    resource.create<PharmacyProduct>("pharmacyProduct", data),
  updateProduct: (id: string, data: Partial<PharmacyProduct>) =>
    resource.update<PharmacyProduct>("pharmacyProduct", id, data),
};

export const laboratoryService = {
  list: () => resource.list<Laboratory>("laboratory"),
  get: (id: string) => resource.get<Laboratory>("laboratory", id),
  requests: (laboratoryId?: string) =>
    resource.list<LaboratoryRequest>("laboratoryRequest", laboratoryId ? { laboratoryId } : {}),
  bookings: (laboratoryId: string) =>
    resource.list<LaboratoryBooking>("laboratoryBooking", { laboratoryId }),
};

export const enrollmentService = {
  submitOrganization: (body: Record<string, unknown>) =>
    api
      .post<{ data: { applicationNumber: string; status: string } }>(
        "/api/actions/submit-manager-enrollment",
        body,
      )
      .then((r) => r.data),
};

export const hospitalService = {
  list: (params?: Record<string, string>) => resource.list<Hospital>("hospital", params),
  get: (id: string) => resource.get<Hospital>("hospital", id),
};

const generatedPublicDiscoveryClient = createPublicDiscoveryClient({});
const generatedOnboardingClient = createOnboardingClient({ fetch: authenticatedGeneratedFetch });
const generatedManagerClient = createManagerClient({ fetch: authenticatedGeneratedFetch });
const generatedLaboratoryClient = createLaboratoryClient({ fetch: versionedBffFetch });
const generatedClinicalEncounterClient = createClinicalEncounterClient({
  fetch: versionedBffFetch,
});
const generatedLogisticsClient = createLogisticsClient({ fetch: versionedBffFetch });
const generatedSchedulingPaymentClient = createSchedulingPaymentClient({
  fetch: authenticatedGeneratedFetch,
});
const generatedPrescriptionClient = createPrescriptionClient({ fetch: versionedBffFetch });
const generatedNotificationClient = createNotificationClient({
  fetch: authenticatedGeneratedFetch,
});
const generatedOrganizationFinanceClient = createOrganizationFinanceClient({
  fetch: versionedBffFetch,
});
const generatedOrganizationTeamClient = createOrganizationTeamClient({ fetch: versionedBffFetch });
const generatedAdministrationClient = createAdministrationClient({
  fetch: authenticatedGeneratedFetch,
});

type LogisticsListInput = {
  cursor?: string;
  limit?: number;
  status?: LogisticsComponents["schemas"]["DeliveryStatus"];
};

export const productionLogisticsService = {
  organization: {
    list: (organizationId: string, input: LogisticsListInput = {}) =>
      generatedLogisticsClient
        .GET("/v1/logistics/deliveries", {
          params: {
            header: { ...requestHeader(), "X-Organization-Id": organizationId },
            query: input,
          },
        })
        .then(unwrapGeneratedResponse),
    get: (organizationId: string, deliveryId: string) =>
      generatedLogisticsClient
        .GET("/v1/logistics/deliveries/{deliveryId}", {
          params: {
            header: { ...requestHeader(), "X-Organization-Id": organizationId },
            path: { deliveryId },
          },
        })
        .then(unwrapGeneratedResponse),
    history: (organizationId: string, deliveryId: string, limit = 100) =>
      generatedLogisticsClient
        .GET("/v1/logistics/deliveries/{deliveryId}/history", {
          params: {
            header: { ...requestHeader(), "X-Organization-Id": organizationId },
            path: { deliveryId },
            query: { limit },
          },
        })
        .then(unwrapGeneratedResponse),
    transition: (
      organizationId: string,
      deliveryId: string,
      body: LogisticsComponents["schemas"]["TransitionDeliveryInput"],
      idempotencyKey: string,
    ) =>
      generatedLogisticsClient
        .POST("/v1/logistics/deliveries/{deliveryId}/transitions", {
          body,
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "X-Organization-Id": organizationId,
            },
            path: { deliveryId },
          },
        })
        .then(unwrapGeneratedResponse),
    verifyRecipientCode: (
      organizationId: string,
      deliveryId: string,
      body: LogisticsComponents["schemas"]["RecipientCodeProofInput"],
      idempotencyKey: string,
    ) =>
      generatedLogisticsClient
        .POST("/v1/logistics/deliveries/{deliveryId}/proof", {
          body,
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "X-Organization-Id": organizationId,
            },
            path: { deliveryId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
  admin: {
    list: (input: LogisticsListInput = {}) =>
      generatedLogisticsClient
        .GET("/v1/admin/logistics/deliveries", {
          params: { query: input },
        })
        .then(unwrapGeneratedResponse),
    get: (deliveryId: string) =>
      generatedLogisticsClient
        .GET("/v1/admin/logistics/deliveries/{deliveryId}", {
          params: { path: { deliveryId } },
        })
        .then(unwrapGeneratedResponse),
    history: (deliveryId: string, limit = 100) =>
      generatedLogisticsClient
        .GET("/v1/admin/logistics/deliveries/{deliveryId}/history", {
          params: { path: { deliveryId }, query: { limit } },
        })
        .then(unwrapGeneratedResponse),
  },
  patient: {
    list: (input: LogisticsListInput = {}) =>
      generatedLogisticsClient
        .GET("/v1/patient/logistics/deliveries", { params: { query: input } })
        .then(unwrapGeneratedResponse),
    get: (deliveryId: string) =>
      generatedLogisticsClient
        .GET("/v1/patient/logistics/deliveries/{deliveryId}", {
          params: { path: { deliveryId } },
        })
        .then(unwrapGeneratedResponse),
  },
  pharmacy: {
    list: (organizationId: string, input: LogisticsListInput = {}) =>
      generatedLogisticsClient
        .GET("/v1/pharmacy/logistics-deliveries", {
          params: {
            header: { ...requestHeader(), "X-Organization-Id": organizationId },
            query: input,
          },
        })
        .then(unwrapGeneratedResponse),
    get: (organizationId: string, deliveryId: string) =>
      generatedLogisticsClient
        .GET("/v1/pharmacy/logistics-deliveries/{deliveryId}", {
          params: {
            header: { ...requestHeader(), "X-Organization-Id": organizationId },
            path: { deliveryId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
};

export const productionOrganizationTeamService = {
  team: (organizationId: string) =>
    generatedOrganizationTeamClient
      .GET("/v1/organization/team", {
        params: { header: { ...financeRequestHeader(), "X-Organization-Id": organizationId } },
      })
      .then(unwrapGeneratedResponse),
  createInvitation: (organizationId: string) =>
    generatedOrganizationTeamClient
      .POST("/v1/organization/team/invitations", {
        params: { header: { ...financeRequestHeader(), "X-Organization-Id": organizationId } },
      })
      .then(unwrapGeneratedResponse),
  revokeInvitation: (
    organizationId: string,
    invitationId: string,
    body: OrganizationTeamComponents["schemas"]["VersionInput"],
  ) =>
    generatedOrganizationTeamClient
      .DELETE("/v1/organization/team/invitations/{invitationId}", {
        body,
        params: {
          header: { ...financeRequestHeader(), "X-Organization-Id": organizationId },
          path: { invitationId },
        },
      })
      .then(unwrapGeneratedResponse),
  deactivateMember: (
    organizationId: string,
    membershipId: string,
    body: OrganizationTeamComponents["schemas"]["VersionInput"],
  ) =>
    generatedOrganizationTeamClient
      .DELETE("/v1/organization/team/members/{membershipId}", {
        body,
        params: {
          header: { ...financeRequestHeader(), "X-Organization-Id": organizationId },
          path: { membershipId },
        },
      })
      .then(unwrapGeneratedResponse),
  acceptInvitation: (token: string) =>
    generatedOrganizationTeamClient
      .POST("/v1/organization/team/invitations/accept", {
        body: { token },
        params: { header: financeRequestHeader() },
      })
      .then(unwrapGeneratedResponse),
};

export const productionOrganizationFinanceService = {
  organization: {
    report: (
      organizationId: string,
      from: string,
      to: string,
      granularity: "DAY" | "MONTH" | "TOTAL" = "MONTH",
    ) =>
      generatedOrganizationFinanceClient
        .GET("/v1/organization/finance/settlements", {
          params: {
            header: { ...financeRequestHeader(), "X-Organization-Id": organizationId },
            query: { from, to, granularity },
          },
        })
        .then(unwrapGeneratedResponse),
    payouts: (organizationId: string) =>
      generatedOrganizationFinanceClient
        .GET("/v1/organization/finance/payouts", {
          params: { header: { ...financeRequestHeader(), "X-Organization-Id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    statements: (organizationId: string) =>
      generatedOrganizationFinanceClient
        .GET("/v1/organization/finance/statements", {
          params: { header: { ...financeRequestHeader(), "X-Organization-Id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    requestPayout: (
      organizationId: string,
      body: OrganizationFinanceComponents["schemas"]["RequestPayoutInput"],
      idempotencyKey: string,
    ) =>
      generatedOrganizationFinanceClient
        .POST("/v1/organization/finance/payouts", {
          body,
          params: {
            header: {
              ...financeRequestHeader(),
              "Idempotency-Key": idempotencyKey,
              "X-Organization-Id": organizationId,
            },
          },
        })
        .then(unwrapGeneratedResponse),
  },
  admin: {
    report: (from: string, to: string, granularity: "DAY" | "MONTH" | "TOTAL" = "MONTH") =>
      generatedOrganizationFinanceClient
        .GET("/v1/admin/finance/settlements", {
          params: { header: financeRequestHeader(), query: { from, to, granularity } },
        })
        .then(unwrapGeneratedResponse),
    payouts: () =>
      generatedOrganizationFinanceClient
        .GET("/v1/admin/finance/payouts", { params: { header: financeRequestHeader() } })
        .then(unwrapGeneratedResponse),
    statements: () =>
      generatedOrganizationFinanceClient
        .GET("/v1/admin/finance/statements", { params: { header: financeRequestHeader() } })
        .then(unwrapGeneratedResponse),
    finalizeStatement: (
      body: OrganizationFinanceComponents["schemas"]["FinalizeStatementInput"],
      idempotencyKey: string,
    ) =>
      generatedOrganizationFinanceClient
        .POST("/v1/admin/finance/statements", {
          body,
          params: {
            header: { ...financeRequestHeader(), "Idempotency-Key": idempotencyKey },
          },
        })
        .then(unwrapGeneratedResponse),
    advancedReport: (from: string, to: string, granularity: "DAY" | "MONTH" | "TOTAL" = "DAY") =>
      generatedOrganizationFinanceClient
        .GET("/v1/admin/finance/reports/summary", {
          params: { header: financeRequestHeader(), query: { from, to, granularity } },
        })
        .then(unwrapGeneratedResponse),
    review: (
      payoutId: string,
      body: OrganizationFinanceComponents["schemas"]["ReviewPayoutInput"],
    ) =>
      generatedOrganizationFinanceClient
        .POST("/v1/admin/finance/payouts/{payoutId}/review", {
          body,
          params: { header: financeRequestHeader(), path: { payoutId } },
        })
        .then(unwrapGeneratedResponse),
    execute: (
      payoutId: string,
      body: OrganizationFinanceComponents["schemas"]["ExecutePayoutInput"],
    ) =>
      generatedOrganizationFinanceClient
        .POST("/v1/admin/finance/payouts/{payoutId}/execute", {
          body,
          params: { header: financeRequestHeader(), path: { payoutId } },
        })
        .then(unwrapGeneratedResponse),
  },
};

export const productionNotificationService = {
  list: (input: { cursor?: string; limit?: number; unreadOnly?: boolean } = {}) =>
    generatedNotificationClient
      .GET("/api/notifications", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  markRead: (itemId: string) =>
    generatedNotificationClient
      .POST("/api/notifications/{itemId}/read", {
        params: { header: csrfHeader(), path: { itemId } },
      })
      .then(unwrapGeneratedResponse),
  markAllRead: (limit = 200) =>
    generatedNotificationClient
      .POST("/api/notifications/read-all", {
        body: { limit },
        params: { header: csrfHeader() },
      })
      .then(unwrapGeneratedResponse),
  preferences: () =>
    generatedNotificationClient.GET("/api/notifications/preferences").then(unwrapGeneratedResponse),
  updateEmailMarketing: (body: { enabled: boolean; expectedVersion: number }) =>
    generatedNotificationClient
      .PATCH("/api/notifications/preferences/email/marketing", {
        body,
        params: { header: csrfHeader() },
      })
      .then(unwrapGeneratedResponse),
};

export const productionLaboratoryService = {
  admin: {
    reviewComments: (
      status: "PENDING" | "PUBLISHED" | "HIDDEN" = "PENDING",
      cursor?: string,
      limit = 25,
    ) =>
      generatedLaboratoryClient
        .GET("/v1/admin/review-comments", {
          params: { header: requestHeader(), query: { cursor, limit, status } },
        })
        .then(unwrapGeneratedResponse),
    moderateReviewComment: (
      reviewId: string,
      body: LaboratoryComponents["schemas"]["ModerateLaboratoryReviewCommentInput"],
    ) =>
      generatedLaboratoryClient
        .POST("/v1/admin/review-comments/{reviewId}/decision", {
          body,
          params: { header: requestHeader(), path: { reviewId } },
        })
        .then(unwrapGeneratedResponse),
  },
  provider: {
    list: (patientId?: string, cursor?: string, limit = 25) =>
      generatedLaboratoryClient
        .GET("/v1/provider/laboratory-requests", {
          params: { header: requestHeader(), query: { cursor, limit, patientId } },
        })
        .then(unwrapGeneratedResponse),
    create: (body: LaboratoryComponents["schemas"]["CreateLaboratoryRequestInput"]) =>
      generatedLaboratoryClient
        .POST("/v1/provider/laboratory-requests", {
          body,
          params: { header: requestHeader() },
        })
        .then(unwrapGeneratedResponse),
    results: (cursor?: string, limit = 25, patientId?: string) =>
      generatedLaboratoryClient
        .GET("/v1/provider/laboratory-results", {
          params: { header: requestHeader(), query: { cursor, limit, patientId } },
        })
        .then(unwrapGeneratedResponse),
    result: (resultId: string) =>
      generatedLaboratoryClient
        .GET("/v1/provider/laboratory-results/{resultId}", {
          params: { header: requestHeader(), path: { resultId } },
        })
        .then(unwrapGeneratedResponse),
    criticalResults: (cursor?: string, limit = 25) =>
      generatedLaboratoryClient
        .GET("/v1/provider/laboratory-critical-results", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    acknowledgeCriticalResult: (criticalResultId: string, expectedVersion: number) =>
      generatedLaboratoryClient
        .POST("/v1/provider/laboratory-critical-results/{criticalResultId}/acknowledgements", {
          body: { expectedVersion },
          params: { header: requestHeader(), path: { criticalResultId } },
        })
        .then(unwrapGeneratedResponse),
    resultAttachmentDownload: (resultId: string, attachmentId: string) =>
      generatedLaboratoryClient
        .GET("/v1/provider/laboratory-results/{resultId}/attachments/{attachmentId}/download", {
          params: { header: requestHeader(), path: { attachmentId, resultId } },
        })
        .then(unwrapGeneratedResponse),
  },
  patient: {
    list: (cursor?: string, limit = 25) =>
      generatedLaboratoryClient
        .GET("/v1/patient/laboratory-requests", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    results: (cursor?: string, limit = 25) =>
      generatedLaboratoryClient
        .GET("/v1/patient/laboratory-results", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    reviews: (limit = 25) =>
      generatedLaboratoryClient
        .GET("/v1/patient/laboratory-reviews", {
          params: { header: requestHeader(), query: { limit } },
        })
        .then(unwrapGeneratedResponse),
    submitReview: (
      bookingId: string,
      body: LaboratoryComponents["schemas"]["SubmitLaboratoryReviewInput"],
    ) =>
      generatedLaboratoryClient
        .POST("/v1/patient/laboratory-bookings/{bookingId}/reviews", {
          body,
          params: { header: requestHeader(), path: { bookingId } },
        })
        .then(unwrapGeneratedResponse),
    result: (resultId: string) =>
      generatedLaboratoryClient
        .GET("/v1/patient/laboratory-results/{resultId}", {
          params: { header: requestHeader(), path: { resultId } },
        })
        .then(unwrapGeneratedResponse),
    resultAttachmentDownload: (resultId: string, attachmentId: string) =>
      generatedLaboratoryClient
        .GET("/v1/patient/laboratory-results/{resultId}/attachments/{attachmentId}/download", {
          params: { header: requestHeader(), path: { attachmentId, resultId } },
        })
        .then(unwrapGeneratedResponse),
    book: (
      requestId: string,
      body: LaboratoryComponents["schemas"]["BookLaboratoryRequestInput"],
      idempotencyKey: string,
    ) =>
      generatedLaboratoryClient
        .POST("/v1/patient/laboratory-requests/{requestId}/bookings", {
          body,
          params: {
            header: { ...requestHeader(), "Idempotency-Key": idempotencyKey },
            path: { requestId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
  laboratory: {
    workspace: (organizationId: string) =>
      generatedLaboratoryClient
        .GET("/v1/laboratory/workspace", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
          },
        })
        .then(unwrapGeneratedResponse),
    list: (
      organizationId: string,
      status?: LaboratoryComponents["schemas"]["LaboratoryBookingStatus"],
      cursor?: string,
      limit = 25,
    ) =>
      generatedLaboratoryClient
        .GET("/v1/laboratory/bookings", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { cursor, limit, status },
          },
        })
        .then(unwrapGeneratedResponse),
    getBooking: (organizationId: string, bookingId: string) =>
      generatedLaboratoryClient
        .GET("/v1/laboratory/bookings/{bookingId}", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { bookingId },
          },
        })
        .then(unwrapGeneratedResponse),
    transition: (
      organizationId: string,
      bookingId: string,
      body: LaboratoryComponents["schemas"]["TransitionLaboratoryBookingInput"],
    ) =>
      generatedLaboratoryClient
        .POST("/v1/laboratory/bookings/{bookingId}/transitions", {
          body,
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { bookingId },
          },
        })
        .then(unwrapGeneratedResponse),
    results: (
      organizationId: string,
      status?: LaboratoryComponents["schemas"]["LaboratoryResultStatus"],
      cursor?: string,
      limit = 25,
    ) =>
      generatedLaboratoryClient
        .GET("/v1/laboratory/results", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { cursor, limit, status },
          },
        })
        .then(unwrapGeneratedResponse),
    result: (organizationId: string, resultId: string) =>
      generatedLaboratoryClient
        .GET("/v1/laboratory/results/{resultId}", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { resultId },
          },
        })
        .then(unwrapGeneratedResponse),
    createResult: (
      organizationId: string,
      body: LaboratoryComponents["schemas"]["CreateLaboratoryResultInput"],
      idempotencyKey = crypto.randomUUID(),
    ) =>
      generatedLaboratoryClient
        .POST("/v1/laboratory/results", {
          body,
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "x-organization-id": organizationId,
            },
          },
        })
        .then(unwrapGeneratedResponse),
    transitionResultReview: (
      organizationId: string,
      resultId: string,
      body: LaboratoryComponents["schemas"]["TransitionLaboratoryResultInput"],
    ) =>
      generatedLaboratoryClient
        .POST("/v1/laboratory/results/{resultId}/review-transitions", {
          body,
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { resultId },
          },
        })
        .then(unwrapGeneratedResponse),
    publishResult: (organizationId: string, resultId: string, expectedVersion: number) =>
      generatedLaboratoryClient
        .POST("/v1/laboratory/results/{resultId}/publications", {
          body: { expectedVersion },
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { resultId },
          },
        })
        .then(unwrapGeneratedResponse),
    uploadResultAttachment: async (
      organizationId: string,
      resultId: string,
      file: File,
      purpose = "laboratory_report",
    ) => {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const declaredSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const intent = await generatedLaboratoryClient
        .POST("/v1/laboratory/results/{resultId}/attachment-upload-intents", {
          body: {
            declaredContentType:
              file.type as LaboratoryComponents["schemas"]["CreateLaboratoryResultAttachmentInput"]["declaredContentType"],
            declaredSha256,
            declaredSizeBytes: file.size,
            originalFilename: file.name,
            purpose,
          },
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { resultId },
          },
        })
        .then(unwrapGeneratedResponse);
      const upload = await fetch(intent.upload.url, {
        body: file,
        credentials: "omit",
        headers: intent.upload.headers,
        method: "PUT",
        mode: "cors",
        referrerPolicy: "no-referrer",
      });
      if (!upload.ok) throw new Error("The result attachment could not be uploaded");
      await generatedLaboratoryClient
        .POST("/v1/laboratory/results/{resultId}/attachments/{attachmentId}/complete", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { attachmentId: intent.attachmentId, resultId },
          },
        })
        .then(unwrapGeneratedResponse);
      return intent.attachmentId;
    },
    resultAttachmentDownload: (organizationId: string, resultId: string, attachmentId: string) =>
      generatedLaboratoryClient
        .GET("/v1/laboratory/results/{resultId}/attachments/{attachmentId}/download", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { attachmentId, resultId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
};

export const productionPrescriptionService = {
  provider: {
    list: (patientId?: string, cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/provider/prescriptions", {
          params: { header: requestHeader(), query: { cursor, limit, patientId } },
        })
        .then(unwrapGeneratedResponse),
    createDraft: (body: PrescriptionComponents["schemas"]["PrescriptionDraftInput"]) =>
      generatedPrescriptionClient
        .POST("/v1/provider/prescriptions", { body, params: { header: requestHeader() } })
        .then(unwrapGeneratedResponse),
    sign: (prescriptionId: string, expectedVersion: number, validUntil: string) =>
      generatedPrescriptionClient
        .POST("/v1/provider/prescriptions/{prescriptionId}/sign", {
          body: { expectedVersion, validUntil },
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
  },
  patient: {
    scannedPrescriptions: (cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/patient/scanned-prescriptions", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    scannedPrescription: (prescriptionId: string) =>
      generatedPrescriptionClient
        .GET("/v1/patient/scanned-prescriptions/{prescriptionId}", {
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
    createScannedPrescriptionUpload: (
      body: PrescriptionComponents["schemas"]["CreateScannedPrescriptionUploadInput"],
    ) =>
      generatedPrescriptionClient
        .POST("/v1/patient/scanned-prescriptions/upload-intents", {
          body,
          params: { header: requestHeader() },
        })
        .then(unwrapGeneratedResponse),
    completeScannedPrescriptionUpload: (prescriptionId: string) =>
      generatedPrescriptionClient
        .POST("/v1/patient/scanned-prescriptions/{prescriptionId}/complete", {
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
    scannedPrescriptionDownload: (prescriptionId: string) =>
      generatedPrescriptionClient
        .GET("/v1/patient/scanned-prescriptions/{prescriptionId}/download", {
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
    pharmacyCatalogItems: (
      pharmacyOrganizationId: string,
      q?: string,
      cursor?: string,
      limit = 50,
    ) =>
      generatedPrescriptionClient
        .GET("/v1/patient/pharmacy/pharmacies/{pharmacyOrganizationId}/catalog-items", {
          params: {
            header: requestHeader(),
            path: { pharmacyOrganizationId },
            query: { cursor, limit, q },
          },
        })
        .then(unwrapGeneratedResponse),
    createDirectQuote: (
      pharmacyOrganizationId: string,
      body: PrescriptionComponents["schemas"]["CreateDirectPharmacyQuoteInput"],
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/patient/pharmacy/pharmacies/{pharmacyOrganizationId}/quotes", {
          body,
          params: {
            header: { ...requestHeader(), "Idempotency-Key": idempotencyKey },
            path: { pharmacyOrganizationId },
          },
        })
        .then(unwrapGeneratedResponse),
    list: (cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/patient/prescriptions", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    get: (prescriptionId: string) =>
      generatedPrescriptionClient
        .GET("/v1/prescriptions/{prescriptionId}", {
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
    send: (prescriptionId: string, pharmacyOrganizationId: string, expectedVersion: number) =>
      generatedPrescriptionClient
        .POST("/v1/patient/prescriptions/{prescriptionId}/send", {
          body: { expectedVersion, pharmacyOrganizationId },
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
    quotes: (cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/patient/pharmacy/quotes", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    acceptQuote: (quoteId: string, expectedVersion: number, idempotencyKey: string) =>
      generatedPrescriptionClient
        .POST("/v1/patient/pharmacy/quotes/{quoteId}/accept", {
          body: { expectedVersion },
          params: {
            header: { ...requestHeader(), "Idempotency-Key": idempotencyKey },
            path: { quoteId },
          },
        })
        .then(unwrapGeneratedResponse),
    orders: (cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/patient/pharmacy/orders", {
          params: { header: requestHeader(), query: { cursor, limit } },
        })
        .then(unwrapGeneratedResponse),
    order: (orderId: string) =>
      generatedPrescriptionClient
        .GET("/v1/patient/pharmacy/orders/{orderId}", {
          params: { header: requestHeader(), path: { orderId } },
        })
        .then(unwrapGeneratedResponse),
    cancelOrder: (
      orderId: string,
      expectedVersion: number,
      reasonCode: string,
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/patient/pharmacy/orders/{orderId}/cancel", {
          body: { expectedVersion, reasonCode },
          params: {
            header: { ...requestHeader(), "Idempotency-Key": idempotencyKey },
            path: { orderId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
  pharmacy: {
    settings: (organizationId: string) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/settings", {
          params: { header: { ...requestHeader(), "x-organization-id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    updateSettings: (
      organizationId: string,
      body: PrescriptionComponents["schemas"]["UpdatePharmacyOperationalSettingsInput"],
    ) =>
      generatedPrescriptionClient
        .PATCH("/v1/pharmacy/settings", {
          body,
          params: { header: { ...requestHeader(), "x-organization-id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    catalogItems: (
      organizationId: string,
      input: {
        categoryId?: string;
        cursor?: string;
        limit?: number;
        q?: string;
        status?: "ACTIVE" | "INACTIVE";
      } = {},
    ) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/catalog-items", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: input,
          },
        })
        .then(unwrapGeneratedResponse),
    catalogItem: (organizationId: string, catalogItemId: string) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/catalog-items/{catalogItemId}", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { catalogItemId },
          },
        })
        .then(unwrapGeneratedResponse),
    createCatalogItem: (
      organizationId: string,
      body: PrescriptionComponents["schemas"]["CreatePharmacyCatalogItemInput"],
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/catalog-items", {
          body,
          params: { header: { ...requestHeader(), "x-organization-id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    updateCatalogItem: (
      organizationId: string,
      catalogItemId: string,
      body: PrescriptionComponents["schemas"]["UpdatePharmacyCatalogItemInput"],
    ) =>
      generatedPrescriptionClient
        .PATCH("/v1/pharmacy/catalog-items/{catalogItemId}", {
          body,
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { catalogItemId },
          },
        })
        .then(unwrapGeneratedResponse),
    productClassifications: (organizationId: string, kind: "CATEGORY" | "DOSAGE_FORM") =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/product-classifications", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { kind },
          },
        })
        .then(unwrapGeneratedResponse),
    inventoryLocations: (organizationId: string, status?: "ACTIVE" | "INACTIVE") =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/inventory/locations", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { status },
          },
        })
        .then(unwrapGeneratedResponse),
    createInventoryLocation: (
      organizationId: string,
      body: PrescriptionComponents["schemas"]["CreateInventoryLocationInput"],
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/inventory/locations", {
          body,
          params: { header: { ...requestHeader(), "x-organization-id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    inventoryMovements: (
      organizationId: string,
      input: { catalogItemId?: string; cursor?: string; limit?: number; lotId?: string } = {},
    ) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/inventory/movements", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: input,
          },
        })
        .then(unwrapGeneratedResponse),
    inventoryLots: (
      organizationId: string,
      input: {
        catalogItemId?: string;
        cursor?: string;
        limit?: number;
        status?: "AVAILABLE" | "QUARANTINED" | "DEPLETED" | "EXPIRED" | "RECALLED";
      } = {},
    ) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/inventory/lots", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: input,
          },
        })
        .then(unwrapGeneratedResponse),
    recordInventoryMovement: (
      organizationId: string,
      body: PrescriptionComponents["schemas"]["RecordInventoryMovementInput"],
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/inventory/movements", {
          body,
          params: { header: { ...requestHeader(), "x-organization-id": organizationId } },
        })
        .then(unwrapGeneratedResponse),
    prescription: (prescriptionId: string) =>
      generatedPrescriptionClient
        .GET("/v1/prescriptions/{prescriptionId}", {
          params: { header: requestHeader(), path: { prescriptionId } },
        })
        .then(unwrapGeneratedResponse),
    prescriptions: (organizationId: string, cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/prescriptions", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { cursor, limit },
          },
        })
        .then(unwrapGeneratedResponse),
    scannedPrescriptions: (organizationId: string, cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/scanned-prescriptions", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { cursor, limit },
          },
        })
        .then(unwrapGeneratedResponse),
    scannedPrescription: (organizationId: string, prescriptionId: string) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/scanned-prescriptions/{prescriptionId}", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { prescriptionId },
          },
        })
        .then(unwrapGeneratedResponse),
    downloadScannedPrescription: (organizationId: string, prescriptionId: string) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/scanned-prescriptions/{prescriptionId}/download", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { prescriptionId },
          },
        })
        .then(unwrapGeneratedResponse),
    transitionScannedPrescription: (
      organizationId: string,
      prescriptionId: string,
      action: "start-review" | "request-information" | "approve" | "reject",
      body: PrescriptionComponents["schemas"]["ScannedPrescriptionReviewInput"],
    ) => {
      const path = `/v1/pharmacy/scanned-prescriptions/{prescriptionId}/${action}` as const;
      return generatedPrescriptionClient
        .POST(path, {
          body,
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { prescriptionId },
          },
        })
        .then(unwrapGeneratedResponse);
    },
    createScannedPrescriptionQuote: (
      organizationId: string,
      prescriptionId: string,
      body: PrescriptionComponents["schemas"]["CreateDirectPharmacyQuoteInput"],
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/scanned-prescriptions/{prescriptionId}/quotes", {
          body,
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "x-organization-id": organizationId,
            },
            path: { prescriptionId },
          },
        })
        .then(unwrapGeneratedResponse),
    acceptPrescription: (organizationId: string, prescriptionId: string, expectedVersion: number) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/prescriptions/{prescriptionId}/accept", {
          body: { expectedVersion },
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            path: { prescriptionId },
          },
        })
        .then(unwrapGeneratedResponse),
    createQuote: (
      organizationId: string,
      prescriptionId: string,
      body: PrescriptionComponents["schemas"]["CreatePharmacyQuoteInput"],
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/prescriptions/{prescriptionId}/quotes", {
          body,
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "x-organization-id": organizationId,
            },
            path: { prescriptionId },
          },
        })
        .then(unwrapGeneratedResponse),
    quotes: (organizationId: string, cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/quotes", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { cursor, limit },
          },
        })
        .then(unwrapGeneratedResponse),
    orders: (organizationId: string, cursor?: string, limit = 25) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/orders", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: { cursor, limit },
          },
        })
        .then(unwrapGeneratedResponse),
    deliveries: (
      organizationId: string,
      input: {
        cursor?: string;
        limit?: number;
        status?: "READY" | "HANDED_OFF" | "CANCELLED";
      } = {},
    ) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/deliveries", {
          params: {
            header: { ...requestHeader(), "x-organization-id": organizationId },
            query: input,
          },
        })
        .then(unwrapGeneratedResponse),
    order: (orderId: string) =>
      generatedPrescriptionClient
        .GET("/v1/pharmacy/orders/{orderId}", {
          params: { header: requestHeader(), path: { orderId } },
        })
        .then(unwrapGeneratedResponse),
    prepareHandoff: (
      organizationId: string,
      orderId: string,
      body: { expectedOrderVersion: number; method: "PICKUP" | "DELIVERY" },
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/orders/{orderId}/handoff", {
          body,
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "x-organization-id": organizationId,
            },
            path: { orderId },
          },
        })
        .then(unwrapGeneratedResponse),
    completeHandoff: (
      organizationId: string,
      orderId: string,
      expectedHandoffVersion: number,
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/pharmacy/orders/{orderId}/handoff/complete", {
          body: { expectedHandoffVersion },
          params: {
            header: {
              ...requestHeader(),
              "Idempotency-Key": idempotencyKey,
              "x-organization-id": organizationId,
            },
            path: { orderId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
  admin: {
    orders: (
      input: {
        cursor?: string;
        limit?: number;
        orderNumberPrefix?: string;
        pharmacyOrganizationId?: string;
        status?: PrescriptionComponents["schemas"]["PharmacyOrderStatus"];
      } = {},
    ) =>
      generatedPrescriptionClient
        .GET("/v1/admin/pharmacy/orders", {
          params: { header: requestHeader(), query: input },
        })
        .then(unwrapGeneratedResponse),
    order: (orderId: string) =>
      generatedPrescriptionClient
        .GET("/v1/admin/pharmacy/orders/{orderId}", {
          params: { header: requestHeader(), path: { orderId } },
        })
        .then(unwrapGeneratedResponse),
    requestDispute: (
      orderId: string,
      expectedVersion: number,
      reasonCode: string,
      idempotencyKey: string,
    ) =>
      generatedPrescriptionClient
        .POST("/v1/admin/pharmacy/orders/{orderId}/disputes", {
          body: { expectedVersion, reasonCode },
          params: {
            header: { ...requestHeader(), "Idempotency-Key": idempotencyKey },
            path: { orderId },
          },
        })
        .then(unwrapGeneratedResponse),
  },
};

export const onboardingService = {
  listOwn: () => generatedOnboardingClient.GET("/api/applications").then(unwrapGeneratedResponse),
  createPatient: (values: PatientApplicationData, referralToken?: string) =>
    generatedOnboardingClient
      .POST("/api/applications/patients", {
        body: { ...values, ...(referralToken === undefined ? {} : { referralToken }) },
        params: { header: { "x-rp-csrf-token": csrfToken() ?? "" } },
      })
      .then(unwrapGeneratedResponse),
  createOrganization: (values: OrganizationApplicationData, referralToken?: string) =>
    generatedOnboardingClient
      .POST("/api/applications/organizations", {
        body: {
          ...values,
          serviceIds: [...values.serviceIds],
          ...(referralToken === undefined ? {} : { referralToken }),
        },
        params: { header: { "x-rp-csrf-token": csrfToken() ?? "" } },
      })
      .then(unwrapGeneratedResponse),
  updateOrganization: (
    applicationId: string,
    expectedVersion: number,
    values: OrganizationApplicationData,
  ) =>
    generatedOnboardingClient
      .PATCH("/api/applications/organizations/{applicationId}", {
        body: { expectedVersion, values: { ...values, serviceIds: [...values.serviceIds] } },
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { applicationId },
        },
      })
      .then(unwrapGeneratedResponse),
  createPractitioner: (values: PractitionerApplicationData) =>
    generatedOnboardingClient
      .POST("/api/applications/practitioners", {
        body: {
          ...values,
          professionIds: [...values.professionIds],
          specialtyIds: [...values.specialtyIds],
        },
        params: { header: { "x-rp-csrf-token": csrfToken() ?? "" } },
      })
      .then(unwrapGeneratedResponse),
  updatePractitioner: (
    applicationId: string,
    expectedVersion: number,
    values: PractitionerApplicationData,
  ) =>
    generatedOnboardingClient
      .PATCH("/api/applications/practitioners/{applicationId}", {
        body: {
          expectedVersion,
          values: {
            ...values,
            professionIds: [...values.professionIds],
            specialtyIds: [...values.specialtyIds],
          },
        },
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { applicationId },
        },
      })
      .then(unwrapGeneratedResponse),
  submit: (applicationId: string, expectedVersion: number) =>
    generatedOnboardingClient
      .POST("/api/applications/{applicationId}/submit", {
        body: { expectedVersion },
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { applicationId },
        },
      })
      .then(unwrapGeneratedResponse),
  uploadDocument: async (applicationId: string, file: File, purpose: string) => {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const declaredSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const intent = await generatedOnboardingClient
      .POST("/api/applications/{applicationId}/documents/upload-intents", {
        body: {
          declaredContentType: file.type,
          declaredSha256,
          declaredSizeBytes: file.size,
          originalFilename: file.name,
          purpose,
        },
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { applicationId },
        },
      })
      .then(unwrapGeneratedResponse);
    const upload = await fetch(intent.upload.url, {
      body: file,
      credentials: "omit",
      headers: intent.upload.headers,
      method: "PUT",
      mode: "cors",
      referrerPolicy: "no-referrer",
    });
    if (!upload.ok) throw new Error("The document could not be uploaded. Please retry.");
    await generatedOnboardingClient
      .POST("/api/applications/{applicationId}/documents/{documentId}/complete", {
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { applicationId, documentId: intent.document.id },
        },
      })
      .then(unwrapGeneratedResponse);
    return intent.document.id;
  },
  downloadForReview: (authority: "admin" | "support", applicationId: string, documentId: string) =>
    sessionApi.get<{ url: string; expiresAt: string }>(
      `/api/${authority}/applications/${applicationId}/documents/${documentId}/download`,
    ),
  listForSupport: (cursor?: string) => listApplicationReviewQueue("support", cursor),
  getForSupport: (applicationId: string) =>
    sessionApi.get<OnboardingApplicationDetail>(`/api/support/applications/${applicationId}`),
  startReview: (applicationId: string, expectedVersion: number) =>
    sessionApi.post<OnboardingApplicationDetail>(
      `/api/support/applications/${applicationId}/start-review`,
      { expectedVersion },
    ),
  listForAdmin: (
    cursor?: string,
    filters?: { kind?: "PATIENT" | "ORGANIZATION" | "PRACTITIONER"; status?: string },
  ) => listApplicationReviewQueue("admin", cursor, filters),
  getForAdmin: (applicationId: string) =>
    sessionApi.get<OnboardingApplicationDetail>(`/api/admin/applications/${applicationId}`),
  decide: (
    applicationId: string,
    command: "approve" | "reject" | "request-information",
    input: { expectedVersion: number; note?: string; reasonCategory: string },
  ) =>
    sessionApi.post<OnboardingApplicationDetail>(
      `/api/admin/applications/${applicationId}/${command}`,
      input,
    ),
};

function listApplicationReviewQueue(
  authority: "admin" | "support",
  cursor?: string,
  filters?: { kind?: "PATIENT" | "ORGANIZATION" | "PRACTITIONER"; status?: string },
) {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor !== undefined) query.set("cursor", cursor);
  if (filters?.kind !== undefined) query.set("kind", filters.kind);
  if (filters?.status !== undefined) query.set("status", filters.status);
  return sessionApi.get<OnboardingApplicationListResponse>(
    `/api/${authority}/applications?${query.toString()}`,
  );
}

export const clinicalCatalogueService = {
  list: (kind: "professions" | "specialties", cursor?: string) => {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    return sessionApi.get<ClinicalCatalogueListResponse>(
      `/api/admin/catalogue/${kind}?${query.toString()}`,
    );
  },
  create: (
    kind: "professions" | "specialties",
    input: {
      category?: string;
      code: string;
      description: string | null;
      name: string;
      parentId?: string | null;
      sourceUri: string | null;
    },
  ) => sessionApi.post<ClinicalCatalogueEntry>(`/api/admin/catalogue/${kind}`, input),
  update: (
    kind: "professions" | "specialties",
    entry: ClinicalCatalogueEntry,
    status: "ACTIVE" | "INACTIVE",
  ) =>
    sessionApi.patch<ClinicalCatalogueEntry>(`/api/admin/catalogue/${kind}/${entry.id}`, {
      ...(entry.category === null ? {} : { category: entry.category }),
      description: entry.description,
      expectedVersion: entry.version,
      name: entry.name,
      ...(entry.parentId === null ? {} : { parentId: entry.parentId }),
      status,
    }),
};

async function authenticatedGeneratedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    const token = csrfToken();
    if (token !== undefined) {
      const headers = new Headers(request.headers);
      headers.set("x-rp-csrf-token", decodeURIComponent(token));
      return fetch(new Request(request, { headers }));
    }
  }
  return fetch(request);
}

function csrfHeader() {
  return { "x-rp-csrf-token": csrfToken() ?? "" };
}

function requestHeader() {
  return { ...csrfHeader(), "x-request-id": crypto.randomUUID() };
}

function financeRequestHeader() {
  return { ...csrfHeader(), "X-Request-Id": crypto.randomUUID() };
}

function versionedBffFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const source = input instanceof Request ? input.url : String(input);
  const url = new URL(
    source,
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  );
  if (!url.pathname.startsWith("/v1/")) throw new Error("Versioned API client path is invalid");
  url.pathname = `/api/${url.pathname.slice(4)}`;
  const target = `${url.pathname}${url.search}`;
  return authenticatedGeneratedFetch(
    input instanceof Request ? new Request(target, input) : target,
    input instanceof Request ? undefined : init,
  );
}

type PublicOrganizationQuery = {
  country?: string;
  cursor?: string;
  emergencyAvailable?: boolean;
  limit?: number;
  location?: string;
  openTwentyFourHours?: boolean;
  q?: string;
  service?: string;
};

function listPublicOrganizations(
  resourceName: "hospitals" | "pharmacies" | "laboratories",
  params: PublicOrganizationQuery,
  signal?: AbortSignal,
) {
  if (resourceName === "hospitals") {
    return generatedPublicDiscoveryClient
      .GET("/api/public/hospitals", { params: { query: params }, signal })
      .then(unwrapGeneratedResponse);
  }
  if (resourceName === "pharmacies") {
    return generatedPublicDiscoveryClient
      .GET("/api/public/pharmacies", { params: { query: params }, signal })
      .then(unwrapGeneratedResponse);
  }
  return generatedPublicDiscoveryClient
    .GET("/api/public/laboratories", { params: { query: params }, signal })
    .then(unwrapGeneratedResponse);
}

export const publicDiscoveryService = {
  organizations: listPublicOrganizations,
  prices: (params: { cursor?: string; limit?: number } = {}, signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/prices", { params: { query: params }, signal })
      .then(unwrapGeneratedResponse),
  supportConfig: (signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/support-config", { signal })
      .then(unwrapGeneratedResponse),
  hospitals: (params: PublicOrganizationQuery, signal?: AbortSignal) =>
    listPublicOrganizations("hospitals", params, signal),
  pharmacies: (params: PublicOrganizationQuery, signal?: AbortSignal) =>
    listPublicOrganizations("pharmacies", params, signal),
  laboratories: (params: PublicOrganizationQuery, signal?: AbortSignal) =>
    listPublicOrganizations("laboratories", params, signal),
  hospital: (id: string, signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/hospitals/{organizationId}", {
        params: { path: { organizationId: id } },
        signal,
      })
      .then(unwrapGeneratedResponse),
  services: (organizationType: PublicOrganizationType = "HOSPITAL", signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/services", { params: { query: { organizationType } }, signal })
      .then(unwrapGeneratedResponse),
  professions: (signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/professions", { signal })
      .then(unwrapGeneratedResponse),
  specialties: (signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/specialties", { signal })
      .then(unwrapGeneratedResponse),
  practitioners: (
    params: {
      country?: string;
      cursor?: string;
      language?: string;
      limit?: number;
      location?: string;
      mode?: "VIDEO" | "AUDIO" | "CHAT" | "IN_PERSON" | "HOME_VISIT";
      profession?: string;
      q?: string;
      specialty?: string;
    },
    signal?: AbortSignal,
  ) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/practitioners", { params: { query: params }, signal })
      .then(unwrapGeneratedResponse),
  practitioner: (id: string, signal?: AbortSignal) =>
    generatedPublicDiscoveryClient
      .GET("/api/public/practitioners/{practitionerId}", {
        params: { path: { practitionerId: id } },
        signal,
      })
      .then(unwrapGeneratedResponse),
};

export const schedulingPaymentService = {
  availability: (practitionerId: string, from: string, to: string, signal?: AbortSignal) =>
    generatedSchedulingPaymentClient
      .GET("/api/public/practitioners/{practitionerId}/availability", {
        params: { path: { practitionerId }, query: { from, to } },
        signal,
      })
      .then(unwrapGeneratedResponse),
  book: (availabilitySlotId: string, idempotencyKey: string) =>
    generatedSchedulingPaymentClient
      .POST("/api/appointments", {
        body: { availabilitySlotId },
        params: {
          header: {
            "idempotency-key": idempotencyKey,
            "x-rp-csrf-token": csrfToken() ?? "",
          },
        },
      })
      .then(unwrapGeneratedResponse),
  appointment: (appointmentId: string, signal?: AbortSignal) =>
    generatedSchedulingPaymentClient
      .GET("/api/appointments/{appointmentId}", {
        params: { path: { appointmentId } },
        signal,
      })
      .then(unwrapGeneratedResponse),
  createCheckout: (paymentId: string, idempotencyKey: string) =>
    generatedSchedulingPaymentClient
      .POST("/api/payments/checkout-sessions", {
        body: { paymentId },
        params: {
          header: {
            "idempotency-key": idempotencyKey,
            "x-rp-csrf-token": csrfToken() ?? "",
          },
        },
      })
      .then(unwrapGeneratedResponse),
  paymentStatus: (paymentId: string, signal?: AbortSignal) =>
    generatedSchedulingPaymentClient
      .GET("/api/payments/{paymentId}/status", {
        params: { path: { paymentId } },
        signal,
      })
      .then(unwrapGeneratedResponse),
};

function unwrapGeneratedResponse<T>(result: {
  data?: T;
  error?: { error?: string; message?: string };
  response: Response;
}): T {
  if (result.data !== undefined) return result.data;
  throw new ApiError(
    result.error?.message ?? result.error?.error ?? "Public discovery request failed",
    result.response.status,
  );
}

export const serviceService = {
  list: () => resource.list<Service>("service"),
  byCategory: (category: string) => resource.list<Service>("service", { category }),
};

export const pricingService = {
  list: () => resource.list<ServicePrice>("servicePrice"),
};

export const productionServicePricingService = {
  list: () =>
    generatedSchedulingPaymentClient.GET("/api/admin/service-prices").then(unwrapGeneratedResponse),
  create: (input: {
    currency: string;
    effectiveFrom: string;
    effectiveUntil?: string;
    patientPriceMinor: string;
    providerPayoutMinor: string;
    serviceId: string;
  }): Promise<ServicePriceResponse> =>
    generatedSchedulingPaymentClient
      .POST("/api/admin/service-prices", {
        body: input,
        params: { header: csrfHeader() },
      })
      .then(unwrapGeneratedResponse),
  activate: (priceId: string, expectedVersion: number): Promise<ServicePriceResponse> =>
    generatedSchedulingPaymentClient
      .POST("/api/admin/service-prices/{priceId}/activate", {
        body: { expectedVersion },
        params: { header: csrfHeader(), path: { priceId } },
      })
      .then(unwrapGeneratedResponse),
};

export const appointmentService = {
  list: (params?: Record<string, string>) => resource.list<Appointment>("appointment", params),
  get: (id: string) => resource.get<Appointment>("appointment", id),
  update: (id: string, data: Partial<Appointment>) =>
    resource.update<Appointment>("appointment", id, data),
  book: (body: Record<string, unknown>) =>
    action("book-appointment", body).then((r) => r.data as Appointment & { payment: Payment }),
  progress: (appointmentId: string, status: string, actorId: string, actorRole: string) =>
    action("progress-appointment", { appointmentId, status, actorId, actorRole }).then(
      (r) => r.data as Appointment,
    ),
};

export const administrationService = {
  dashboard: (input: { dayFrom: string; dayTo: string }) =>
    generatedAdministrationClient
      .GET("/api/admin/dashboard", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  complaints: (input: {
    cursor?: string;
    limit?: number;
    priority?: AdminComplaintPriority;
    query?: string;
    scope: AdminComplaintScope;
  }) =>
    generatedAdministrationClient
      .GET("/api/admin/complaints", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  transitionComplaint: (
    complaintId: string,
    input: { expectedVersion: number; internalNote?: string; status: AdminComplaintStatus },
  ) =>
    generatedAdministrationClient
      .PATCH("/api/admin/complaints/{complaintId}", {
        body: input,
        params: { header: csrfHeader(), path: { complaintId } },
      })
      .then(unwrapGeneratedResponse),
  deliveries: (input: {
    cursor?: string;
    limit?: number;
    query?: string;
    scope: AdminDeliveryScope;
  }) =>
    generatedAdministrationClient
      .GET("/api/admin/deliveries", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  appointments: (input: {
    cursor?: string;
    dayFrom: string;
    dayTo: string;
    limit?: number;
    query?: string;
    scope: AdminAppointmentScope;
  }) =>
    generatedAdministrationClient
      .GET("/api/admin/appointments", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  auditEvents: (input: {
    action?: string;
    cursor?: string;
    effectiveRole?: PlatformRole;
    from?: string;
    limit?: number;
    query?: string;
    to?: string;
  }) =>
    generatedAdministrationClient
      .GET("/api/admin/audit-events", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  practitioners: (input: {
    cursor?: string;
    limit?: number;
    query?: string;
    scope: AdminPractitionerScope;
  }) =>
    generatedAdministrationClient
      .GET("/api/admin/practitioners", {
        params: {
          query: {
            cursor: input.cursor,
            limit: input.limit,
            q: input.query,
            scope: input.scope,
          },
        },
      })
      .then(unwrapGeneratedResponse),
  practitioner: (practitionerId: string): Promise<AdminPractitionerDetail> =>
    generatedAdministrationClient
      .GET("/api/admin/practitioners/{practitionerId}", {
        params: { path: { practitionerId } },
      })
      .then(unwrapGeneratedResponse),
  transitionPractitioner: (
    practitionerId: string,
    input: {
      expectedVersion: number;
      note?: string;
      status: Exclude<PractitionerVerificationStatus, "PENDING">;
    },
  ): Promise<AdminPractitionerDetail> =>
    generatedAdministrationClient
      .PATCH("/api/admin/practitioners/{practitionerId}/verification", {
        body: input,
        params: { header: csrfHeader(), path: { practitionerId } },
      })
      .then(unwrapGeneratedResponse),
};

type ClinicalRelatedActionInput = ClinicalEncounterComponents["schemas"]["RelatedActionInput"];

const CLINICAL_SECTION_TITLES: Readonly<Record<string, string>> = {
  allergyConfirmation: "Allergy confirmation",
  assessment: "Assessment",
  chiefComplaint: "Chief complaint",
  consultationReason: "Consultation reason",
  differentialDiagnosis: "Differential diagnosis",
  diagnosis: "Diagnosis",
  examinationFindings: "Examination findings",
  familyHistory: "Family history",
  followUp: "Follow-up",
  historyPresentIllness: "History of present illness",
  medicationHistory: "Medication history",
  patientInstructions: "Patient instructions",
  relevantMedicalHistory: "Relevant medical history",
  safetyNetting: "Safety netting",
  socialHistory: "Social history",
  treatmentPlan: "Treatment plan",
  vitalSigns: "Vital signs",
};

function clinicalDocumentation(documentation: Partial<EncounterDocumentation>) {
  const sections = Object.entries(documentation).flatMap(([code, value]) => {
    if (code === "attachments" || value === undefined || value === null) return [];
    const text =
      code === "vitalSigns" && typeof value === "object"
        ? Object.entries(value as Record<string, string>)
            .filter(([, reading]) => reading.trim().length > 0)
            .map(([name, reading]) => `${name}: ${reading}`)
            .join("\n")
        : String(value).trim();
    if (!text) return [];
    return [{ code, text, title: CLINICAL_SECTION_TITLES[code] ?? code }];
  });
  if (sections.length === 0) throw new Error("Clinical documentation cannot be empty");
  return { sections };
}

function latestClinicalNote(encounter: ClinicalEncounterResponse) {
  return encounter.notes.reduce<(typeof encounter.notes)[number] | undefined>(
    (latest, note) => (latest === undefined || note.revision > latest.revision ? note : latest),
    undefined,
  );
}

function mapClinicalEncounter(encounter: ClinicalEncounterResponse): ClinicalEncounter {
  const latest = latestClinicalNote(encounter);
  const documentation = Object.fromEntries(
    (latest?.documentation.sections ?? []).map((section) => [
      section.code,
      section.code === "vitalSigns"
        ? Object.fromEntries(
            section.text.split("\n").flatMap((line) => {
              const separator = line.indexOf(":");
              return separator < 1
                ? []
                : [[line.slice(0, separator), line.slice(separator + 1).trim()]];
            }),
          )
        : section.text,
    ]),
  ) as EncounterDocumentation;
  const attachmentReferences = encounter.relatedActions.attachmentReferences.map((reference) => ({
    id: reference.id,
    name: reference.purpose,
    size: 0,
    type: reference.sourceType,
    uploadedAt: reference.createdAt,
  }));
  if (attachmentReferences.length > 0) documentation.attachments = attachmentReferences;
  const latestDiagnosis = latest?.diagnoses.find((diagnosis) => diagnosis.type === "PRIMARY");
  if (latestDiagnosis?.display) documentation.diagnosis = latestDiagnosis.display;

  return {
    appointmentId: encounter.appointmentId,
    createdAt: encounter.openedAt,
    documentation,
    encounterNumber: encounter.encounterNumber,
    id: encounter.id,
    locked: encounter.status === "SIGNED",
    patientId: encounter.patient.id,
    providerId: encounter.practitioner.id,
    signedAt: encounter.signedAt,
    status: encounter.status === "SIGNED" ? "completed" : "open",
    updatedAt: encounter.updatedAt,
    diagnoses: (latest?.diagnoses ?? []).map((diagnosis) => ({
      code: diagnosis.code,
      description: diagnosis.display,
      encounterId: encounter.id,
      id: diagnosis.id,
      patientId: encounter.patient.id,
      status: diagnosis.status.toLowerCase(),
      type: diagnosis.type.toLowerCase(),
    })),
    referrals: encounter.relatedActions.referrals.map((referral) => ({
      attachments: [],
      encounterId: encounter.id,
      id: referral.id,
      patientId: encounter.patient.id,
      reason: referral.reason,
      recipientSpecialty: referral.specialtyCode,
      referralNumber: referral.id,
      senderProviderId: encounter.practitioner.id,
      status: referral.status.toLowerCase() as Referral["status"],
      urgency: referral.priority.toLowerCase(),
    })),
    carePlans: encounter.relatedActions.carePlans.map((plan) => ({
      description: plan.goal,
      endDate: plan.endsAt,
      goals: [...plan.activities],
      id: plan.id,
      patientId: encounter.patient.id,
      startDate: plan.startsAt,
      status: plan.status.toLowerCase(),
      title: plan.title,
    })),
  };
}

function clinicalMutationHeader() {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export const productionClinicalService = {
  provider: {
    get: (encounterId: string) =>
      generatedClinicalEncounterClient
        .GET("/v1/provider/clinical-encounters/{encounterId}", {
          params: { path: { encounterId } },
        })
        .then(unwrapGeneratedResponse),
    list: (patientId?: string, cursor?: string, limit = 50) =>
      generatedClinicalEncounterClient
        .GET("/v1/provider/clinical-encounters", {
          params: {
            query: { ...(cursor ? { cursor } : {}), limit, ...(patientId ? { patientId } : {}) },
          },
        })
        .then(unwrapGeneratedResponse),
    open: (appointmentId: string) =>
      generatedClinicalEncounterClient
        .POST("/v1/provider/clinical-encounters", {
          body: { appointmentId },
          params: { header: clinicalMutationHeader() },
        })
        .then(unwrapGeneratedResponse),
    relatedAction: (encounterId: string, body: ClinicalRelatedActionInput) =>
      generatedClinicalEncounterClient
        .POST("/v1/provider/clinical-encounters/{encounterId}/related-actions", {
          body,
          params: { header: clinicalMutationHeader(), path: { encounterId } },
        })
        .then(unwrapGeneratedResponse),
  },
  patient: {
    get: (encounterId: string) =>
      generatedClinicalEncounterClient
        .GET("/v1/patient/clinical-encounters/{encounterId}", {
          params: { path: { encounterId } },
        })
        .then(unwrapGeneratedResponse),
    list: (cursor?: string, limit = 50) =>
      generatedClinicalEncounterClient
        .GET("/v1/patient/clinical-encounters", {
          params: { query: { ...(cursor ? { cursor } : {}), limit } },
        })
        .then(unwrapGeneratedResponse),
    byAppointment: (appointmentId: string) =>
      generatedClinicalEncounterClient
        .GET("/v1/patient/clinical-encounters/by-appointment/{appointmentId}", {
          params: { path: { appointmentId } },
        })
        .then(unwrapGeneratedResponse),
  },
};

export const encounterService = {
  get: (id: string) => productionClinicalService.provider.get(id).then(mapClinicalEncounter),
  listProvider: (patientId?: string) =>
    productionClinicalService.provider
      .list(patientId, undefined, 50)
      .then((page) => page.data.map(mapClinicalEncounter)),
  listPatient: () =>
    productionClinicalService.patient
      .list(undefined, 50)
      .then((page) => page.data.map(mapClinicalEncounter)),
  byAppointment: (appointmentId: string) =>
    productionClinicalService.patient.byAppointment(appointmentId).then(mapClinicalEncounter),
  update: async (id: string, documentation: Partial<EncounterDocumentation>) => {
    const encounter = await productionClinicalService.provider.get(id);
    const latestRevision = latestClinicalNote(encounter)?.revision ?? 0;
    return generatedClinicalEncounterClient
      .POST("/v1/provider/clinical-encounters/{encounterId}/drafts", {
        body: {
          documentation: clinicalDocumentation(documentation),
          expectedLatestRevision: latestRevision,
          schemaVersion: 1,
        },
        params: { header: clinicalMutationHeader(), path: { encounterId: id } },
      })
      .then(unwrapGeneratedResponse)
      .then(mapClinicalEncounter);
  },
  start: (appointmentId: string, _actorId: string) =>
    productionClinicalService.provider.open(appointmentId).then(mapClinicalEncounter),
  complete: async (
    encounterId: string,
    documentation: EncounterDocumentation,
    _actorId: string,
  ) => {
    const encounter = await productionClinicalService.provider.get(encounterId);
    const latestRevision = latestClinicalNote(encounter)?.revision ?? 0;
    const diagnosis = documentation.diagnosis?.trim();
    if (!diagnosis) throw new Error("A primary diagnosis is required before signing");
    const observations = Object.entries(documentation.vitalSigns ?? {}).flatMap(
      ([code, reading]) =>
        reading.trim()
          ? [
              {
                code,
                display: CLINICAL_SECTION_TITLES[code] ?? code,
                observedAt: new Date().toISOString(),
                textValue: reading.trim(),
                valueType: "TEXT" as const,
              },
            ]
          : [],
    );
    return generatedClinicalEncounterClient
      .POST("/v1/provider/clinical-encounters/{encounterId}/sign", {
        body: {
          diagnoses: [{ display: diagnosis, status: "ACTIVE", type: "PRIMARY" }],
          documentation: clinicalDocumentation(documentation),
          expectedLatestRevision: latestRevision,
          expectedVersion: encounter.version,
          observations,
          schemaVersion: 1,
        },
        params: { header: clinicalMutationHeader(), path: { encounterId } },
      })
      .then(unwrapGeneratedResponse)
      .then(mapClinicalEncounter);
  },
};

export const labRequestService = {
  list: (params?: Record<string, string>) =>
    resource.list<LaboratoryRequest>("laboratoryRequest", params),
  get: (id: string) => resource.get<LaboratoryRequest>("laboratoryRequest", id),
};

export const referralService = {
  list: (params?: Record<string, string>) => resource.list<Referral>("referral", params),
  get: (id: string) => resource.get<Referral>("referral", id),
  create: (body: Record<string, unknown>) =>
    action("create-referral", body).then((r) => r.data as Referral),
};

export const consentService = {
  grants: (patientId: string) =>
    resource.list<RecordAccessGrant>("recordAccessGrant", { patientId }),
  consents: (patientId: string) => resource.list<Consent>("consent", { patientId }),
  revoke: (grantId: string, actorId: string) =>
    action("revoke-access", { grantId, actorId }).then((r) => r.data),
};

export const notificationService = {
  list: (recipientId: string, recipientType: string) =>
    resource.list<Notification>("notification", { recipientId, recipientType }),
  markRead: (notificationId: string) => action("mark-notification-read", { notificationId }),
  markAllRead: (recipientId: string, recipientType: string) =>
    action("mark-notification-read", { allFor: recipientId, recipientType }),
};

export const paymentService = {
  list: (patientId: string) => resource.list<Payment>("payment", { patientId }),
};

export const settlementService = {
  list: (params?: Record<string, string>) => resource.list<Settlement>("settlement", params),
};

export const carePlanService = {
  list: (patientId: string) => resource.list<CarePlan>("carePlan", { patientId }),
};

export const diagnosisService = {
  list: (patientId: string) => resource.list<Diagnosis>("diagnosis", { patientId }),
};

export const applicationService = {
  list: () => resource.list<ProviderApplication>("providerApplication"),
  get: (id: string) => resource.get<ProviderApplication>("providerApplication", id),
};

export const auditService = {
  list: () =>
    resource
      .list<AuditLog>("auditLog", {})
      .then((r) =>
        [...r].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      ),
};

export const complaintService = {
  list: () => resource.list<Complaint>("complaint"),
};

export const userService = {
  list: () => resource.list<User>("user"),
};

// --- admin actions ---
export const adminService = {
  verifyProvider: (
    providerId: string,
    act: "approve" | "reject" | "request_info" | "suspend" | "reactivate",
    notes?: string,
    actorId?: string,
  ) => action("admin-verify-provider", { providerId, action: act, notes, actorId }),
  updatePricing: (
    serviceId: string,
    patientPrice: number,
    providerPayout: number,
    effectiveFrom?: string,
    actorId?: string,
  ) =>
    action("admin-update-pricing", {
      serviceId,
      patientPrice,
      providerPayout,
      effectiveFrom,
      actorId,
    }),
  updateCommission: (pharmacyId: string, percentage: number, actorId?: string) =>
    action("admin-pharmacy-commission", { pharmacyId, percentage, actorId }),
};

// --- payout requests (provider / pharmacy / laboratory / logistics) ---
export const payoutService = {
  list: (params?: Record<string, string>) => resource.list<PayoutRequest>("payoutRequest", params),
  listForEntity: (entityType: string, entityId: string) =>
    resource.list<PayoutRequest>("payoutRequest", { entityType, entityId }),
  listAll: () => resource.list<PayoutRequest>("payoutRequest"),
  request: (body: Record<string, unknown>) =>
    action("request-payout", body).then((r) => r.data as PayoutRequest),
  update: (id: string, data: Partial<PayoutRequest>) =>
    resource.update<PayoutRequest>("payoutRequest", id, data),
};

export type { ProviderVerificationStatus };

// Production manager boundary. These methods expose referral status, the manager's
// own commission, and privacy-limited tickets only. They intentionally have no
// organization portfolio, patient record, gross payment, or payout mutation API.
export const managerPortalService = {
  profile: () => generatedManagerClient.GET("/api/manager/profile").then(unwrapGeneratedResponse),
  referralLinks: () =>
    generatedManagerClient.GET("/api/manager/referral-links").then(unwrapGeneratedResponse),
  referrals: (input: { cursor?: string; limit?: number } = {}) =>
    generatedManagerClient
      .GET("/api/manager/referrals", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  earnings: (input: {
    cursor?: string;
    from: string;
    granularity: "DAY" | "MONTH";
    limit?: number;
    timeZone: string;
    to: string;
  }) =>
    generatedManagerClient
      .GET("/api/manager/earnings", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  tickets: (input: { cursor?: string; limit?: number } = {}) =>
    generatedManagerClient
      .GET("/api/manager/tickets", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  ticket: (ticketId: string) =>
    generatedManagerClient
      .GET("/api/manager/tickets/{ticketId}", { params: { path: { ticketId } } })
      .then(unwrapGeneratedResponse),
  createTicket: (input: {
    category: "ONBOARDING" | "ACCOUNT" | "TECHNICAL" | "SERVICE" | "OTHER";
    subjectDisplayName: string;
    subjectReference?: string;
  }) =>
    generatedManagerClient
      .POST("/api/manager/tickets", {
        body: input,
        params: { header: { "x-rp-csrf-token": csrfToken() ?? "" } },
      })
      .then(unwrapGeneratedResponse),
  addTicketFollowUp: (ticketId: string, body: string) =>
    generatedManagerClient
      .POST("/api/manager/tickets/{ticketId}/follow-ups", {
        body: { body },
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { ticketId },
        },
      })
      .then(unwrapGeneratedResponse),
};

export const managerProgramService = {
  createManager: (input: { displayName: string; principalId: string }) =>
    generatedManagerClient
      .POST("/api/admin/managers", {
        body: input,
        params: { header: { "x-rp-csrf-token": csrfToken() ?? "" } },
      })
      .then(unwrapGeneratedResponse),
  createReferralLink: (
    managerProfileId: string,
    input: {
      audience: "PATIENT" | "ORGANIZATION";
      label: string;
      organizationType?: "HOSPITAL" | "PHARMACY" | "LABORATORY";
      validUntil?: string;
    },
  ) =>
    generatedManagerClient
      .POST("/api/admin/managers/{managerProfileId}/referral-links", {
        body: input,
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { managerProfileId },
        },
      })
      .then(unwrapGeneratedResponse),
  createCommissionPolicy: (
    managerProfileId: string,
    input: {
      activityType: "CONSULTATION" | "HOSPITAL" | "PHARMACY" | "LABORATORY";
      currency: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      minimumGrossMinor?: string;
      rateBps: number;
    },
  ) =>
    generatedManagerClient
      .POST("/api/admin/managers/{managerProfileId}/commission-policies", {
        body: input,
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { managerProfileId },
        },
      })
      .then(unwrapGeneratedResponse),
  activateCommissionPolicy: (policyId: string, expectedVersion: number) =>
    generatedManagerClient
      .POST("/api/admin/managers/commission-policies/{policyId}/activate", {
        body: { expectedVersion },
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { policyId },
        },
      })
      .then(unwrapGeneratedResponse),
  correctAttribution: (
    applicationId: string,
    input: {
      expectedVersion: number;
      managerProfileId?: string;
      reasonCategory: string;
      referralLinkId?: string;
    },
  ) =>
    generatedManagerClient
      .POST("/api/admin/managers/attributions/{applicationId}/corrections", {
        body: input,
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { applicationId },
        },
      })
      .then(unwrapGeneratedResponse),
  supportTickets: (
    input: {
      cursor?: string;
      limit?: number;
      status?: "ESCALATED" | "IN_REVIEW" | "WAITING_MANAGER" | "RESOLVED" | "CLOSED";
    } = {},
  ) =>
    generatedManagerClient
      .GET("/api/support/manager-tickets", { params: { query: input } })
      .then(unwrapGeneratedResponse),
  reviewTicket: (
    ticketId: string,
    input: {
      body?: string;
      expectedVersion: number;
      status: "IN_REVIEW" | "WAITING_MANAGER" | "RESOLVED" | "CLOSED";
    },
  ) =>
    generatedManagerClient
      .PATCH("/api/support/manager-tickets/{ticketId}", {
        body: input,
        params: {
          header: { "x-rp-csrf-token": csrfToken() ?? "" },
          path: { ticketId },
        },
      })
      .then(unwrapGeneratedResponse),
};

export type {
  AppointmentResponse,
  CommissionPolicyResponse,
  ManagerEarningsReportResponse,
  ManagerProfileResponse,
  ManagerReferralLinkResponse,
  ManagerReferralStatusResponse,
  ManagerTicketResponse,
  HostedCheckoutResponse,
  PaymentStatusResponse,
  PractitionerAvailabilityResponse,
  ReferralAttributionCorrectionResponse,
  SupportManagerTicketResponse,
};

// ---------------------------------------------------------------------------
// MANAGER MODULE — dedicated role-scoped service (plan §6).
// All calls carry the simulated session; the server derives the manager
// identity and enforces portfolio scope. UI pages never hit raw endpoints.
// ---------------------------------------------------------------------------

export interface ManagerOrganizationDetail {
  organization: ManagerOrganizationDto;
  payments: OrganizationPayment[];
  earnings: ManagerEarning[];
  tickets: (SupportTicket & { messageCount: number; open: boolean })[];
  openTickets: number;
  assignmentHistory: {
    id: string;
    managerName: string;
    managerNumber: string;
    source: string;
    relationshipStatus: string;
    startsAt: string;
    endsAt?: string | null;
    assignedBy: string;
    reason?: string | null;
  }[];
}

export interface ManagerMePayload {
  manager: Manager;
  bankAccount:
    (Omit<ManagerBankAccount, "accountNumberMasked"> & { accountNumberMasked: string }) | null;
  stats: {
    enrollmentCount: number;
    acquiredCount: number;
    openTicketCount: number;
    pendingApplications: number;
  };
}

export const managerService = {
  me: () => sessionApi.get<{ data: ManagerMePayload }>("/api/manager/me").then((r) => r.data),
  dashboard: () =>
    sessionApi
      .get<{
        data: ManagerDashboardSummary & {
          notifications: Notification[];
          manager: { id: string; managerNumber: string; onboardingCode: string; name: string };
        };
      }>("/api/manager/dashboard")
      .then((r) => r.data),
  organizations: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return sessionApi
      .get<Paginated<ManagerOrganization>>(`/api/manager/organizations${qs}`)
      .then((r) => r as Paginated<ManagerOrganization>);
  },
  organization: (id: string, type: "pharmacy" | "laboratory") =>
    sessionApi
      .get<{ data: ManagerOrganizationDetail }>(`/api/manager/organizations/${id}?type=${type}`)
      .then((r) => r.data),
  applications: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return sessionApi
      .get<Paginated<ManagerOrganizationApplication>>(`/api/manager/applications${qs}`)
      .then((r) => r as Paginated<ManagerOrganizationApplication>);
  },
  earnings: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return sessionApi
      .get<Paginated<ManagerEarning>>(`/api/manager/earnings${qs}`)
      .then((r) => r as Paginated<ManagerEarning>);
  },
  payouts: () =>
    sessionApi
      .get<{
        data: {
          payouts: (PayoutRequest & {
            allocatedEarnings?: { earningNumber: string; amount: number }[];
          })[];
          availableBalance: number;
          bankAccount: {
            id: string;
            bankName: string;
            accountName: string;
            accountNumberMasked: string;
            verificationStatus: string;
          } | null;
        };
      }>("/api/manager/payouts")
      .then((r) => r.data),
  tickets: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return sessionApi
      .get<Paginated<SupportTicket>>(`/api/manager/support${qs}`)
      .then((r) => r as Paginated<SupportTicket>);
  },
  ticket: (id: string) =>
    sessionApi
      .get<{ data: SupportTicket & { messages: SupportTicketMessage[] } }>(
        `/api/manager/support/${id}`,
      )
      .then((r) => r.data),

  // --- mutations go through dedicated action endpoints ---
  // sessionApi (not plain action) so the server can derive the caller
  // identity from the server-managed session — body-sent identities are never
  // trusted for manager/admin actions.
  submitApplication: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/manager-onboard-organization", body),
  requestPayout: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/manager-request-payout", body),
  updateTicket: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/manager-update-ticket", body),
  confirmPayment: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/confirm-organization-payment", body),
  refundPayment: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/refund-organization-payment", body),

  // --- admin-side manager methods (plan §3.8) ---
  adminReviewApplication: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/admin-review-manager-application", body),
  adminReviewPatientEnrollment: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/admin-review-patient-enrollment", body),
  adminAssignManager: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/admin-assign-manager", body),
  adminManagerRule: (body: Record<string, unknown>) =>
    sessionApi.post("/api/actions/admin-manager-rule", body),
};

export type { ManagerRevenueShareRule };
