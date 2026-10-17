import type { PublicConsultationMode } from "@royal-palace/contracts";

export const PRACTITIONER_DISCOVERY_PAGE_SIZE = 20;
export const PRACTITIONER_AVAILABILITY_HORIZON_DAYS = 30;

const ALL_FILTERS = "all";

export interface PractitionerDiscoveryFilters {
  language: string;
  location: string;
  mode: string;
  profession: string;
  query: string;
  specialty: string;
}

export function buildPractitionerDiscoveryQuery(filters: PractitionerDiscoveryFilters) {
  return {
    language: filters.language || undefined,
    limit: PRACTITIONER_DISCOVERY_PAGE_SIZE,
    location: filters.location || undefined,
    mode: filters.mode === ALL_FILTERS ? undefined : (filters.mode as PublicConsultationMode),
    profession: filters.profession === ALL_FILTERS ? undefined : filters.profession,
    q: filters.query || undefined,
    specialty: filters.specialty === ALL_FILTERS ? undefined : filters.specialty,
  };
}

export function createPractitionerAvailabilityRange(now: Date): {
  from: string;
  to: string;
} {
  const from = new Date(now);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + PRACTITIONER_AVAILABILITY_HORIZON_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function practitionerModeLabel(mode: PublicConsultationMode): string {
  return mode.toLowerCase().replaceAll("_", " ");
}
