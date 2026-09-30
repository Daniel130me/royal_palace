import { Inject, Injectable } from "@nestjs/common";
import type {
  PublicHospitalFilters,
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationType,
  PublicServiceListResponse,
} from "@royal-palace/contracts";

import {
  PUBLIC_DISCOVERY_REPOSITORY,
  type PublicDiscoveryRepository,
} from "../domain/public-discovery.types.js";

import { decodeCursor, encodeCursor, hashFilters, normalizeFilters } from "./discovery-cursor.js";

const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export { InvalidDiscoveryCursorError } from "./discovery-cursor.js";

@Injectable()
export class PublicDiscoveryService {
  constructor(
    @Inject(PUBLIC_DISCOVERY_REPOSITORY)
    private readonly repository: PublicDiscoveryRepository,
  ) {}

  listServices(organizationType: PublicOrganizationType): Promise<PublicServiceListResponse> {
    return this.repository.listServices(organizationType).then((data) => ({ data }));
  }

  async listOrganizations(input: {
    cursor?: string;
    filters: PublicHospitalFilters;
    limit?: number;
    organizationType: PublicOrganizationType;
  }): Promise<PublicOrganizationListResponse> {
    const filters = normalizeFilters(input.filters);
    const filterHash = hashFilters({ ...filters, organizationType: input.organizationType });
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, filterHash);
    const response = await this.repository.listOrganizations({
      ...filters,
      ...(cursor === undefined ? {} : { cursor }),
      limit: Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      organizationType: input.organizationType,
    });

    if (response.pageInfo.endCursor === null) return response;
    const last = response.data.at(-1);
    if (last === undefined)
      return { ...response, pageInfo: { endCursor: null, hasNextPage: false } };
    return {
      ...response,
      pageInfo: {
        ...response.pageInfo,
        endCursor: encodeCursor({
          displayName: last.displayName,
          filterHash,
          id: last.id,
          version: 1,
        }),
      },
    };
  }

  findOrganizationById(
    id: string,
    organizationType: PublicOrganizationType,
  ): Promise<PublicOrganizationDetail | null> {
    return this.repository.findOrganizationById(id, organizationType);
  }
}
