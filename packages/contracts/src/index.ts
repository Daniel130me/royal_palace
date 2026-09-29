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
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  countryCode: string;
  id: string;
  label: string;
  publicPhone: string | null;
  state: string;
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

export interface PublicHospitalFilters {
  city?: string;
  emergencyAvailable?: boolean;
  openTwentyFourHours?: boolean;
  query?: string;
  serviceCode?: string;
  state?: string;
}

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
