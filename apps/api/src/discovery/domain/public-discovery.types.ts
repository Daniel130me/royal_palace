import type {
  PublicHospitalFilters,
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationType,
  PublicService,
} from "@royal-palace/contracts";

export interface HospitalCursor {
  displayName: string;
  filterHash: string;
  id: string;
  version: 1;
}

export interface ListOrganizationsQuery extends PublicHospitalFilters {
  cursor?: HospitalCursor;
  limit: number;
  organizationType: PublicOrganizationType;
}

export interface PublicDiscoveryRepository {
  findOrganizationById(
    id: string,
    organizationType: PublicOrganizationType,
  ): Promise<PublicOrganizationDetail | null>;
  listOrganizations(query: ListOrganizationsQuery): Promise<PublicOrganizationListResponse>;
  listServices(organizationType: PublicOrganizationType): Promise<readonly PublicService[]>;
}

export const PUBLIC_DISCOVERY_REPOSITORY = Symbol("PUBLIC_DISCOVERY_REPOSITORY");
