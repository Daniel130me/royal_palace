import type {
  PublicHospitalFilters,
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationType,
  PublicService,
  PublicServicePriceListResponse,
} from "@royal-palace/contracts";

import type { DiscoveryCursor } from "../application/discovery-cursor.js";

export interface ListOrganizationsQuery extends PublicHospitalFilters {
  cursor?: DiscoveryCursor;
  limit: number;
  organizationType: PublicOrganizationType;
}

export interface ListPublicServicePricesQuery {
  cursor?: DiscoveryCursor;
  effectiveAt: Date;
  limit: number;
}

export interface PublicDiscoveryRepository {
  findOrganizationById(
    id: string,
    organizationType: PublicOrganizationType,
  ): Promise<PublicOrganizationDetail | null>;
  listOrganizations(query: ListOrganizationsQuery): Promise<PublicOrganizationListResponse>;
  listServicePrices(query: ListPublicServicePricesQuery): Promise<PublicServicePriceListResponse>;
  listServices(organizationType: PublicOrganizationType): Promise<readonly PublicService[]>;
}

export const PUBLIC_DISCOVERY_REPOSITORY = Symbol("PUBLIC_DISCOVERY_REPOSITORY");
