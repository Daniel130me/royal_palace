import type { PatientProfileResponse, PractitionerSettingsResponse } from "@royal-palace/contracts";

export type ProfileUpdateResult<T> =
  { outcome: "UPDATED"; profile: T } | { outcome: "NOT_FOUND" } | { outcome: "VERSION_CONFLICT" };

export interface AccountProfileRepository {
  findPatient(principalId: string): Promise<PatientProfileResponse | null>;
  findPractitioner(principalId: string): Promise<PractitionerSettingsResponse | null>;
  updatePatient(input: {
    emergencyContact: {
      displayName: string;
      phoneE164: string;
      relationship: string;
    } | null;
    expectedVersion: number;
    preferredLanguage: string | null;
    principalId: string;
    requestId: string;
  }): Promise<ProfileUpdateResult<PatientProfileResponse>>;
  updatePractitioner(input: {
    acceptingPatients: boolean;
    biography: string | null;
    expectedVersion: number;
    headline: string | null;
    languageTags: readonly string[];
    principalId: string;
  }): Promise<ProfileUpdateResult<PractitionerSettingsResponse>>;
}

export const ACCOUNT_PROFILE_REPOSITORY = Symbol("ACCOUNT_PROFILE_REPOSITORY");
