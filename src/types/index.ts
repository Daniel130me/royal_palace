// Royal Palace Health Care — shared domain types
// These mirror the Prisma models and are used by the client service layer
// and the UI. Keeping them in one place means the production API can later
// replace the mock API without touching the UI.

export type UserRole =
  | "patient"
  | "doctor"
  | "dentist"
  | "pharmacy"
  | "laboratory"
  | "logistics"
  | "manager"
  | "admin";

export type UserStatus = "active" | "pending" | "suspended";

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: UserStatus;
  profileId?: string | null;
  name: string;
}

export interface Session {
  userId: string;
  role: UserRole;
  profileId?: string;
}

export interface HealthRecordItem {
  name: string;
  source: "patient-reported" | "provider-confirmed" | "imported";
  status: "active" | "resolved";
  recordedAt: string;
}

export interface Patient {
  id: string;
  userId: string;
  parentPatientId?: string | null;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  country: string;
  bloodGroup?: string | null;
  genotype?: string | null;
  height?: number | null;
  weight?: number | null;
  allergies: HealthRecordItem[];
  conditions: HealthRecordItem[];
  medications: HealthRecordItem[];
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRel?: string | null;
}

export type ProviderVerificationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "additional_information_requested"
  | "approved"
  | "rejected"
  | "suspended"
  | "expired"
  | "reverification_required";

export interface Provider {
  id: string;
  userId: string;
  providerNumber: string;
  firstName: string;
  lastName: string;
  title: string;
  specialty: string;
  professionalTitle: string;
  qualifications: string[];
  yearsExperience: number;
  biography: string;
  languages: string[];
  registrationNumber: string;
  licenceNumber: string;
  licenceExpiry: string;
  verificationStatus: ProviderVerificationStatus;
  consultationModes: string[];
  city: string;
  state: string;
  rating: number;
  reviewCount: number;
  profileImage?: string | null;
  consultationFee: number;
}

export interface Service {
  id: string;
  category: string;
  name: string;
  description?: string | null;
  active: boolean;
  prices?: ServicePrice[];
}

export interface ServicePrice {
  id: string;
  serviceId: string;
  patientPrice: number;
  providerPayout: number;
  platformMargin: number;
  currency: string;
  effectiveFrom: string;
  status: string;
}

export type AppointmentStatus =
  | "scheduled"
  | "checked_in"
  | "waiting_for_provider"
  | "in_progress"
  | "awaiting_documentation"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "pending" | "paid" | "refunded";

export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  serviceId?: string | null;
  servicePriceId?: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  consultationChannel: string;
  price: number;
  paymentStatus: PaymentStatus;
  status: AppointmentStatus;
  intakeForm: Record<string, unknown>;
  consentStatus: string;
  patient?: Patient;
  provider?: Provider;
  encounter?: ClinicalEncounter | null;
  payment?: Payment | null;
}

export type EncounterStatus = "open" | "completed" | "amended";

export interface EncounterDocumentation {
  consultationReason?: string;
  chiefComplaint?: string;
  historyPresentIllness?: string;
  relevantMedicalHistory?: string;
  medicationHistory?: string;
  allergyConfirmation?: string;
  familyHistory?: string;
  socialHistory?: string;
  vitalSigns?: Record<string, string>;
  examinationFindings?: string;
  assessment?: string;
  diagnosis?: string;
  differentialDiagnosis?: string;
  treatmentPlan?: string;
  followUp?: string;
  patientInstructions?: string;
  safetyNetting?: string;
  attachments?: FileMeta[];
}

export interface FileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface ClinicalEncounter {
  id: string;
  encounterNumber: string;
  appointmentId: string;
  patientId: string;
  providerId: string;
  status: EncounterStatus;
  locked: boolean;
  documentation: EncounterDocumentation;
  signedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  appointment?: Appointment;
  patient?: Patient;
  provider?: Provider;
  prescriptions?: Prescription[];
  labRequests?: LaboratoryRequest[];
  referrals?: Referral[];
  diagnoses?: Diagnosis[];
}

export interface Diagnosis {
  id: string;
  encounterId: string;
  patientId: string;
  code?: string | null;
  description: string;
  type: string;
  status: string;
}

export type PrescriptionStatus =
  | "issued"
  | "awaiting_pharmacy"
  | "partially_fulfilled"
  | "fulfilled"
  | "expired"
  | "cancelled";

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  encounterId?: string | null;
  patientId: string;
  providerId: string;
  status: PrescriptionStatus;
  validityStartDate: string;
  expiryDate: string;
  notes?: string | null;
  doctorNote?: string | null;
  pharmacyId?: string | null;
  patient?: Patient;
  provider?: Provider;
  pharmacy?: Pharmacy | null;
  items?: PrescriptionItem[];
  pharmacyOrders?: PharmacyOrder[];
}

export interface PrescriptionItem {
  id: string;
  prescriptionId: string;
  medicine: string;
  genericName?: string | null;
  strength: string;
  dosageForm: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  refillAllowance: number;
  substitutionAllowed: boolean;
  instructions?: string | null;
}

export type LabRequestStatus =
  | "pending_booking"
  | "booked"
  | "sample_collected"
  | "processing"
  | "quality_review"
  | "completed"
  | "cancelled";

export interface LaboratoryRequest {
  id: string;
  requestNumber: string;
  encounterId?: string | null;
  patientId: string;
  requestingProviderId: string;
  tests: string[];
  clinicalIndication?: string | null;
  priority: string;
  preparationInstructions?: string | null;
  fastingRequired: boolean;
  sampleType?: string | null;
  notes?: string | null;
  status: LabRequestStatus;
  patient?: Patient;
  provider?: Provider;
  booking?: LaboratoryBooking | null;
  result?: LaboratoryResult | null;
}

export interface LaboratoryBooking {
  id: string;
  bookingNumber: string;
  requestId: string;
  patientId: string;
  laboratoryId: string;
  collectionMode: string;
  homeAddress?: string | null;
  date: string;
  time: string;
  price: number;
  paymentStatus: string;
  status: string;
  laboratory?: Laboratory;
  patient?: Patient;
  request?: LaboratoryRequest;
}

export interface LaboratoryResult {
  id: string;
  resultNumber: string;
  requestId: string;
  bookingId?: string | null;
  patientId: string;
  laboratoryId: string;
  test: string;
  sampleCollectionDate: string;
  resultDate: string;
  value: string;
  unit?: string | null;
  referenceRange?: string | null;
  abnormalIndicator?: string | null;
  interpretation?: string | null;
  attachment?: string | null;
  reviewer?: string | null;
  status: string;
  laboratory?: Laboratory;
  patient?: Patient;
  request?: LaboratoryRequest;
  booking?: LaboratoryBooking;
}

export interface Pharmacy {
  id: string;
  userId: string;
  pharmacyNumber: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  verificationStatus: string;
  commissionPct: number;
  rating: number;
  // Manager module attribution (see plan §4). acquiredBy is permanent;
  // currentManager changes with reassignment and keeps assignment history.
  acquiredByManagerId?: string | null;
  acquiredAt?: string | null;
  currentManagerId?: string | null;
  managerAssignedAt?: string | null;
  managerRelationshipStatus?: ManagerRelationshipStatus | null;
}

export interface PharmacyProduct {
  id: string;
  pharmacyId: string;
  name: string;
  genericName: string;
  brand?: string | null;
  category: string;
  strength: string;
  dosageForm: string;
  manufacturer?: string | null;
  price: number;
  stockQuantity: number;
  batch?: string | null;
  expiryDate: string;
  prescriptionRequired: boolean;
  controlled: boolean;
  storageRequirements?: string | null;
  status: string;
  pharmacy?: Pharmacy;
}

export type PharmacyOrderStatus =
  | "paid"
  | "prescription_under_review"
  | "clarification_required"
  | "accepted"
  | "partially_available"
  | "rejected"
  | "preparing"
  | "ready_for_pickup"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface PharmacyOrder {
  id: string;
  orderNumber: string;
  prescriptionId?: string | null;
  patientId: string;
  pharmacyId: string;
  deliveryAddress?: string | null;
  deliveryFee: number;
  subtotal: number;
  commissionTotal: number;
  total: number;
  paymentStatus: string;
  status: PharmacyOrderStatus;
  verificationCode?: string | null;
  createdAt?: string;
  updatedAt?: string;
  patient?: Patient;
  pharmacy?: Pharmacy;
  prescription?: Prescription | null;
  items?: PharmacyOrderItem[];
  delivery?: Delivery | null;
}

export interface PharmacyOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  commissionPct: number;
  commissionAmount: number;
  pharmacyNet: number;
}

export interface Laboratory {
  id: string;
  userId: string;
  laboratoryNumber: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  verificationStatus: string;
  rating: number;
  // Manager module attribution — same semantics as Pharmacy.
  acquiredByManagerId?: string | null;
  acquiredAt?: string | null;
  currentManagerId?: string | null;
  managerAssignedAt?: string | null;
  managerRelationshipStatus?: ManagerRelationshipStatus | null;
}

export interface LogisticsProvider {
  id: string;
  userId: string;
  logisticsNumber: string;
  name: string;
  vehicleType: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  verificationStatus: string;
}

export type DeliveryStatus =
  | "assigned"
  | "accepted"
  | "heading_to_pickup"
  | "arrived_at_pickup"
  | "pickup_verified"
  | "picked_up"
  | "in_transit"
  | "arrived_at_destination"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled";

export interface Delivery {
  id: string;
  deliveryNumber: string;
  orderId: string;
  logisticsProviderId: string;
  packageType: string;
  pickupLocation: string;
  pickupContact: string;
  deliveryLocation: string;
  recipientName: string;
  handlingInstruction?: string | null;
  verificationCode: string;
  payout: number;
  status: DeliveryStatus;
  createdAt?: string;
  updatedAt?: string;
  logisticsProvider?: LogisticsProvider;
  order?: PharmacyOrder;
}

export type ReferralStatus =
  | "draft"
  | "sent"
  | "received"
  | "accepted"
  | "declined"
  | "in_progress"
  | "completed"
  | "expired"
  | "requires_clarification";

export interface Referral {
  id: string;
  referralNumber: string;
  encounterId?: string | null;
  patientId: string;
  senderProviderId: string;
  recipientProviderId?: string | null;
  recipientSpecialty?: string | null;
  reason: string;
  symptoms?: string | null;
  relevantHistory?: string | null;
  diagnosis?: string | null;
  currentTreatment?: string | null;
  requiredAction?: string | null;
  urgency: string;
  attachments: FileMeta[];
  accessExpiry?: string | null;
  status: ReferralStatus;
  patient?: Patient;
  sender?: Provider;
  recipient?: Provider | null;
}

export interface RecordAccessGrant {
  id: string;
  patientId: string;
  granteeType: string;
  granteeId?: string | null;
  granteeName: string;
  organisation?: string | null;
  reason: string;
  informationShared: string[];
  grantedAt: string;
  expiresAt?: string | null;
  relatedEncounterId?: string | null;
  relatedReferralId?: string | null;
  status: "active" | "revoked" | "expired";
}

export interface Consent {
  id: string;
  patientId: string;
  type: string;
  status: string;
  grantedAt: string;
  details?: string | null;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  appointmentId?: string | null;
  patientId: string;
  amount: number;
  method: string;
  status: string;
  reference?: string | null;
  createdAt: string;
}

export interface Settlement {
  id: string;
  settlementNumber: string;
  entityType: string;
  entityId: string;
  entityName: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
  status: string;
}

export interface CarePlan {
  id: string;
  patientId: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  status: string;
  goals: string[];
}

export interface Notification {
  id: string;
  recipientId: string;
  recipientType: string;
  title: string;
  body: string;
  type: string;
  relatedId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface ProviderApplication {
  id: string;
  providerId: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  reviewerNotes?: string | null;
  documents: FileMeta[];
  history: { status: string; at: string; by: string; note?: string }[];
  provider?: Provider;
}

export interface Complaint {
  id: string;
  complainantId: string;
  complainantType: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  timestamp: string;
}

export interface Rating {
  id: string;
  patientId: string;
  entityType: string;
  entityId: string;
  score: number;
  comment?: string | null;
  createdAt: string;
}

export type PayoutStatus = "requested" | "processing" | "paid" | "rejected";

export interface PayoutRequest {
  id: string;
  payoutNumber: string;
  entityType: "provider" | "pharmacy" | "laboratory" | "logistics" | "manager";
  entityId: string;
  entityName: string;
  amountRequested: number;
  periodStart: string;
  periodEnd: string;
  status: PayoutStatus;
  method: string;
  notes?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  processedBy?: string | null;
  adminNote?: string | null;
}

export type UploadedPrescriptionStatus = "uploaded" | "under_review" | "accepted" | "rejected";

export interface UploadedPrescription {
  id: string;
  uploadNumber: string;
  patientId: string;
  patientName: string;
  prescriberName?: string | null;
  prescriberFacility?: string | null;
  notes?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  dataUrl: string;
  status: UploadedPrescriptionStatus;
  pharmacyId?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  patient?: Patient;
}

// ---------------------------------------------------------------------------
// MANAGER MODULE (see MANAGER_MODULE_AGENT_IMPLEMENTATION_PLAN.md)
// A Manager is a business-relationship role: they acquire/onboard pharmacies
// and laboratories, manage a portfolio, earn a configured share of eligible
// organization-to-platform payments, and provide first-level support.
// Managers never see patient or clinical data.
// ---------------------------------------------------------------------------

export type ManagerOrganizationType = "pharmacy" | "laboratory";

export type ManagerEmploymentStatus =
  | "full_time"
  | "contract"
  | "probation"
  | "suspended"
  | "offboarding";

export type ManagerVerificationStatus = "pending" | "verified" | "rejected" | "suspended";

/** Relationship between a manager and an organization (assignment history rows keep this state). */
export type ManagerRelationshipStatus = "active" | "paused" | "ended";

export type ManagerAssignmentSource =
  | "acquisition" // manager brought the organization onto the platform
  | "application_approval"
  | "admin_assignment" // admin assigned an independently-registered organization
  | "reassignment";

export type ManagerApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "information_required"
  | "approved"
  | "rejected";

/** Organization payments are platform-facing fees only — never patient transactions. */
export type OrganizationTransactionType = "subscription" | "renewal" | "platform_fee" | "service_fee";

export type OrganizationPaymentStatus =
  | "pending"
  | "successful"
  | "failed"
  | "cancelled"
  | "refunded";

export type ManagerEarningEntryType = "earning" | "reversal";

export type ManagerEarningStatus = "pending" | "available" | "paid" | "reversed";

export type ManagerPayoutStatus = "requested" | "processing" | "paid" | "rejected";

export type ManagerTicketStatus =
  | "new"
  | "assigned_to_manager"
  | "manager_investigating"
  | "waiting_for_organization"
  | "escalated_to_royal_palace"
  | "royal_palace_investigating"
  | "resolved"
  | "closed"
  | "reopened";

export type ManagerTicketPriority = "low" | "medium" | "high" | "urgent";

/** Message visibility: shared = both sides, manager_internal/admin_internal filtered by role. */
export type ManagerTicketVisibility = "shared" | "manager_internal" | "admin_internal";

export interface Manager {
  id: string;
  userId: string;
  managerNumber: string;
  onboardingCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  territory: string;
  employmentStatus: ManagerEmploymentStatus;
  verificationStatus: ManagerVerificationStatus;
  joinedAt: string;
  profileImage?: string | null;
}

/** Portfolio row shown to managers — business fields only, never clinical data. */
export interface ManagerOrganization {
  id: string;
  organizationType: ManagerOrganizationType;
  organizationNumber: string;
  name: string;
  city: string;
  state: string;
  verificationStatus: string;
  relationshipStatus: ManagerRelationshipStatus;
  dateAssigned?: string | null;
  acquiredByManagerId?: string | null;
  acquiredAt?: string | null;
  lastPaymentAt?: string | null;
  lastPaymentAmount?: number | null;
  totalEarnings: number;
  openTicketCount: number;
}

export interface ManagerAssignment {
  id: string;
  managerId: string;
  organizationType: ManagerOrganizationType;
  pharmacyId?: string | null;
  laboratoryId?: string | null;
  organizationName: string;
  source: ManagerAssignmentSource;
  relationshipStatus: ManagerRelationshipStatus;
  startsAt: string;
  endsAt?: string | null;
  assignedBy: string;
  reason?: string | null;
  createdAt: string;
}

export interface ManagerOrganizationApplication {
  id: string;
  applicationNumber: string;
  managerId: string;
  organizationType: ManagerOrganizationType;
  businessName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  registrationNumber: string;
  licenceNumber?: string | null;
  notes?: string | null;
  status: ManagerApplicationStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  reviewerNote?: string | null;
  createdOrganizationId?: string | null;
  createdAt: string;
}

export interface OrganizationPayment {
  id: string;
  paymentNumber: string;
  organizationType: ManagerOrganizationType;
  pharmacyId?: string | null;
  laboratoryId?: string | null;
  organizationName: string;
  transactionType: OrganizationTransactionType;
  amount: number;
  currency: string;
  method: string;
  status: OrganizationPaymentStatus;
  reference: string;
  paidAt?: string | null;
  refundedAt?: string | null;
  refundAmount: number;
  createdAt: string;
}

export interface ManagerRevenueShareRule {
  id: string;
  managerId: string;
  organizationType: ManagerOrganizationType;
  transactionType: OrganizationTransactionType;
  /** Integer basis points: 10000 = 100%, 300 = 3.00%. Never a float percentage. */
  rateBps: number;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  status: "active" | "retired";
  createdBy: string;
  approvedBy?: string | null;
  createdAt: string;
}

/** Immutable ledger row. Reversals are separate negative entries linked to the original. */
export interface ManagerEarning {
  id: string;
  earningNumber: string;
  eventKey: string;
  managerId: string;
  managerAssignmentId?: string | null;
  organizationPaymentId: string;
  organizationType: ManagerOrganizationType;
  organizationId: string;
  organizationName: string;
  paymentType: OrganizationTransactionType;
  paymentNumber: string;
  eligibleAmount: number;
  rateBps: number;
  /** Signed: positive for earning entries, negative for reversal entries. */
  amount: number;
  entryType: ManagerEarningEntryType;
  status: ManagerEarningStatus;
  occurredAt: string;
  availableAt?: string | null;
  reversalOfId?: string | null;
  payoutRequestId?: string | null;
  payoutNumber?: string | null;
  createdAt: string;
}

export interface ManagerBankAccount {
  id: string;
  managerId: string;
  bankName: string;
  bankCode: string;
  accountName: string;
  /** API responses only ever return the masked form (****1234). */
  accountNumberMasked: string;
  verificationStatus: "pending" | "verified" | "failed";
  verifiedAt?: string | null;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  organizationType: ManagerOrganizationType;
  organizationId: string;
  organizationName: string;
  managerId?: string | null;
  creatorId: string;
  creatorName: string;
  subject: string;
  category: string;
  priority: ManagerTicketPriority;
  status: ManagerTicketStatus;
  escalationDepartment?: string | null;
  escalationReason?: string | null;
  escalatedAt?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  messageCount: number;
  lastActivityAt: string;
  createdAt: string;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  body: string;
  visibility: ManagerTicketVisibility;
  createdAt: string;
}

/** Aggregated dashboard payload — computed with DB aggregates, not client-side reduces. */
export interface ManagerDashboardSummary {
  portfolio: {
    total: number;
    pharmacies: number;
    laboratories: number;
    active: number;
    pendingVerification: number;
    inactive: number;
    suspended: number;
    acquiredByManager: number;
  };
  payments: {
    successfulThisMonth: number;
    countThisMonth: number;
  };
  earnings: {
    thisMonth: number;
    pending: number;
    available: number;
    paid: number;
    reversed: number;
  };
  payouts: {
    availableBalance: number;
    pendingPayout: number;
  };
  support: {
    open: number;
    awaitingManager: number;
    escalated: number;
  };
  applications: {
    pending: number;
  };
  monthly: { month: string; payments: number; earnings: number }[];
}

/** Server-projected, manager-safe organization shape (see manager-access.ts). */
export interface ManagerOrganizationDto {
  id: string;
  organizationType: ManagerOrganizationType;
  organizationNumber: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  verificationStatus: string;
  joinedAt: string;
  acquiredByManagerId: string | null;
  acquiredAt: string | null;
  currentManagerId: string | null;
  managerAssignedAt: string | null;
  managerRelationshipStatus: string | null;
}
