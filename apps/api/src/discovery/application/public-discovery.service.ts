import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type {
  PublicHospitalFilters,
  PublicOrganizationDetail,
  PublicOrganizationListResponse,
  PublicOrganizationType,
  PublicServiceListResponse,
} from "@royal-palace/contracts";

import {
  type HospitalCursor,
  PUBLIC_DISCOVERY_REPOSITORY,
  type PublicDiscoveryRepository,
} from "../domain/public-discovery.types.js";

const CURSOR_VERSION = 1;
const DEFAULT_PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
export const MAX_PAGE_SIZE = 50;

export class InvalidDiscoveryCursorError extends Error {}

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

function normalizeFilters(filters: PublicHospitalFilters): PublicHospitalFilters {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as PublicHospitalFilters;
}

function hashFilters(
  filters: PublicHospitalFilters & { organizationType: PublicOrganizationType },
): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

function encodeCursor(cursor: HospitalCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string, expectedFilterHash: string): HospitalCursor {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error();
    const cursor = JSON.parse(decoded) as Partial<HospitalCursor>;
    if (
      Object.keys(cursor).sort().join(",") !== "displayName,filterHash,id,version" ||
      cursor.version !== CURSOR_VERSION ||
      typeof cursor.displayName !== "string" ||
      cursor.displayName.length < 1 ||
      cursor.displayName.length > 120 ||
      typeof cursor.id !== "string" ||
      !UUID_PATTERN.test(cursor.id) ||
      typeof cursor.filterHash !== "string" ||
      !SHA_256_PATTERN.test(cursor.filterHash) ||
      cursor.filterHash !== expectedFilterHash
    ) {
      throw new Error();
    }
    return cursor as HospitalCursor;
  } catch {
    throw new InvalidDiscoveryCursorError("The discovery cursor is invalid or expired");
  }
}
