export type PlatformRole =
  | "PATIENT"
  | "MANAGER"
  | "ORGANIZATION_APPLICANT"
  | "ORGANIZATION_STAFF"
  | "PROVIDER"
  | "SUPPORT"
  | "ADMINISTRATOR"
  | "FINANCE"
  | "LOGISTICS"
  | "SYSTEM_WORKER";

export interface AuthenticatedMembership {
  organizationId: string;
  roles: readonly PlatformRole[];
}

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

export const NOTIFICATION_TEMPLATE = {
  APPLICATION_ACTION_REQUIRED: "APPLICATION_ACTION_REQUIRED",
  APPLICATION_STATUS_UPDATED: "APPLICATION_STATUS_UPDATED",
  APPOINTMENT_STATUS_UPDATED: "APPOINTMENT_STATUS_UPDATED",
  PAYMENT_STATUS_UPDATED: "PAYMENT_STATUS_UPDATED",
  SECURITY_ALERT: "SECURITY_ALERT",
} as const;

export type NotificationTemplateKey =
  (typeof NOTIFICATION_TEMPLATE)[keyof typeof NOTIFICATION_TEMPLATE];
export type NotificationChannel = "EMAIL" | "SMS" | "PUSH";

export interface NotificationReplayResponse {
  id: string;
  replayOfId: string;
  status: "PENDING";
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

export interface PublicService {
  category: string;
  code: string;
  id: string;
  name: string;
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
  id: string;
  locations: readonly PublicFacilityLocation[];
  openTwentyFourHours: boolean;
  organizationType: PublicOrganizationType;
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
  appointmentId: string;
  currency: string;
  id: string;
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
