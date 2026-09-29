import { describe, expect, it, vi } from "vitest";

import { PrismaPublicDiscoveryRepository } from "../src/discovery/infrastructure/prisma-public-discovery.repository.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";

const publicRecord = {
  displayName: "Synthetic Hospital",
  facilityLocations: [
    {
      addressLine1: "1 Example Road",
      addressLine2: null,
      city: "Ikeja",
      countryCode: "NG",
      id: "0199a18e-a400-7000-8000-000000000211",
      label: "Main facility",
      publicPhone: null,
      state: "Lagos",
    },
  ],
  id: "0199a18e-a400-7000-8000-000000000201",
  organizationServices: [
    {
      service: {
        category: "Urgent Care",
        code: "emergency-care",
        id: "0199a18e-a400-7000-8000-000000000101",
        name: "Emergency Care",
      },
    },
  ],
  publicProfile: {
    acceptingPatients: true,
    emergencyAvailable: true,
    openTwentyFourHours: true,
    slug: "synthetic-hospital",
    summary: "Synthetic profile",
    websiteUrl: "https://synthetic.invalid",
  },
  type: "HOSPITAL",
};

describe("PrismaPublicDiscoveryRepository", () => {
  it("uses a bounded public projection and server-side service/location filters", async () => {
    const findMany = vi.fn().mockResolvedValue([publicRecord]);
    const repository = new PrismaPublicDiscoveryRepository({
      organization: { findMany },
    } as unknown as PrismaService);

    const result = await repository.listOrganizations({
      city: "Ikeja",
      limit: 1,
      organizationType: "HOSPITAL",
      serviceCode: "emergency-care",
      state: "Lagos",
    });

    const query = findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.take).toBe(2);
    expect(query.select).not.toHaveProperty("legalName");
    expect(query.select).not.toHaveProperty("verificationStatus");
    expect(query.where).toMatchObject({
      facilityLocations: {
        some: {
          city: { equals: "Ikeja", mode: "insensitive" },
          state: { equals: "Lagos", mode: "insensitive" },
        },
      },
      organizationServices: {
        some: { service: { code: "emergency-care", status: "ACTIVE" }, status: "ACTIVE" },
      },
      status: "ACTIVE",
      type: "HOSPITAL",
      verificationStatus: "VERIFIED",
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty("websiteUrl");
    expect(result.data[0]).not.toHaveProperty("legalName");
  });
});
