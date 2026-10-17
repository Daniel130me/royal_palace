import { describe, expect, it, vi } from "vitest";

import { PrismaPublicDiscoveryRepository } from "../src/discovery/infrastructure/prisma-public-discovery.repository.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";

const publicRecord = {
  displayName: "Synthetic Hospital",
  facilityLocations: [
    {
      administrativeArea: "Lagos",
      addressLine1: "1 Example Road",
      addressLine2: null,
      countryCode: "NG",
      id: "0199a18e-a400-7000-8000-000000000211",
      label: "Main facility",
      locality: "Ikeja",
      postalCode: "100001",
      publicPhone: null,
    },
  ],
  id: "0199a18e-a400-7000-8000-000000000201",
  organizationServices: [
    {
      supportsHomeCollection: false,
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
  ratingSummary: { ratingCount: 2, ratingSum: 9 },
  type: "HOSPITAL",
};

describe("PrismaPublicDiscoveryRepository", () => {
  it("returns only current patient-facing prices through a bounded projection", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        currency: "CAD",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveUntil: null,
        id: "0199a18e-a400-7000-8000-000000000301",
        patientPriceMinor: 12500n,
        service: {
          category: "Laboratory",
          code: "diagnostic-testing",
          id: "0199a18e-a400-7000-8000-000000000101",
          name: "Diagnostic Testing",
        },
      },
    ]);
    const repository = new PrismaPublicDiscoveryRepository({
      servicePrice: { findMany },
    } as unknown as PrismaService);

    const result = await repository.listServicePrices({
      effectiveAt: new Date("2026-10-17T00:00:00.000Z"),
      limit: 20,
    });

    const query = findMany.mock.calls[0]?.[0] as {
      select: Record<string, unknown>;
      take: number;
      where: unknown;
    };
    expect(query.take).toBe(21);
    expect(query.select).not.toHaveProperty("providerPayoutMinor");
    expect(query.select).not.toHaveProperty("createdByPrincipalId");
    expect(query.where).toMatchObject({
      effectiveFrom: { lte: new Date("2026-10-17T00:00:00.000Z") },
      service: { status: "ACTIVE" },
      status: "ACTIVE",
    });
    expect(result.data).toEqual([
      expect.objectContaining({ currency: "CAD", patientPriceMinor: "12500" }),
    ]);
    expect(result.data[0]).not.toHaveProperty("providerPayoutMinor");
  });

  it("uses a bounded public projection and server-side service/location filters", async () => {
    const findMany = vi.fn().mockResolvedValue([publicRecord]);
    const repository = new PrismaPublicDiscoveryRepository({
      organization: { findMany },
    } as unknown as PrismaService);

    const result = await repository.listOrganizations({
      countryCode: "NG",
      limit: 1,
      location: "Ikeja",
      organizationType: "HOSPITAL",
      serviceCode: "emergency-care",
    });

    const query = findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.take).toBe(2);
    expect(query.select).not.toHaveProperty("legalName");
    expect(query.select).not.toHaveProperty("verificationStatus");
    expect(query.where).toMatchObject({
      facilityLocations: {
        some: {
          countryCode: "NG",
          OR: expect.arrayContaining([{ locality: { contains: "Ikeja", mode: "insensitive" } }]),
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
