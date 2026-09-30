import type { PublicPractitionerSummary } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import { InvalidDiscoveryCursorError } from "../src/discovery/application/discovery-cursor.js";
import { PublicPractitionerDiscoveryService } from "../src/discovery/application/public-practitioner-discovery.service.js";
import type { PublicPractitionerDiscoveryRepository } from "../src/discovery/domain/public-practitioner-discovery.types.js";

const practitioner: PublicPractitionerSummary = {
  acceptingPatients: true,
  displayName: "Dr. Synthetic Person",
  headline: "Synthetic practitioner",
  id: "0199a18e-a400-7000-8000-000000000601",
  languages: ["en"],
  locations: [],
  professions: [],
  serviceModes: ["VIDEO"],
  slug: "synthetic-person",
  specialties: [],
  yearsExperience: 10,
};

function createRepository(): PublicPractitionerDiscoveryRepository {
  return {
    findPractitionerById: vi.fn(),
    listPractitioners: vi.fn().mockResolvedValue({
      data: [practitioner],
      pageInfo: { endCursor: "pending", hasNextPage: true },
    }),
    listProfessions: vi.fn(),
    listSpecialties: vi.fn(),
  };
}

describe("PublicPractitionerDiscoveryService", () => {
  it("normalizes filters and binds the cursor to them", async () => {
    const repository = createRepository();
    const service = new PublicPractitionerDiscoveryService(repository);
    const first = await service.listPractitioners({
      filters: { languageTag: " en ", specialtyCode: "cardiology" },
      limit: 500,
    });

    expect(repository.listPractitioners).toHaveBeenCalledWith({
      languageTag: "en",
      limit: 50,
      specialtyCode: "cardiology",
    });
    await expect(
      service.listPractitioners({
        cursor: first.pageInfo.endCursor ?? undefined,
        filters: { languageTag: "fr", specialtyCode: "cardiology" },
      }),
    ).rejects.toBeInstanceOf(InvalidDiscoveryCursorError);
  });
});
