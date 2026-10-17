import type { PublicHospitalSummary } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidDiscoveryCursorError,
  MAX_PAGE_SIZE,
  PublicDiscoveryService,
} from "../src/discovery/application/public-discovery.service.js";
import type { PublicDiscoveryRepository } from "../src/discovery/domain/public-discovery.types.js";

const hospital: PublicHospitalSummary = {
  acceptingPatients: true,
  displayName: "Synthetic Hospital",
  emergencyAvailable: true,
  homeCollectionServiceCodes: [],
  id: "0199a18e-a400-7000-8000-000000000201",
  locations: [],
  openTwentyFourHours: true,
  organizationType: "HOSPITAL",
  rating: { averageScore: null, reviewCount: 0 },
  services: [],
  slug: "synthetic-hospital",
  summary: null,
};

function createRepository(): PublicDiscoveryRepository {
  return {
    findOrganizationById: vi.fn(),
    listOrganizations: vi.fn().mockResolvedValue({
      data: [hospital],
      pageInfo: { endCursor: "pending", hasNextPage: true },
    }),
    listServicePrices: vi.fn().mockResolvedValue({
      data: [
        {
          currency: "CAD",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveUntil: null,
          patientPriceMinor: "12500",
          service: {
            category: "Laboratory",
            code: "diagnostic-testing",
            id: "0199a18e-a400-7000-8000-000000000101",
            name: "Diagnostic Testing",
          },
        },
      ],
      pageInfo: {
        endCursor: "0199a18e-a400-7000-8000-000000000301",
        hasNextPage: true,
      },
    }),
    listServices: vi.fn(),
  };
}

describe("PublicDiscoveryService", () => {
  it("caps public price pages and replaces repository identifiers with opaque cursors", async () => {
    const repository = createRepository();
    const service = new PublicDiscoveryService(repository);

    const page = await service.listServicePrices({ limit: 10_000 });

    expect(repository.listServicePrices).toHaveBeenCalledWith({
      effectiveAt: expect.any(Date),
      limit: MAX_PAGE_SIZE,
    });
    expect(page.pageInfo.endCursor).toEqual(expect.any(String));
    expect(page.pageInfo.endCursor).not.toContain("0199a18e-a400");
  });

  it("caps page size and emits a filter-bound opaque cursor", async () => {
    const repository = createRepository();
    const service = new PublicDiscoveryService(repository);

    const page = await service.listOrganizations({
      filters: { location: " Lagos ", serviceCode: "emergency-care" },
      limit: 10_000,
      organizationType: "HOSPITAL",
    });

    expect(repository.listOrganizations).toHaveBeenCalledWith({
      limit: MAX_PAGE_SIZE,
      location: "Lagos",
      organizationType: "HOSPITAL",
      serviceCode: "emergency-care",
    });
    expect(page.pageInfo.endCursor).toEqual(expect.any(String));
    expect(page.pageInfo.endCursor).not.toContain(hospital.displayName);
  });

  it("rejects a cursor when the filters change", async () => {
    const repository = createRepository();
    const service = new PublicDiscoveryService(repository);
    const firstPage = await service.listOrganizations({
      filters: { location: "Lagos" },
      organizationType: "HOSPITAL",
    });

    await expect(
      service.listOrganizations({
        cursor: firstPage.pageInfo.endCursor ?? undefined,
        filters: { location: "Ontario" },
        organizationType: "HOSPITAL",
      }),
    ).rejects.toBeInstanceOf(InvalidDiscoveryCursorError);
    expect(repository.listOrganizations).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed cursors before querying the database", async () => {
    const repository = createRepository();
    const service = new PublicDiscoveryService(repository);

    await expect(
      service.listOrganizations({
        cursor: "not-a-canonical-cursor",
        filters: {},
        organizationType: "HOSPITAL",
      }),
    ).rejects.toBeInstanceOf(InvalidDiscoveryCursorError);
    expect(repository.listOrganizations).not.toHaveBeenCalled();
  });

  it("rejects a structurally valid cursor containing an invalid database identifier", async () => {
    const repository = createRepository();
    const service = new PublicDiscoveryService(repository);
    const firstPage = await service.listOrganizations({
      filters: {},
      organizationType: "HOSPITAL",
    });
    const encoded = firstPage.pageInfo.endCursor;
    if (encoded === null) throw new Error("Expected a cursor fixture");
    const cursor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    cursor.id = "not-a-uuid";
    const invalid = Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

    await expect(
      service.listOrganizations({
        cursor: invalid,
        filters: {},
        organizationType: "HOSPITAL",
      }),
    ).rejects.toBeInstanceOf(InvalidDiscoveryCursorError);
    expect(repository.listOrganizations).toHaveBeenCalledTimes(1);
  });
});
