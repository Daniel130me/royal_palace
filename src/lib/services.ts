// Royal Palace Health Care — typed service layer.
// The UI consumes these functions instead of performing raw fetches, so the
// backend can be replaced without touching components (see spec section 58).

import { api, resource, action } from "./api-client";
import type {
  Appointment,
  ClinicalEncounter,
  Consent,
  Delivery,
  Diagnosis,
  LaboratoryBooking,
  LaboratoryRequest,
  LaboratoryResult,
  Notification,
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
  User,
  CarePlan,
  AuditLog,
  Complaint,
  Laboratory,
  LogisticsProvider,
  ProviderVerificationStatus,
  EncounterDocumentation,
} from "@/types";

// --- auth ---
export const authService = {
  login: (email: string, password: string) =>
    api.post<{ session: { userId: string; role: string; profileId?: string; name: string; email: string } }>(
      "/api/auth/login",
      { email, password }
    ).then((r) => r.session),
};

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
  products: (pharmacyId: string) => resource.list<PharmacyProduct>("pharmacyProduct", { pharmacyId }),
  product: (id: string) => resource.get<PharmacyProduct>("pharmacyProduct", id),
  createProduct: (data: Partial<PharmacyProduct>) => resource.create<PharmacyProduct>("pharmacyProduct", data),
  updateProduct: (id: string, data: Partial<PharmacyProduct>) => resource.update<PharmacyProduct>("pharmacyProduct", id, data),
  orders: (pharmacyId: string) => resource.list<PharmacyOrder>("pharmacyOrder", { pharmacyId }),
  order: (id: string) => resource.get<PharmacyOrder>("pharmacyOrder", id),
};

export const laboratoryService = {
  list: () => resource.list<Laboratory>("laboratory"),
  get: (id: string) => resource.get<Laboratory>("laboratory", id),
  requests: (laboratoryId?: string) => resource.list<LaboratoryRequest>("laboratoryRequest", laboratoryId ? { laboratoryId } : {}),
  bookings: (laboratoryId: string) => resource.list<LaboratoryBooking>("laboratoryBooking", { laboratoryId }),
  results: (laboratoryId: string) => resource.list<LaboratoryResult>("laboratoryResult", { laboratoryId }),
};

export const logisticsService = {
  list: () => resource.list<LogisticsProvider>("logisticsProvider"),
  get: (id: string) => resource.get<LogisticsProvider>("logisticsProvider", id),
  deliveries: (logisticsProviderId: string) => resource.list<Delivery>("delivery", { logisticsProviderId }),
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
  update: (id: string, data: Partial<Appointment>) => resource.update<Appointment>("appointment", id, data),
  book: (body: Record<string, unknown>) => action("book-appointment", body).then((r) => r.data as Appointment & { payment: Payment }),
  progress: (appointmentId: string, status: string, actorId: string, actorRole: string) =>
    action("progress-appointment", { appointmentId, status, actorId, actorRole }).then((r) => r.data as Appointment),
};

export const encounterService = {
  get: (id: string) => resource.get<ClinicalEncounter>("clinicalEncounter", id),
  byAppointment: (appointmentId: string) => resource.list<ClinicalEncounter>("clinicalEncounter", { appointmentId }).then((r) => r[0] ?? null),
  update: (id: string, documentation: Partial<EncounterDocumentation>) =>
    resource.update<ClinicalEncounter>("clinicalEncounter", id, { documentation: JSON.stringify(documentation) }),
  start: (appointmentId: string, actorId: string) =>
    action("start-encounter", { appointmentId, actorId }).then((r) => r.data as ClinicalEncounter),
  complete: (encounterId: string, documentation: EncounterDocumentation, actorId: string) =>
    action("complete-encounter", { encounterId, documentation, actorId }, "PATCH").then((r) => r.data as ClinicalEncounter),
};

export const prescriptionService = {
  list: (params?: Record<string, string>) => resource.list<Prescription>("prescription", params),
  get: (id: string) => resource.get<Prescription>("prescription", id),
  issue: (body: Record<string, unknown>) => action("issue-prescription", body).then((r) => r.data as Prescription),
};

export const labRequestService = {
  list: (params?: Record<string, string>) => resource.list<LaboratoryRequest>("laboratoryRequest", params),
  get: (id: string) => resource.get<LaboratoryRequest>("laboratoryRequest", id),
  create: (body: Record<string, unknown>) => action("create-lab-request", body).then((r) => r.data as LaboratoryRequest),
  book: (body: Record<string, unknown>) => action("book-lab", body).then((r) => r.data as LaboratoryBooking),
  progress: (bookingId: string, status: string, actorId: string) =>
    action("progress-lab", { bookingId, status, actorId }).then((r) => r.data as LaboratoryBooking),
  publishResult: (body: Record<string, unknown>) => action("publish-lab-result", body).then((r) => r.data as LaboratoryResult),
};

export const pharmacyOrderService = {
  list: (params?: Record<string, string>) => resource.list<PharmacyOrder>("pharmacyOrder", params),
  get: (id: string) => resource.get<PharmacyOrder>("pharmacyOrder", id),
  create: (body: Record<string, unknown>) => action("create-pharmacy-order", body).then((r) => r.data as PharmacyOrder),
  progress: (orderId: string, status: string, actorId: string) =>
    action("progress-order", { orderId, status, actorId }).then((r) => r.data as PharmacyOrder),
};

export const deliveryService = {
  list: (params?: Record<string, string>) => resource.list<Delivery>("delivery", params),
  get: (id: string) => resource.get<Delivery>("delivery", id),
  progress: (deliveryId: string, status: string, verificationCode: string, actorId: string) =>
    action("progress-delivery", { deliveryId, status, verificationCode, actorId }).then((r) => r.data as Delivery),
};

export const referralService = {
  list: (params?: Record<string, string>) => resource.list<Referral>("referral", params),
  get: (id: string) => resource.get<Referral>("referral", id),
  create: (body: Record<string, unknown>) => action("create-referral", body).then((r) => r.data as Referral),
};

export const consentService = {
  grants: (patientId: string) => resource.list<RecordAccessGrant>("recordAccessGrant", { patientId }),
  consents: (patientId: string) => resource.list<Consent>("consent", { patientId }),
  revoke: (grantId: string, actorId: string) => action("revoke-access", { grantId, actorId }).then((r) => r.data),
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
  list: () => resource.list<AuditLog>("auditLog", {}, ).then((r) =>
    [...r].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
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
  verifyProvider: (providerId: string, act: "approve" | "reject" | "request_info" | "suspend" | "reactivate", notes?: string, actorId?: string) =>
    action("admin-verify-provider", { providerId, action: act, notes, actorId }),
  updatePricing: (serviceId: string, patientPrice: number, providerPayout: number, effectiveFrom?: string, actorId?: string) =>
    action("admin-update-pricing", { serviceId, patientPrice, providerPayout, effectiveFrom, actorId }),
  updateCommission: (pharmacyId: string, percentage: number, actorId?: string) =>
    action("admin-pharmacy-commission", { pharmacyId, percentage, actorId }),
};

export type { ProviderVerificationStatus };
