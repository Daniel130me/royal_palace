import { describe, expect, it, vi } from "vitest";

import { PrismaPublicPractitionerDiscoveryRepository } from "../src/discovery/infrastructure/prisma-public-practitioner-discovery.repository.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";

const publicRecord = {
  displayName: "Dr. Synthetic Person",
  id: "0199a18e-a400-7000-8000-000000000601",
  languages: [{ languageTag: "en" }],
  locations: [
    {
      administrativeArea: "Ontario",
      countryCode: "CA",
      id: "0199a18e-a400-7000-8000-000000000611",
      label: "Practice area",
      locality: "Toronto",
      postalCode: "M5V 1A1",
    },
  ],
  professions: [
    {
      profession: {
        code: "medicine",
        id: "0199a18e-a400-7000-8000-000000000701",
        name: "Medical Practitioner",
      },
    },
  ],
  publicProfile: {
    acceptingPatients: true,
    headline: "Synthetic profile",
    slug: "synthetic-person",
    yearsExperience: 10,
  },
  serviceModes: [{ mode: "VIDEO" }],
  specialties: [
    {
      specialty: {
        category: "Medicine",
        code: "cardiology",
        id: "0199a18e-a400-7000-8000-000000000801",
        name: "Cardiology",
      },
    },
  ],
};

describe("PrismaPublicPractitionerDiscoveryRepository", () => {
  it("uses public projections and bounded server-side filters", async () => {
    const findMany = vi.fn().mockResolvedValue([publicRecord]);
    const repository = new PrismaPublicPractitionerDiscoveryRepository({
      practitioner: { findMany },
    } as unknown as PrismaService);

    const result = await repository.listPractitioners({
      countryCode: "CA",
      languageTag: "en",
      limit: 1,
      location: "Toronto",
      professionCode: "medicine",
      serviceMode: "VIDEO",
      specialtyCode: "cardiology",
    });

    const query = findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.take).toBe(2);
    expect(query.select).not.toHaveProperty("principalId");
    expect(query.select).not.toHaveProperty("givenName");
    expect(query.select).not.toHaveProperty("familyName");
    expect(query.select).not.toHaveProperty("publicCredentials");
    expect(query.where).toMatchObject({
      verificationStatus: "VERIFIED",
      locations: {
        some: {
          countryCode: "CA",
          OR: expect.arrayContaining([{ locality: { contains: "Toronto", mode: "insensitive" } }]),
        },
      },
      professions: { some: { profession: { code: "medicine", status: "ACTIVE" } } },
      serviceModes: { some: { mode: "VIDEO" } },
      specialties: { some: { specialty: { code: "cardiology", status: "ACTIVE" } } },
    });
    expect(result.data[0]).not.toHaveProperty("principalId");
    expect(result.data[0]).not.toHaveProperty("credentials");
  });
});
