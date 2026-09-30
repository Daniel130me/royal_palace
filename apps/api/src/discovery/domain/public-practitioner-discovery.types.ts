import type {
  PublicPractitionerDetail,
  PublicPractitionerFilters,
  PublicPractitionerListResponse,
  PublicProfession,
  PublicSpecialty,
} from "@royal-palace/contracts";

import type { DiscoveryCursor } from "../application/discovery-cursor.js";

export interface ListPractitionersQuery extends PublicPractitionerFilters {
  cursor?: DiscoveryCursor;
  limit: number;
}

export interface PublicPractitionerDiscoveryRepository {
  findPractitionerById(id: string): Promise<PublicPractitionerDetail | null>;
  listPractitioners(query: ListPractitionersQuery): Promise<PublicPractitionerListResponse>;
  listProfessions(): Promise<readonly PublicProfession[]>;
  listSpecialties(): Promise<readonly PublicSpecialty[]>;
}

export const PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY = Symbol(
  "PUBLIC_PRACTITIONER_DISCOVERY_REPOSITORY",
);
