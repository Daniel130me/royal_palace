// Royal Palace Health Care — typed service layer.
// The UI consumes these functions instead of performing raw fetches, so the
// backend can be replaced without touching components (see spec section 58).

import {
  createManagerClient,
  createOnboardingClient,
  createPublicDiscoveryClient,
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
  Delivery,
  Diagnosis,
  LaboratoryBooking,
  LaboratoryRequest,
  LaboratoryResult,
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
  PharmacyOrder,
  PharmacyProduct,
  Prescription,
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
  LogisticsProvider,
  ProviderVerificationStatus,
  EncounterDocumentation,
  UploadedPrescription,
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
  orders: (pharmacyId: string) => resource.list<PharmacyOrder>("pharmacyOrder", { pharmacyId }),
  order: (id: string) => resource.get<PharmacyOrder>("pharmacyOrder", id),
};

export const laboratoryService = {
  list: () => resource.list<Laboratory>("laboratory"),
  get: (id: string) => resource.get<Laboratory>("laboratory", id),
  requests: (laboratoryId?: string) =>
    resource.list<LaboratoryRequest>("laboratoryRequest", laboratoryId ? { laboratoryId } : {}),
  bookings: (laboratoryId: string) =>
    resource.list<LaboratoryBooking>("laboratoryBooking", { laboratoryId }),
  results: (laboratoryId: string) =>
    resource.list<LaboratoryResult>("laboratoryResult", { laboratoryId }),
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
  listForSupport: (cursor?: string) => listApplicationReviewQueue("support", cursor),
  getForSupport: (applicationId: string) =>
    sessionApi.get<OnboardingApplicationDetail>(`/api/support/applications/${applicationId}`),
  startReview: (applicationId: string, expectedVersion: number) =>
    sessionApi.post<OnboardingApplicationDetail>(
      `/api/support/applications/${applicationId}/start-review`,
      { expectedVersion },
    ),
  listForAdmin: (cursor?: string) => listApplicationReviewQueue("admin", cursor),
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

function listApplicationReviewQueue(authority: "admin" | "support", cursor?: string) {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor !== undefined) query.set("cursor", cursor);
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

export const logisticsService = {
  list: () => resource.list<LogisticsProvider>("logisticsProvider"),
  get: (id: string) => resource.get<LogisticsProvider>("logisticsProvider", id),
  deliveries: (logisticsProviderId: string) =>
    resource.list<Delivery>("delivery", { logisticsProviderId }),
  delivery: (id: string) => resource.get<Delivery>("delivery", id),
};

export const serviceService = {
  list: () => resource.list<Service>("service"),
  byCategory: (category: string) => resource.list<Service>("service", { category }),
};

export const pricingService = {
  list: () => resource.list<ServicePrice>("servicePrice"),
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

export const encounterService = {
  get: (id: string) => resource.get<ClinicalEncounter>("clinicalEncounter", id),
  byAppointment: (appointmentId: string) =>
    resource
      .list<ClinicalEncounter>("clinicalEncounter", { appointmentId })
      .then((r) => r[0] ?? null),
  update: (id: string, documentation: Partial<EncounterDocumentation>) =>
    resource.update<ClinicalEncounter>("clinicalEncounter", id, {
      documentation: JSON.stringify(documentation),
    }),
  start: (appointmentId: string, actorId: string) =>
    action("start-encounter", { appointmentId, actorId }).then((r) => r.data as ClinicalEncounter),
  complete: (encounterId: string, documentation: EncounterDocumentation, actorId: string) =>
    action("complete-encounter", { encounterId, documentation, actorId }, "PATCH").then(
      (r) => r.data as ClinicalEncounter,
    ),
};

export const prescriptionService = {
  list: (params?: Record<string, string>) => resource.list<Prescription>("prescription", params),
  get: (id: string) => resource.get<Prescription>("prescription", id),
  issue: (body: Record<string, unknown>) =>
    action("issue-prescription", body).then((r) => r.data as Prescription),
};

export const labRequestService = {
  list: (params?: Record<string, string>) =>
    resource.list<LaboratoryRequest>("laboratoryRequest", params),
  get: (id: string) => resource.get<LaboratoryRequest>("laboratoryRequest", id),
  create: (body: Record<string, unknown>) =>
    action("create-lab-request", body).then((r) => r.data as LaboratoryRequest),
  book: (body: Record<string, unknown>) =>
    action("book-lab", body).then((r) => r.data as LaboratoryBooking),
  progress: (bookingId: string, status: string, actorId: string) =>
    action("progress-lab", { bookingId, status, actorId }).then((r) => r.data as LaboratoryBooking),
  publishResult: (body: Record<string, unknown>) =>
    action("publish-lab-result", body).then((r) => r.data as LaboratoryResult),
};

export const pharmacyOrderService = {
  list: (params?: Record<string, string>) => resource.list<PharmacyOrder>("pharmacyOrder", params),
  get: (id: string) => resource.get<PharmacyOrder>("pharmacyOrder", id),
  create: (body: Record<string, unknown>) =>
    action("create-pharmacy-order", body).then((r) => r.data as PharmacyOrder),
  // Direct OTC order — no prescription required (uncontrolled meds only)
  directOrder: (body: Record<string, unknown>) =>
    action("direct-pharmacy-order", body).then((r) => r.data as PharmacyOrder),
  progress: (orderId: string, status: string, actorId: string) =>
    action("progress-order", { orderId, status, actorId }).then((r) => r.data as PharmacyOrder),
};

export const deliveryService = {
  list: (params?: Record<string, string>) => resource.list<Delivery>("delivery", params),
  get: (id: string) => resource.get<Delivery>("delivery", id),
  progress: (deliveryId: string, status: string, verificationCode: string, actorId: string) =>
    action("progress-delivery", { deliveryId, status, verificationCode, actorId }).then(
      (r) => r.data as Delivery,
    ),
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

// --- uploaded prescriptions (patient-supplied paper Rx) ---
export const uploadedPrescriptionService = {
  list: (patientId: string) =>
    resource.list<UploadedPrescription>("uploadedPrescription", { patientId }),
  listForPharmacy: (pharmacyId: string) =>
    resource.list<UploadedPrescription>("uploadedPrescription", { pharmacyId }),
  get: (id: string) => resource.get<UploadedPrescription>("uploadedPrescription", id),
  upload: (body: Record<string, unknown>) =>
    action("upload-prescription", body).then((r) => r.data as UploadedPrescription),
  update: (id: string, data: Partial<UploadedPrescription>) =>
    resource.update<UploadedPrescription>("uploadedPrescription", id, data),
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
  CommissionPolicyResponse,
  ManagerEarningsReportResponse,
  ManagerProfileResponse,
  ManagerReferralLinkResponse,
  ManagerReferralStatusResponse,
  ManagerTicketResponse,
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
