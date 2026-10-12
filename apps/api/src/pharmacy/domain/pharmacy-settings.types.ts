import type { PharmacyOperationalSettingsResponse } from "@royal-palace/contracts";

export interface UpdatePharmacySettingsInput {
  deliveryEnabled: boolean;
  expectedVersion: number;
  organizationId: string;
  pickupEnabled: boolean;
  preparationTargetMinutes: number;
  principalId: string;
  updatedAt: Date;
}

export interface PharmacySettingsRepository {
  find(organizationId: string): Promise<PharmacyOperationalSettingsResponse | null>;
  update(
    input: UpdatePharmacySettingsInput,
  ): Promise<
    | { outcome: "UPDATED"; settings: PharmacyOperationalSettingsResponse }
    | { outcome: "NOT_FOUND" }
    | { outcome: "VERSION_CONFLICT" }
  >;
}

export const PHARMACY_SETTINGS_REPOSITORY = Symbol("PHARMACY_SETTINGS_REPOSITORY");
