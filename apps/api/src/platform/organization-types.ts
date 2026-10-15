import type { PublicOrganizationType } from "@royal-palace/contracts";

import type { OrganizationType } from "../generated/prisma/client.js";

const PUBLIC_ORGANIZATION_TYPES = new Set<OrganizationType>(["HOSPITAL", "PHARMACY", "LABORATORY"]);

/**
 * Narrows the database-wide organization enum at boundaries that intentionally expose
 * only patient-discoverable care organizations. Logistics must never leak into those flows.
 */
export function requirePublicOrganizationType(value: OrganizationType): PublicOrganizationType {
  if (PUBLIC_ORGANIZATION_TYPES.has(value)) return value as PublicOrganizationType;
  throw new Error("Non-public organization type reached a patient-facing boundary");
}

export function optionalPublicOrganizationType(
  value: OrganizationType | null,
): PublicOrganizationType | null {
  return value === null ? null : requirePublicOrganizationType(value);
}
