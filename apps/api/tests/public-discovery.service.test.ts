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
  id: "0199a18e-a400-7000-8000-000000000201",
  locations: [],
  openTwentyFourHours: true,
  organizationType: "HOSPITAL",
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
    listServices: vi.fn(),
  };
}

describe("PublicDiscoveryService", () => {
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
