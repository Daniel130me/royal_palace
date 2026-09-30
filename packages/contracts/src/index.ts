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
