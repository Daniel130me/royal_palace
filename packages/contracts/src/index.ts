export type PlatformRole =
  | "PATIENT"
  | "MANAGER"
  | "ORGANIZATION_APPLICANT"
  | "ORGANIZATION_ADMIN"
  | "ORGANIZATION_STAFF"
  | "PROVIDER"
  | "SUPPORT"
  | "ADMINISTRATOR"
  | "FINANCE"
  | "LOGISTICS"
  | "SYSTEM_WORKER";

export interface AuthenticatedMembership {
  organizationId: string;
  organizationType: "HOSPITAL" | "PHARMACY" | "LABORATORY" | "LOGISTICS";
  roles: readonly PlatformRole[];
}

export type LogisticsDeliveryStatus =
  | "ASSIGNED"
  | "ACCEPTED"
  | "HEADING_TO_PICKUP"
  | "ARRIVED_AT_PICKUP"
  | "PICKUP_VERIFIED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "ARRIVED_AT_DESTINATION"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED"
  | "CANCELLED";

export interface CurrentSession {
  absoluteExpiresAt: string;
  assuranceContext: string | null;
  authenticationMethods: readonly string[];
  authenticatedAt: string;
  idleExpiresAt: string;
  memberships: readonly AuthenticatedMembership[];
  principalId: string;
  roles: readonly PlatformRole[];
  sessionId: string;
}

export type OrganizationTeamInvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface OrganizationTeamMemberResponse {
  effectiveFrom: string;
  id: string;
  principalId: string;
  roles: readonly PlatformRole[];
  version: number;
}

export interface OrganizationTeamInvitationResponse {
  createdAt: string;
  expiresAt: string;
  id: string;
  role: "ORGANIZATION_STAFF";
  status: OrganizationTeamInvitationStatus;
  version: number;
}

export interface OrganizationTeamResponse {
  invitations: readonly OrganizationTeamInvitationResponse[];
  members: readonly OrganizationTeamMemberResponse[];
  organization: {
    displayName: string;
    id: string;
    type: AuthenticatedMembership["organizationType"];
  };
}

export interface CreateOrganizationTeamInvitationResponse {
  invitation: OrganizationTeamInvitationResponse;
  /** A high-entropy bearer secret returned once. Persisting or logging it is forbidden. */
  token: string;
}

export interface AcceptOrganizationTeamInvitationResponse {
  membershipId: string;
  organization: {
    displayName: string;
    id: string;
    type: AuthenticatedMembership["organizationType"];
  };
}

export const NOTIFICATION_TEMPLATE = {
  APPLICATION_ACTION_REQUIRED: "APPLICATION_ACTION_REQUIRED",
  APPLICATION_STATUS_UPDATED: "APPLICATION_STATUS_UPDATED",
  APPOINTMENT_STATUS_UPDATED: "APPOINTMENT_STATUS_UPDATED",
  PAYMENT_STATUS_UPDATED: "PAYMENT_STATUS_UPDATED",
  PHARMACY_ORDER_ACTION_REQUIRED: "PHARMACY_ORDER_ACTION_REQUIRED",
  PHARMACY_ORDER_STATUS_UPDATED: "PHARMACY_ORDER_STATUS_UPDATED",
  LABORATORY_RESULT_ACTION_REQUIRED: "LABORATORY_RESULT_ACTION_REQUIRED",
  LABORATORY_RESULT_PUBLISHED: "LABORATORY_RESULT_PUBLISHED",
  LOGISTICS_RECIPIENT_CODE: "LOGISTICS_RECIPIENT_CODE",
  LOGISTICS_DELIVERY_STATUS_UPDATED: "LOGISTICS_DELIVERY_STATUS_UPDATED",
  PRESCRIPTION_ACTION_REQUIRED: "PRESCRIPTION_ACTION_REQUIRED",
  PRESCRIPTION_STATUS_UPDATED: "PRESCRIPTION_STATUS_UPDATED",
  SECURITY_ALERT: "SECURITY_ALERT",
} as const;

export type NotificationTemplateKey =
  (typeof NOTIFICATION_TEMPLATE)[keyof typeof NOTIFICATION_TEMPLATE];
export type NotificationChannel = "EMAIL" | "SMS" | "PUSH";
export type NotificationCategory = "SECURITY" | "TRANSACTIONAL" | "MARKETING";

export interface NotificationReplayResponse {
  id: string;
  replayOfId: string;
  status: "PENDING";
}

export interface NotificationInboxItemResponse {
  category: NotificationCategory;
  createdAt: string;
  id: string;
  locale: string;
  readAt: string | null;
  reference: string;
  resourceId: string | null;
  resourceType: string | null;
  templateKey: NotificationTemplateKey;
}

export interface NotificationInboxListResponse {
  data: readonly NotificationInboxItemResponse[];
  pageInfo: CursorPageInfo;
  unreadCount: number;
}

export interface NotificationReadResponse {
  id: string;
  readAt: string;
}

export interface NotificationMarkAllReadResponse {
  hasMore: boolean;
  markedCount: number;
}

export interface NotificationPreferenceResponse {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  mutable: boolean;
  version: number;
}

export interface NotificationPreferenceListResponse {
  data: readonly NotificationPreferenceResponse[];
}

export interface BeginLoginResponse {
  authorizationUrl: string;
  transactionId: string;
}

export interface CompleteLoginResponse {
  csrfToken: string;
  returnTo: string;
  sessionId: string;
}

export interface LogoutResponse {
  endSessionUrl: string | null;
}

export interface CursorPageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export type AdminAppointmentScope = "ALL" | "TODAY" | "UPCOMING" | "COMPLETED" | "UNSUCCESSFUL";

export interface AdminAppointmentListItem {
  amountMinor: string;
  currency: string;
  endsAt: string;
  id: string;
  mode: PublicConsultationMode;
  patient: { id: string; displayName: string };
  practitioner: { id: string; displayName: string };
  startsAt: string;
  status: AppointmentStatus;
}

export interface AdminAppointmentSummary {
  all: number;
  completed: number;
  today: number;
  unsuccessful: number;
  upcoming: number;
}

export interface AdminAppointmentListResponse {
  data: readonly AdminAppointmentListItem[];
  pageInfo: CursorPageInfo;
  summary: AdminAppointmentSummary;
}

export interface AdminAuditEventListItem {
  action: string;
  actorPrincipalId: string | null;
  effectiveRole: PlatformRole | null;
  id: string;
  occurredAt: string;
  reasonCode: string | null;
  resourceId: string;
  resourceType: string;
  result: "DENIED" | "FAILED" | "SUCCEEDED";
}

export interface AdminAuditEventListResponse {
  data: readonly AdminAuditEventListItem[];
  pageInfo: CursorPageInfo;
}

export type AdminComplaintStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
export type AdminComplaintPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type AdminComplaintScope = "ALL" | "OPEN" | "RESOLVED";
export type AdminDeliveryScope = "ALL" | "ACTIVE" | "DELIVERED" | "EXCEPTION";

export interface AdminComplaintListItem {
  complaintNumber: string;
  complainantType: PlatformRole | "EXTERNAL";
  createdAt: string;
  description: string;
  id: string;
  priority: AdminComplaintPriority;
  status: AdminComplaintStatus;
  subject: string;
  updatedAt: string;
  version: number;
}

export interface AdminComplaintSummary {
  all: number;
  open: number;
  resolved: number;
  urgent: number;
}

export interface AdminComplaintListResponse {
  data: readonly AdminComplaintListItem[];
  pageInfo: CursorPageInfo;
  summary: AdminComplaintSummary;
}

export interface AdminComplaintTransitionResponse extends AdminComplaintListItem {
  resolvedAt: string | null;
}

export interface AdminDeliveryListItem {
  courierAssigned: boolean;
  deliveryArea: {
    administrativeArea: string;
    countryCode: string;
    locality: string;
    postalCode?: string;
  };
  deliveryNumber: string;
  handoffReference: string;
  id: string;
  logisticsOrganizationId: string;
  orderNumber: string;
  pharmacyOrganizationId: string;
  status: LogisticsDeliveryStatus;
  updatedAt: string;
}

export interface AdminDeliverySummary {
  active: number;
  all: number;
  delivered: number;
  exception: number;
}

export interface AdminDeliveryListResponse {
  data: readonly AdminDeliveryListItem[];
  pageInfo: CursorPageInfo;
  summary: AdminDeliverySummary;
}

export interface AdminDashboardMoneyTotal {
  amountMinor: string;
  currency: string;
}

export interface AdminDashboardResponse {
  attention: {
    expiringCredentials: number;
    openComplaints: number;
    pendingApplications: number;
  };
  counts: {
    activeDeliveries: number;
    appointmentsToday: number;
    laboratoryBookings: number;
    patients: number;
    verifiedPractitioners: number;
  };
  paymentVolume: readonly AdminDashboardMoneyTotal[];
  recentAuditEvents: readonly AdminAuditEventListItem[];
  recentComplaints: readonly AdminComplaintListItem[];
}

export type AdminPractitionerScope = "ALL" | "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
export type PractitionerVerificationStatus = "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";

export interface AdminPractitionerListItem {
  createdAt: string;
  displayName: string;
  id: string;
  primaryProfession: string | null;
  primarySpecialty: string | null;
  updatedAt: string;
  verificationStatus: PractitionerVerificationStatus;
  version: number;
}

export interface AdminPractitionerSummary {
  all: number;
  pending: number;
  revoked: number;
  suspended: number;
  verified: number;
}

export interface AdminPractitionerListResponse {
  data: readonly AdminPractitionerListItem[];
  pageInfo: CursorPageInfo;
  summary: AdminPractitionerSummary;
}

export interface AdminPractitionerVerificationHistoryItem {
  actorPrincipalId: string;
  fromStatus: PractitionerVerificationStatus;
  id: string;
  note: string | null;
  occurredAt: string;
  reasonCode: string;
  toStatus: PractitionerVerificationStatus;
}

export interface AdminPractitionerDetail extends AdminPractitionerListItem {
  approvedApplicationId: string | null;
  affiliations: readonly {
    facilityName: string;
    id: string;
    organizationId: string | null;
    roleTitle: string | null;
  }[];
  biography: string | null;
  credentials: readonly {
    credentialType: string;
    expiresAt: string | null;
    id: string;
    issuerName: string;
    jurisdictionCode: string;
    registrationNumber: string;
    verifiedAt: string | null;
  }[];
  documents: readonly {
    declaredContentType: string;
    declaredSizeBytes: number;
    id: string;
    originalFilename: string;
    purpose: string;
    status: string;
  }[];
  headline: string | null;
  languages: readonly string[];
  professions: readonly { id: string; isPrimary: boolean; name: string }[];
  serviceModes: readonly PublicConsultationMode[];
  specialties: readonly { id: string; isPrimary: boolean; name: string }[];
  verificationHistory: readonly AdminPractitionerVerificationHistoryItem[];
  yearsExperience: number | null;
}

export interface AdminPractitionerTransitionInput {
  expectedVersion: number;
  note?: string;
  status: "VERIFIED" | "SUSPENDED" | "REVOKED";
}

export interface PublicService {
  category: string;
  code: string;
  id: string;
  name: string;
}

/** Public-safe projection of one currently effective, administrator-approved service price. */
export interface PublicServicePrice {
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  patientPriceMinor: string;
  service: PublicService;
}

export interface PublicServicePriceListResponse {
  data: readonly PublicServicePrice[];
  pageInfo: CursorPageInfo;
}

export interface PublicSupportConfigResponse {
  availability: string | null;
  email: string | null;
  phoneE164: string | null;
}

export interface LaboratoryWorkspacePriceResponse {
  currency: string;
  laboratoryPayoutMinor: string;
  patientPriceMinor: string;
}

export interface ServicePriceResponse {
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  id: string;
  patientPriceMinor: string;
  providerPayoutMinor: string;
  service: PublicService;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  version: number;
}

export interface ServicePriceListResponse {
  data: readonly ServicePriceResponse[];
}

export interface LaboratoryWorkspaceServiceResponse {
  category: string;
  code: string;
  description: string | null;
  id: string;
  name: string;
  pricing: LaboratoryWorkspacePriceResponse | null;
  status: "ACTIVE" | "INACTIVE";
  supportsHomeCollection: boolean;
}

export interface LaboratoryWorkspaceResponse {
  organization: {
    displayName: string;
    id: string;
    legalName: string;
    publicPhone: string | null;
    verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
    websiteUrl: string | null;
  };
  primaryLocation: {
    addressLine1: string | null;
    addressLine2: string | null;
    administrativeArea: string | null;
    countryCode: string;
    label: string;
    locality: string | null;
    postalCode: string | null;
    publicPhone: string | null;
  } | null;
  registration: {
    authorityName: string;
    jurisdictionCode: string;
    registrationNumber: string;
    verifiedAt: string | null;
  } | null;
  rating: OrganizationRatingSummary;
  services: readonly LaboratoryWorkspaceServiceResponse[];
}

export interface OrganizationRatingSummary {
  averageScore: number | null;
  reviewCount: number;
}

export interface PublicFacilityLocation {
  addressLine1: string | null;
  addressLine2: string | null;
  administrativeArea: string | null;
  countryCode: string;
  id: string;
  label: string;
  locality: string | null;
  postalCode: string | null;
  publicPhone: string | null;
}

export type PublicOrganizationType = "HOSPITAL" | "PHARMACY" | "LABORATORY";

export interface PublicOrganizationSummary {
  acceptingPatients: boolean;
  displayName: string;
  emergencyAvailable: boolean;
  homeCollectionServiceCodes: readonly string[];
  id: string;
  locations: readonly PublicFacilityLocation[];
  openTwentyFourHours: boolean;
  organizationType: PublicOrganizationType;
  rating: OrganizationRatingSummary;
  services: readonly PublicService[];
  slug: string;
  summary: string | null;
}

export interface PublicOrganizationDetail extends PublicOrganizationSummary {
  websiteUrl: string | null;
}

export interface PublicHospitalSummary extends PublicOrganizationSummary {
  organizationType: "HOSPITAL";
}

export interface PublicHospitalDetail extends PublicOrganizationDetail {
  organizationType: "HOSPITAL";
}

export interface PublicOrganizationFilters {
  countryCode?: string;
  emergencyAvailable?: boolean;
  location?: string;
  openTwentyFourHours?: boolean;
  query?: string;
  serviceCode?: string;
}

export type PublicHospitalFilters = PublicOrganizationFilters;

export interface PublicHospitalListResponse {
  data: readonly PublicHospitalSummary[];
  pageInfo: CursorPageInfo;
}

export interface PublicOrganizationListResponse {
  data: readonly PublicOrganizationSummary[];
  pageInfo: CursorPageInfo;
}

export interface PublicServiceListResponse {
  data: readonly PublicService[];
}

export type PublicConsultationMode = "VIDEO" | "AUDIO" | "CHAT" | "IN_PERSON" | "HOME_VISIT";

export interface PublicProfession {
  code: string;
  id: string;
  name: string;
}

export interface PublicSpecialty {
  category: string;
  code: string;
  id: string;
  name: string;
}

export interface PublicPractitionerLocation {
  administrativeArea: string | null;
  countryCode: string;
  id: string;
  label: string;
  locality: string | null;
  postalCode: string | null;
}

export interface PublicPractitionerAffiliation {
  facilityName: string;
  roleTitle: string | null;
}

export interface PublicPractitionerCredential {
  awardedYear: number | null;
  issuerName: string;
  jurisdictionCode: string | null;
  title: string;
}

export interface PublicPractitionerSummary {
  acceptingPatients: boolean;
  displayName: string;
  headline: string | null;
  id: string;
  languages: readonly string[];
  locations: readonly PublicPractitionerLocation[];
  professions: readonly PublicProfession[];
  serviceModes: readonly PublicConsultationMode[];
  slug: string;
  specialties: readonly PublicSpecialty[];
  yearsExperience: number | null;
}

export interface PublicPractitionerDetail extends PublicPractitionerSummary {
  affiliations: readonly PublicPractitionerAffiliation[];
  biography: string | null;
  credentials: readonly PublicPractitionerCredential[];
}

export interface PublicPractitionerFilters {
  countryCode?: string;
  languageTag?: string;
  location?: string;
  professionCode?: string;
  query?: string;
  serviceMode?: PublicConsultationMode;
  specialtyCode?: string;
}

export interface PublicPractitionerListResponse {
  data: readonly PublicPractitionerSummary[];
  pageInfo: CursorPageInfo;
}

export interface PublicProfessionListResponse {
  data: readonly PublicProfession[];
}

export interface PublicSpecialtyListResponse {
  data: readonly PublicSpecialty[];
}

export type OnboardingApplicationKind = "PATIENT" | "ORGANIZATION" | "PRACTITIONER";
export type OnboardingApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";
export type ApplicationNoteVisibility = "APPLICANT" | "INTERNAL";
export type ApplicationDocumentStatus =
  "AWAITING_UPLOAD" | "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED" | "SCAN_FAILED";

export type ScannedPrescriptionStatus =
  | "AWAITING_UPLOAD"
  | "QUARANTINED"
  | "SCANNING"
  | "CLEAN"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "SCAN_FAILED"
  | "WITHDRAWN";

export interface ScannedPrescriptionHistoryEntry {
  fromStatus: ScannedPrescriptionStatus | null;
  id: string;
  occurredAt: string;
  patientVisibleNote: string | null;
  reasonCode: string;
  toStatus: ScannedPrescriptionStatus;
}

export interface ScannedPrescriptionSummary {
  createdAt: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  id: string;
  originalFilename: string;
  patientNote: string | null;
  pharmacyOrganizationId: string | null;
  prescriberFacility: string | null;
  prescriberName: string | null;
  status: ScannedPrescriptionStatus;
  statusReasonCode: string | null;
  updatedAt: string;
  uploadNumber: string;
  version: number;
}

export interface ScannedPrescriptionDetail extends ScannedPrescriptionSummary {
  history: readonly ScannedPrescriptionHistoryEntry[];
}

export interface PharmacyScannedPrescriptionSummary extends ScannedPrescriptionSummary {
  patient: { displayName: string };
}

export interface PharmacyScannedPrescriptionDetail extends PharmacyScannedPrescriptionSummary {
  history: readonly ScannedPrescriptionHistoryEntry[];
}

export interface PharmacyScannedPrescriptionListResponse {
  data: readonly PharmacyScannedPrescriptionSummary[];
  pageInfo: CursorPageInfo;
}

export interface ScannedPrescriptionListResponse {
  data: readonly ScannedPrescriptionSummary[];
  pageInfo: CursorPageInfo;
}

export interface ScannedPrescriptionUploadIntentResponse {
  prescription: ScannedPrescriptionDetail;
  upload: {
    expiresAt: string;
    headers: Readonly<Record<string, string>>;
    method: "PUT";
    url: string;
  };
}

export interface PrivateDocumentDownloadResponse {
  expiresAt: string;
  url: string;
}

export interface PatientApplicationData {
  countryCode: string | null;
  dateOfBirth: string | null;
  familyName: string;
  givenName: string;
  phoneE164: string | null;
  preferredLanguage: string | null;
}

export interface OrganizationApplicationData {
  addressLine1: string | null;
  addressLine2: string | null;
  administrativeArea: string | null;
  contactEmail: string;
  contactName: string;
  contactPhoneE164: string | null;
  countryCode: string;
  displayName: string;
  legalName: string;
  locality: string | null;
  organizationType: PublicOrganizationType;
  postalCode: string | null;
  jurisdictionCode: string;
  registrationAuthority: string;
  registrationNumber: string;
  serviceIds: readonly string[];
}

export interface PractitionerApplicationData {
  biography: string | null;
  credentialType: string;
  facilityName: string | null;
  familyName: string;
  givenName: string;
  honorific: string | null;
  jurisdictionCode: string;
  professionIds: readonly string[];
  registrationAuthority: string;
  registrationNumber: string;
  selectedOrganizationId: string | null;
  specialtyIds: readonly string[];
}

export type OnboardingApplicationData =
  | { kind: "PATIENT"; values: PatientApplicationData }
  | { kind: "ORGANIZATION"; values: OrganizationApplicationData }
  | { kind: "PRACTITIONER"; values: PractitionerApplicationData };

export interface ApplicationStatusHistoryEntry {
  fromStatus: OnboardingApplicationStatus | null;
  id: string;
  note: string | null;
  noteVisibility: ApplicationNoteVisibility;
  occurredAt: string;
  reasonCategory: string;
  toStatus: OnboardingApplicationStatus;
}

export interface ApplicationDocumentMetadata {
  declaredContentType: string;
  declaredSha256: string;
  declaredSizeBytes: number;
  id: string;
  originalFilename: string;
  purpose: string;
  status: ApplicationDocumentStatus;
  statusReasonCode: string | null;
}

export interface OnboardingApplicationSummary {
  createdAt: string;
  displayName: string;
  id: string;
  kind: OnboardingApplicationKind;
  status: OnboardingApplicationStatus;
  submittedAt: string | null;
  updatedAt: string;
  version: number;
}

export interface OnboardingApplicationDetail extends OnboardingApplicationSummary {
  approvedResourceId: string | null;
  data: OnboardingApplicationData;
  documents: readonly ApplicationDocumentMetadata[];
  history: readonly ApplicationStatusHistoryEntry[];
}

export interface OnboardingApplicationListResponse {
  data: readonly OnboardingApplicationSummary[];
  pageInfo: CursorPageInfo;
}

export interface ApplicationDocumentIntentResponse {
  document: ApplicationDocumentMetadata;
  upload: {
    expiresAt: string;
    headers: Readonly<Record<string, string>>;
    method: "PUT";
    url: string;
  };
}

export interface ApplicationDocumentDownloadResponse {
  expiresAt: string;
  url: string;
}

export type ManagerProfileStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type ReferralAudience = "PATIENT" | "ORGANIZATION";
export type ReferralLinkStatus = "ACTIVE" | "PAUSED" | "REVOKED";
export type PatientActivityType = "CONSULTATION" | "HOSPITAL" | "PHARMACY" | "LABORATORY";
export type CommissionPolicyStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type ManagerTicketCategory = "ONBOARDING" | "ACCOUNT" | "TECHNICAL" | "SERVICE" | "OTHER";
export type ManagerTicketStatus =
  "ESCALATED" | "IN_REVIEW" | "WAITING_MANAGER" | "RESOLVED" | "CLOSED";

export interface ManagerProfileResponse {
  displayName: string;
  id: string;
  status: ManagerProfileStatus;
}

export interface ManagerReferralLinkResponse {
  audience: ReferralAudience;
  id: string;
  label: string;
  organizationType: PublicOrganizationType | null;
  referralToken: string;
  status: ReferralLinkStatus;
  validFrom: string;
  validUntil: string | null;
}

export interface ManagerReferralStatusResponse {
  applicationKind: OnboardingApplicationKind;
  applicationStatus: OnboardingApplicationStatus;
  attributionId: string;
  createdAt: string;
  decidedAt: string | null;
  organizationType: PublicOrganizationType | null;
  referralLabel: string;
  referralLinkId: string;
  submittedAt: string | null;
}

export interface CommissionPolicyResponse {
  activityType: PatientActivityType;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  id: string;
  managerProfileId: string;
  minimumGrossMinor: string | null;
  rateBps: number;
  status: CommissionPolicyStatus;
  version: number;
}

export interface ReferralAttributionCorrectionResponse {
  applicationId: string;
  eventId: string;
  eventType: "CORRECTED" | "REMOVED";
  managerProfileId: string | null;
  referralLinkId: string | null;
  version: number;
}

export interface CurrencyAmount {
  amountMinor: string;
  currency: string;
}

export interface ManagerEarningBucket extends CurrencyAmount {
  periodStart: string;
}

export interface ManagerEarningEntryResponse extends CurrencyAmount {
  activityType: PatientActivityType;
  id: string;
  occurredAt: string;
  status: "AVAILABLE" | "PAID" | "REVERSED";
}

export interface ManagerEarningsReportResponse {
  buckets: ManagerEarningBucket[];
  entries: ManagerEarningEntryResponse[];
  pageInfo: CursorPageInfo;
  range: { from: string; timeZone: string; to: string };
  totals: CurrencyAmount[];
}

export interface ManagerTicketFollowUpResponse {
  body: string;
  createdAt: string;
  id: string;
}

export interface SupportManagerTicketFollowUpResponse extends ManagerTicketFollowUpResponse {
  visibility: "MANAGER" | "INTERNAL";
}

export interface SupportManagerTicketResponse extends Omit<ManagerTicketResponse, "followUps"> {
  followUps: SupportManagerTicketFollowUpResponse[];
  managerProfileId: string;
}

export interface ManagerTicketResponse {
  category: ManagerTicketCategory;
  createdAt: string;
  followUps: ManagerTicketFollowUpResponse[];
  id: string;
  status: ManagerTicketStatus;
  subjectDisplayName: string;
  subjectReference: string | null;
  ticketNumber: string;
  updatedAt: string;
  version: number;
}

export type AppointmentStatus =
  "PENDING_PAYMENT" | "CONFIRMED" | "PAYMENT_FAILED" | "EXPIRED" | "CANCELLED" | "COMPLETED";

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "REVERSED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "DISPUTED";

export type PaymentPurpose = "CONSULTATION" | "PHARMACY_ORDER" | "LABORATORY_BOOKING";

export interface PractitionerAvailabilityResponse {
  amountMinor: string;
  currency: string;
  endsAt: string;
  id: string;
  mode: PublicConsultationMode;
  practitionerId: string;
  startsAt: string;
}

export interface AppointmentResponse {
  amountMinor: string;
  currency: string;
  endsAt: string;
  id: string;
  mode: PublicConsultationMode;
  paymentId: string;
  practitioner: { displayName: string; id: string };
  startsAt: string;
  status: AppointmentStatus;
  version: number;
}

export interface HostedCheckoutResponse {
  checkoutUrl: string;
  expiresAt: string;
  paymentId: string;
  status: PaymentStatus;
}

export interface PaymentStatusResponse {
  amountMinor: string;
  appointmentId: string | null;
  currency: string;
  id: string;
  laboratoryBookingId: string | null;
  payableUntil: string;
  pharmacyOrderId: string | null;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  updatedAt: string;
}

export interface ConsultationFeeResponse {
  amountMinor: string;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  id: string;
  mode: PublicConsultationMode;
  practitionerId: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  version: number;
}

export interface PaymentReconciliationResponse {
  applied: boolean;
  internalStatus: PaymentStatus;
  paymentId: string;
  providerStatus: PaymentStatus;
  result: "MATCHED" | "MISMATCH_APPLIED" | "MISMATCH_UNRESOLVED";
}

export type PrescriptionStatus =
  | "DRAFT"
  | "SIGNED"
  | "SENT"
  | "ACCEPTED"
  | "PARTIALLY_DISPENSED"
  | "DISPENSED"
  | "CANCELLED"
  | "EXPIRED";

export interface PrescriptionItemResponse {
  controlledMedication: boolean;
  dose: string;
  duration: string | null;
  frequency: string;
  id: string;
  instructions: string | null;
  lineNumber: number;
  medicationCode: string | null;
  medicationCodeSystem: string | null;
  medicationName: string;
  quantity: string;
  quantityUnit: string;
  refillsAuthorized: number;
  route: string | null;
  strength: string | null;
  substitutionAllowed: boolean;
  balance: PrescriptionItemBalanceResponse;
}

export interface PrescriptionFillBalanceResponse {
  dispensedQuantity: string;
  fillNumber: number;
  remainingQuantity: string;
}

export interface PrescriptionItemBalanceResponse {
  dispensedQuantity: string;
  fills: readonly PrescriptionFillBalanceResponse[];
  remainingQuantity: string;
  totalAuthorizedQuantity: string;
}

export type SubstitutionApprovalMode = "DISABLED" | "PATIENT_ONLY" | "PATIENT_AND_PRACTITIONER";
export type SubstitutionProposalStatus =
  "PROPOSED" | "PATIENT_CONSENTED" | "APPROVED" | "DECLINED" | "CANCELLED" | "USED";
export type SubstitutionDecisionKind = "PATIENT_CONSENT" | "PRACTITIONER_APPROVAL";
export type SubstitutionDecisionOutcome = "APPROVED" | "DECLINED";

export interface PrescriptionSubstitutionDecisionResponse {
  decisionKind: SubstitutionDecisionKind;
  id: string;
  occurredAt: string;
  outcome: SubstitutionDecisionOutcome;
}

export interface PrescriptionSubstitutionProposalResponse {
  approvalMode: SubstitutionApprovalMode;
  createdAt: string;
  decisions: readonly PrescriptionSubstitutionDecisionResponse[];
  fillNumber: number;
  id: string;
  prescriptionItemId: string;
  proposedMedicationCode: string | null;
  proposedMedicationCodeSystem: string | null;
  proposedMedicationName: string;
  proposedStrength: string | null;
  reasonCode: string;
  status: SubstitutionProposalStatus;
  updatedAt: string;
  version: number;
}

export interface PrescriptionDispenseLineResponse {
  dispensedMedicationCode: string | null;
  dispensedMedicationCodeSystem: string | null;
  dispensedMedicationName: string;
  dispensedStrength: string | null;
  fillNumber: number;
  id: string;
  prescriptionItemId: string;
  quantity: string;
  quantityUnit: string;
  substitutionProposalId: string | null;
}

export interface PrescriptionDispenseEventResponse {
  eventNumber: number;
  id: string;
  lines: readonly PrescriptionDispenseLineResponse[];
  occurredAt: string;
  prescriptionId: string;
  routeId: string;
}

export interface PrescriptionDispenseEventListResponse {
  data: readonly PrescriptionDispenseEventResponse[];
  pageInfo: CursorPageInfo;
}

export interface PrescriptionStatusHistoryResponse {
  fromStatus: PrescriptionStatus | null;
  id: string;
  occurredAt: string;
  reasonCode: string;
  toStatus: PrescriptionStatus;
}

export interface PrescriptionRouteResponse {
  acceptedAt: string | null;
  cancellationReasonCode: string | null;
  cancelledAt: string | null;
  id: string;
  pharmacy: { displayName: string; id: string };
  sentAt: string;
  status: "SENT" | "ACCEPTED" | "CANCELLED";
  version: number;
}

export interface PrescriptionResponse {
  appointmentId: string;
  attestationMethod: string | null;
  cancelledAt: string | null;
  clinicalNote: string | null;
  contentDigest: string | null;
  createdAt: string;
  id: string;
  items: readonly PrescriptionItemResponse[];
  jurisdictionCode: string;
  patient: { displayName: string; id: string };
  practitioner: { displayName: string; id: string };
  prescriptionNumber: string;
  previousPrescriptionId: string | null;
  routes: readonly PrescriptionRouteResponse[];
  substitutionProposals: readonly PrescriptionSubstitutionProposalResponse[];
  signedAt: string | null;
  status: PrescriptionStatus;
  statusHistory: readonly PrescriptionStatusHistoryResponse[];
  updatedAt: string;
  validUntil: string | null;
  version: number;
}

export interface PrescriptionListResponse {
  data: readonly PrescriptionResponse[];
  pageInfo: CursorPageInfo;
}

export type PharmacyPrescriptionResponse = Omit<
  PrescriptionResponse,
  "appointmentId" | "clinicalNote"
>;

export interface PharmacyPrescriptionListResponse {
  data: readonly PharmacyPrescriptionResponse[];
  pageInfo: CursorPageInfo;
}

export type LaboratoryRequestPriority = "ROUTINE" | "URGENT";
export type LaboratoryRequestStatus = "ACTIVE" | "CANCELLED" | "COMPLETED";
export type LaboratoryCollectionMode = "FACILITY" | "HOME";
export type LaboratoryBookingStatus =
  | "CONFIRMED"
  | "SAMPLE_COLLECTION_PENDING"
  | "SAMPLE_COLLECTED"
  | "PROCESSING"
  | "RESULT_READY"
  | "COMPLETED"
  | "CANCELLED";

export interface LaboratoryStatusHistoryResponse<TStatus extends string> {
  fromStatus: TStatus | null;
  id: string;
  occurredAt: string;
  reasonCode: string;
  toStatus: TStatus;
}

export interface LaboratoryBookingResponse {
  acceptedAt: string;
  bookingNumber: string;
  cancelledAt: string | null;
  collectionMode: LaboratoryCollectionMode;
  completedAt: string | null;
  homeCollection: LaboratoryHomeCollectionResponse | null;
  id: string;
  laboratory: { displayName: string; id: string };
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
  pricing: LaboratoryWorkspacePriceResponse | null;
  processingStartedAt: string | null;
  resultReadyAt: string | null;
  sampleCollectedAt: string | null;
  scheduledAt: string | null;
  status: LaboratoryBookingStatus;
  statusHistory: readonly LaboratoryStatusHistoryResponse<LaboratoryBookingStatus>[];
  updatedAt: string;
  version: number;
}

export interface LaboratoryHomeCollectionResponse {
  addressLine1: string;
  addressLine2: string | null;
  administrativeArea: string | null;
  collectionInstructions: string | null;
  countryCode: string;
  locality: string;
  postalCode: string | null;
}

export interface LaboratoryHomeCollectionInput {
  addressLine1: string;
  addressLine2?: string;
  administrativeArea?: string;
  collectionInstructions?: string;
  countryCode: string;
  locality: string;
  postalCode?: string;
}

export interface LaboratoryRequestResponse {
  appointmentId: string;
  bookings: readonly LaboratoryBookingResponse[];
  cancelledAt: string | null;
  clinicalIndication: string;
  completedAt: string | null;
  createdAt: string;
  id: string;
  orderedAt: string;
  patient: { displayName: string; id: string };
  practitioner: { displayName: string; id: string };
  priority: LaboratoryRequestPriority;
  requestNumber: string;
  service: { code: string; id: string; name: string };
  specimenInstructions: string | null;
  status: LaboratoryRequestStatus;
  statusHistory: readonly LaboratoryStatusHistoryResponse<LaboratoryRequestStatus>[];
  updatedAt: string;
  version: number;
}

export interface LaboratoryRequestListResponse {
  data: readonly LaboratoryRequestResponse[];
  pageInfo: CursorPageInfo;
}

export type LaboratoryResultStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "SUPERSEDED";
export type LaboratoryResultFlag = "NORMAL" | "LOW" | "HIGH" | "ABNORMAL" | "CRITICAL";
export type LaboratoryCriticalResultStatus = "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";

export interface LaboratoryResultComponentResponse {
  code: string | null;
  codeSystem: string | null;
  flag: LaboratoryResultFlag;
  id: string;
  lineNumber: number;
  name: string;
  note: string | null;
  referenceRange: string | null;
  unit: string | null;
  value: string;
}

export interface LaboratoryResultAttachmentResponse {
  id: string;
  originalFilename: string;
  purpose: string;
  status: "AWAITING_UPLOAD" | "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED";
}

export interface LaboratoryCriticalResultResponse {
  acknowledgementDueAt: string;
  acknowledgedAt: string | null;
  componentId: string;
  escalatedAt: string | null;
  id: string;
  resolutionCode: string | null;
  resolvedAt: string | null;
  status: LaboratoryCriticalResultStatus;
  version: number;
}

export interface LaboratoryResultResponse {
  attachments: readonly LaboratoryResultAttachmentResponse[];
  bookingId: string;
  components: readonly LaboratoryResultComponentResponse[];
  createdAt: string;
  criticalResults: readonly LaboratoryCriticalResultResponse[];
  id: string;
  interpretation: string | null;
  laboratory: { displayName: string; id: string };
  patient: { displayName: string; id: string };
  practitioner: { displayName: string; id: string };
  previousResultId: string | null;
  publishedAt: string | null;
  resultNumber: string;
  service: { code: string; id: string; name: string };
  status: LaboratoryResultStatus;
  summaryFlag: LaboratoryResultFlag;
  updatedAt: string;
  verifiedAt: string | null;
  version: number;
}

export interface LaboratoryResultListResponse {
  data: readonly LaboratoryResultResponse[];
  pageInfo: CursorPageInfo;
}

export type ReviewCommentStatus = "NOT_PROVIDED" | "PENDING" | "PUBLISHED" | "HIDDEN";

export interface LaboratoryReviewResponse {
  bookingId: string;
  comment: string | null;
  commentStatus: ReviewCommentStatus;
  id: string;
  score: number;
  submittedAt: string;
}

export interface LaboratoryReviewTaskResponse {
  bookingId: string;
  completedAt: string;
  laboratory: { displayName: string; id: string };
  review: LaboratoryReviewResponse | null;
  service: { code: string; id: string; name: string };
}

export interface LaboratoryReviewListResponse {
  data: readonly LaboratoryReviewTaskResponse[];
}

export type ReviewModerationDecision = "PUBLISH" | "HIDE";
export type ReviewModerationReasonCode =
  "ABUSIVE_OR_HARASSING" | "CLINICAL_DETAILS" | "IRRELEVANT" | "PERSONAL_DATA" | "SPAM_OR_FRAUD";

export interface LaboratoryReviewModerationItemResponse {
  comment: string;
  commentStatus: Exclude<ReviewCommentStatus, "NOT_PROVIDED">;
  id: string;
  laboratory: { displayName: string; id: string };
  moderatedAt: string | null;
  moderationReasonCode: ReviewModerationReasonCode | null;
  score: number;
  submittedAt: string;
  version: number;
}

export interface LaboratoryReviewModerationListResponse {
  data: readonly LaboratoryReviewModerationItemResponse[];
  pageInfo: CursorPageInfo;
}

export type ModerateLaboratoryReviewCommentInput =
  | { decision: "PUBLISH"; expectedVersion: number; reasonCode?: never }
  | {
      decision: "HIDE";
      expectedVersion: number;
      reasonCode: ReviewModerationReasonCode;
    };

/** Laboratory queues omit consultation linkage and practitioner-only clinical context. */
export type LaboratoryQueueRequestResponse = Omit<
  LaboratoryRequestResponse,
  "appointmentId" | "statusHistory"
>;

export interface LaboratoryBookingListResponse {
  data: readonly LaboratoryQueueRequestResponse[];
  pageInfo: CursorPageInfo;
}

export type PharmacyQuoteStatus = "ACTIVE" | "ACCEPTED" | "EXPIRED" | "CANCELLED" | "SUPERSEDED";
export type PharmacyQuoteKind = "PRESCRIPTION" | "DIRECT_OTC" | "SCANNED_PRESCRIPTION";

export interface PharmacyQuoteLineResponse {
  catalogItemId: string | null;
  id: string;
  lineNumber: number;
  lineSubtotalMinor: string;
  medicationCode: string | null;
  medicationCodeSystem: string | null;
  medicationName: string;
  prescriptionItemId: string | null;
  quantity: string;
  quantityUnit: string;
  strength: string | null;
  substitutionProposalId: string | null;
  unitPriceMinor: string;
}

export interface PharmacyQuoteChargeResponse {
  amountMinor: string;
  code: string;
  id: string;
  label: string;
  type: "TAX" | "FEE";
}

export interface PharmacyQuoteResponse {
  charges: readonly PharmacyQuoteChargeResponse[];
  createdAt: string;
  currency: string;
  expiresAt: string;
  feeMinor: string;
  fillNumber: number | null;
  id: string;
  kind: PharmacyQuoteKind;
  inventoryReservation: {
    expiresAt: string;
    status: "HELD" | "COMMITTED" | "RELEASED" | "CONSUMED" | "EXPIRED";
  };
  lines: readonly PharmacyQuoteLineResponse[];
  orderId: string | null;
  patientId: string;
  pharmacyOrganizationId: string;
  prescriptionId: string | null;
  prescriptionRouteId: string | null;
  scannedPrescriptionId: string | null;
  quoteNumber: string;
  status: PharmacyQuoteStatus;
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
  updatedAt: string;
  version: number;
}

export type PharmacyOrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "DISPUTE_PENDING"
  | "DISPUTED";

export type PharmacyOrderHandoffMethod = "PICKUP" | "DELIVERY";
export type PharmacyOrderHandoffStatus = "READY" | "HANDED_OFF" | "CANCELLED";

export interface PharmacyOrderHandoffResponse {
  handedOffAt: string | null;
  handoffReference: string;
  id: string;
  method: PharmacyOrderHandoffMethod;
  preparedAt: string;
  status: PharmacyOrderHandoffStatus;
  version: number;
}

export type PharmacyOrderResolutionType = "CANCELLATION" | "REFUND" | "DISPUTE";
export type PharmacyOrderResolutionStatus = "PENDING" | "COMPLETED" | "REJECTED";

export interface PharmacyOrderResolutionResponse {
  amountMinor: string;
  completedAt: string | null;
  createdAt: string;
  currency: string;
  id: string;
  reasonCode: string;
  rejectedAt: string | null;
  status: PharmacyOrderResolutionStatus;
  type: PharmacyOrderResolutionType;
  version: number;
}

export interface PharmacyOrderResponse {
  acceptedAt: string;
  createdAt: string;
  handoff: PharmacyOrderHandoffResponse | null;
  id: string;
  latestResolution: PharmacyOrderResolutionResponse | null;
  orderNumber: string;
  patientId: string;
  paymentId: string;
  pharmacyOrganizationId: string;
  prescriptionId: string | null;
  prescriptionRouteId: string | null;
  quote: PharmacyQuoteResponse;
  status: PharmacyOrderStatus;
  updatedAt: string;
  version: number;
}

export interface PharmacyQuoteListResponse {
  data: readonly PharmacyQuoteResponse[];
  pageInfo: CursorPageInfo;
}

export interface PharmacyOrderListResponse {
  data: readonly PharmacyOrderResponse[];
  pageInfo: CursorPageInfo;
}

export interface PharmacyDeliverySummaryResponse {
  handedOffAt: string | null;
  handoffId: string;
  handoffReference: string;
  orderId: string;
  orderNumber: string;
  orderStatus: PharmacyOrderStatus;
  preparedAt: string;
  status: PharmacyOrderHandoffStatus;
}

export interface PharmacyDeliveryListResponse {
  data: readonly PharmacyDeliverySummaryResponse[];
  pageInfo: CursorPageInfo;
}

export interface AdminPharmacyOrderSummaryResponse {
  createdAt: string;
  currency: string;
  handoff: PharmacyOrderHandoffResponse | null;
  id: string;
  itemCount: number;
  latestResolution: PharmacyOrderResolutionResponse | null;
  orderNumber: string;
  pharmacy: { displayName: string; id: string };
  quoteKind: PharmacyQuoteKind;
  status: PharmacyOrderStatus;
  totalMinor: string;
  updatedAt: string;
  version: number;
}

export interface AdminPharmacyOrderListResponse {
  data: readonly AdminPharmacyOrderSummaryResponse[];
  pageInfo: CursorPageInfo;
}

export interface PharmacyOperationalSettingsResponse {
  deliveryEnabled: boolean;
  organization: {
    displayName: string;
    id: string;
    publicPhone: string | null;
    verificationStatus: "PENDING" | "VERIFIED" | "REVOKED" | "SUSPENDED";
    websiteUrl: string | null;
  };
  pickupEnabled: boolean;
  preparationTargetMinutes: number;
  updatedAt: string;
  version: number;
}

export type PharmacyProductClassificationKind = "CATEGORY" | "DOSAGE_FORM";
export type PharmacyCatalogItemStatus = "ACTIVE" | "INACTIVE";
export type InventoryLocationStatus = "ACTIVE" | "INACTIVE";
export type InventoryLotStatus = "AVAILABLE" | "QUARANTINED" | "DEPLETED" | "EXPIRED" | "RECALLED";
export type InventoryMovementType =
  | "RECEIVE"
  | "ADJUST_IN"
  | "ADJUST_OUT"
  | "RESERVE"
  | "RELEASE"
  | "DISPENSE"
  | "RETURN"
  | "WRITE_OFF";

export interface PharmacyProductClassificationResponse {
  code: string;
  id: string;
  kind: PharmacyProductClassificationKind;
  name: string;
  status: CatalogueEntryStatus;
  version: number;
}

export interface PharmacyCatalogItemResponse {
  availableQuantity: string;
  brandName: string | null;
  category: PharmacyProductClassificationResponse;
  controlledMedication: boolean;
  createdAt: string;
  currency: string;
  dosageForm: PharmacyProductClassificationResponse;
  genericName: string | null;
  id: string;
  lowStock: boolean;
  lowStockThreshold: string;
  manufacturer: string | null;
  medicationCode: string | null;
  medicationCodeSystem: string | null;
  name: string;
  nearExpiryDays: number;
  onHandQuantity: string;
  pharmacyOrganizationId: string;
  prescriptionRequired: boolean;
  reservedQuantity: string;
  sku: string;
  status: PharmacyCatalogItemStatus;
  storageRequirements: string | null;
  strength: string | null;
  unitPriceMinor: string;
  updatedAt: string;
  version: number;
}

export interface PharmacyCatalogItemListResponse {
  data: readonly PharmacyCatalogItemResponse[];
  pageInfo: CursorPageInfo;
}

/** Patient-safe catalogue projection; operational stock and SKU data stay private. */
export interface PatientPharmacyCatalogItemResponse {
  available: boolean;
  brandName: string | null;
  category: PharmacyProductClassificationResponse;
  controlledMedication: boolean;
  currency: string;
  directOrderEligible: boolean;
  dosageForm: PharmacyProductClassificationResponse;
  genericName: string | null;
  id: string;
  manufacturer: string | null;
  name: string;
  pharmacyOrganizationId: string;
  prescriptionRequired: boolean;
  strength: string | null;
  unitPriceMinor: string;
  version: number;
}

export interface PatientPharmacyCatalogItemListResponse {
  data: readonly PatientPharmacyCatalogItemResponse[];
  pageInfo: CursorPageInfo;
}

export interface InventoryLocationResponse {
  code: string;
  id: string;
  name: string;
  pharmacyOrganizationId: string;
  status: InventoryLocationStatus;
  version: number;
}

export interface InventoryLotResponse {
  availableQuantity: string;
  batchNumber: string;
  catalogItemId: string;
  expiryDate: string;
  id: string;
  location: InventoryLocationResponse;
  onHandQuantity: string;
  receivedAt: string;
  reservedQuantity: string;
  status: InventoryLotStatus;
  version: number;
}

export interface InventoryLotListResponse {
  data: readonly InventoryLotResponse[];
  pageInfo: CursorPageInfo;
}

export interface InventoryMovementResponse {
  id: string;
  lotId: string;
  occurredAt: string;
  onHandAfter: string;
  quantity: string;
  reasonCode: string;
  referenceId: string | null;
  referenceType: "MANUAL" | "RESERVATION" | "DISPENSE_EVENT" | "PHARMACY_ORDER";
  reservedAfter: string;
  type: InventoryMovementType;
}

export interface InventoryMovementListResponse {
  data: readonly InventoryMovementResponse[];
  pageInfo: CursorPageInfo;
}

export type ClinicalCatalogueKind = "PROFESSION" | "SPECIALTY";
export type CatalogueEntryStatus = "ACTIVE" | "INACTIVE";

export interface ClinicalCatalogueEntry {
  category: string | null;
  code: string;
  description: string | null;
  id: string;
  name: string;
  parentId: string | null;
  sourceSystem: string;
  sourceUri: string | null;
  sourceVersion: string | null;
  status: CatalogueEntryStatus;
  version: number;
}

export interface ClinicalCatalogueListResponse {
  data: readonly ClinicalCatalogueEntry[];
  pageInfo: CursorPageInfo;
}

export type ClinicalEncounterStatus = "OPEN" | "SIGNED";
export type ClinicalNoteKind = "DRAFT" | "SIGNED" | "ADDENDUM";
export type ClinicalDiagnosisType = "PRIMARY" | "SECONDARY" | "DIFFERENTIAL" | "PROVISIONAL";
export type ClinicalDiagnosisStatus = "ACTIVE" | "RESOLVED" | "ENTERED_IN_ERROR";
export type ClinicalObservationValueType = "QUANTITY" | "TEXT" | "CODED" | "BOOLEAN";

export interface ClinicalDocumentationSection {
  code: string;
  text: string;
  title: string;
}

export interface ClinicalDocumentation {
  sections: readonly ClinicalDocumentationSection[];
}

export interface ClinicalDiagnosisResponse {
  code: string | null;
  codeSystem: string | null;
  display: string;
  id: string;
  onsetAt: string | null;
  recordedAt: string;
  status: ClinicalDiagnosisStatus;
  type: ClinicalDiagnosisType;
}

export interface ClinicalObservationResponse {
  booleanValue: boolean | null;
  code: string;
  codedValue: string | null;
  codeSystem: string | null;
  display: string;
  id: string;
  numericValue: string | null;
  observedAt: string;
  textValue: string | null;
  unitCode: string | null;
  valueType: ClinicalObservationValueType;
}

export interface ClinicalEncounterNoteResponse {
  authoredAt: string;
  contentHash: string;
  diagnoses: readonly ClinicalDiagnosisResponse[];
  documentation: ClinicalDocumentation;
  id: string;
  kind: ClinicalNoteKind;
  observations: readonly ClinicalObservationResponse[];
  revision: number;
  schemaVersion: number;
  signedAt: string | null;
  supersedesNoteId: string | null;
}

export interface ClinicalEncounterResponse {
  appointmentId: string;
  encounterNumber: string;
  id: string;
  relatedActions: ClinicalRelatedActionsResponse;
  notes: readonly ClinicalEncounterNoteResponse[];
  openedAt: string;
  patient: { displayName: string; id: string };
  practitioner: { displayName: string; id: string };
  signedAt: string | null;
  status: ClinicalEncounterStatus;
  updatedAt: string;
  version: number;
}

export interface ClinicalReferralResponse {
  createdAt: string;
  id: string;
  priority: "ROUTINE" | "URGENT" | "EMERGENCY";
  reason: string;
  recipientName: string | null;
  specialtyCode: string;
  status: "ACTIVE" | "ACCEPTED" | "DECLINED" | "COMPLETED" | "CANCELLED";
  version: number;
}

export interface ProviderPatientRosterItem {
  encounterCount: number;
  id: string;
  lastEncounterAt: string;
  name: string;
}

export interface ProviderPatientRosterResponse {
  data: readonly ProviderPatientRosterItem[];
  pageInfo: CursorPageInfo;
}

export interface ProviderReferralListItem extends ClinicalReferralResponse {
  patient: { displayName: string; id: string };
  recipient: { displayName: string; id: string } | null;
  sender: { displayName: string; id: string };
}

export interface ProviderReferralListResponse {
  data: readonly ProviderReferralListItem[];
  pageInfo: CursorPageInfo;
}

export interface PractitionerSettingsResponse {
  acceptingPatients: boolean;
  biography: string | null;
  displayName: string;
  headline: string | null;
  id: string;
  languageTags: readonly string[];
  primarySpecialty: string | null;
  verificationStatus: PractitionerVerificationStatus;
  version: number;
}

export interface UpdatePractitionerSettingsInput {
  acceptingPatients: boolean;
  biography: string | null;
  expectedVersion: number;
  headline: string | null;
  languageTags: readonly string[];
}

export interface PatientProfileResponse {
  countryCode: string | null;
  dateOfBirth: string | null;
  familyName: string;
  givenName: string;
  id: string;
  phoneE164: string | null;
  preferredLanguage: string | null;
  version: number;
}

export interface UpdatePatientProfileInput {
  expectedVersion: number;
  preferredLanguage: string | null;
}

export interface ClinicalCarePlanResponse {
  activities: readonly string[];
  endsAt: string | null;
  goal: string;
  id: string;
  startsAt: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  title: string;
  updatedAt: string;
  version: number;
}

export interface ClinicalAllergyResponse {
  criticality: "LOW" | "HIGH" | "UNABLE_TO_ASSESS";
  id: string;
  reaction: string | null;
  recordedAt: string;
  status: "ACTIVE" | "RESOLVED" | "ENTERED_IN_ERROR";
  substanceCode: string | null;
  substanceCodeSystem: string | null;
  substanceDisplay: string;
  version: number;
}

export interface ClinicalAttachmentReferenceResponse {
  createdAt: string;
  id: string;
  purpose: string;
  sourceId: string;
  sourceType: "LABORATORY_RESULT_ATTACHMENT" | "SCANNED_PRESCRIPTION" | "APPLICATION_DOCUMENT";
}

export interface ClinicalRelatedActionsResponse {
  allergies: readonly ClinicalAllergyResponse[];
  attachmentReferences: readonly ClinicalAttachmentReferenceResponse[];
  carePlans: readonly ClinicalCarePlanResponse[];
  laboratoryRequestIds: readonly string[];
  prescriptionIds: readonly string[];
  referrals: readonly ClinicalReferralResponse[];
}

export interface ClinicalEncounterListResponse {
  data: readonly ClinicalEncounterResponse[];
  pageInfo: CursorPageInfo;
}
