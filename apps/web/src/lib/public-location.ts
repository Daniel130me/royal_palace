import type { PublicFacilityLocation, PublicPractitionerLocation } from "@royal-palace/contracts";

export function formatPublicLocation(location: PublicFacilityLocation): string {
  return [
    location.addressLine1,
    location.addressLine2,
    location.locality,
    location.administrativeArea,
    location.postalCode,
    location.countryCode,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(", ");
}

export function publicLocationLabel(location: PublicFacilityLocation): string {
  return location.locality ?? location.administrativeArea ?? location.countryCode;
}

export function formatPractitionerLocation(location: PublicPractitionerLocation): string {
  return [location.locality, location.administrativeArea, location.postalCode, location.countryCode]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(", ");
}
