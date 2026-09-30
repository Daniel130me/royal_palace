import { Inject, Injectable } from "@nestjs/common";
import type {
  PublicPractitionerDetail,
  PublicPractitionerFilters,
  PublicPractitionerListResponse,
  PublicProfessionListResponse,
  PublicSpecialtyListResponse,
} from "@royal-palace/contracts";

import {
  PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY,
  type PublicPractitionerDiscoveryRepository,
} from "../domain/public-practitioner-discovery.types.js";
import { decodeCursor, encodeCursor, hashFilters, normalizeFilters } from "./discovery-cursor.js";
import { MAX_PAGE_SIZE } from "./public-discovery.service.js";

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class PublicPractitionerDiscoveryService {
  constructor(
    @Inject(PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY)
    private readonly repository: PublicPractitionerDiscoveryRepository,
  ) {}

  listProfessions(): Promise<PublicProfessionListResponse> {
    return this.repository.listProfessions().then((data) => ({ data }));
  }

  listSpecialties(): Promise<PublicSpecialtyListResponse> {
    return this.repository.listSpecialties().then((data) => ({ data }));
  }

  async listPractitioners(input: {
    cursor?: string;
    filters: PublicPractitionerFilters;
    limit?: number;
  }): Promise<PublicPractitionerListResponse> {
    const filters = normalizeFilters(input.filters);
    const filterHash = hashFilters(filters);
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, filterHash);
    const response = await this.repository.listPractitioners({
      ...filters,
      ...(cursor === undefined ? {} : { cursor }),
      limit: Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
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

  findPractitionerById(id: string): Promise<PublicPractitionerDetail | null> {
    return this.repository.findPractitionerById(id);
  }
}
