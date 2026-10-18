import { Inject, Injectable } from "@nestjs/common";
import type { PatientProfileResponse, PractitionerSettingsResponse } from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type {
  AccountProfileRepository,
  ProfileUpdateResult,
} from "../domain/account-profile.types.js";

const practitionerSelect = {
  displayName: true,
  id: true,
  languages: {
    orderBy: { languageTag: "asc" as const },
    select: { languageTag: true },
    take: 20,
  },
  publicProfile: {
    select: { acceptingPatients: true, biography: true, headline: true, version: true },
  },
  specialties: {
    orderBy: [{ isPrimary: "desc" as const }, { specialty: { name: "asc" as const } }],
    select: { specialty: { select: { name: true } } },
    take: 1,
  },
  verificationStatus: true,
} satisfies Prisma.PractitionerSelect;

const patientSelect = {
  countryCode: true,
  dateOfBirth: true,
  emergencyContact: {
    select: {
      displayName: true,
      id: true,
      phoneE164: true,
      relationship: true,
      version: true,
    },
  },
  familyName: true,
  givenName: true,
  id: true,
  phoneE164: true,
  preferredLanguage: true,
  version: true,
} satisfies Prisma.PatientSelect;

@Injectable()
export class PrismaAccountProfileRepository implements AccountProfileRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async findPatient(principalId: string): Promise<PatientProfileResponse | null> {
    const patient = await this.database.patient.findUnique({
      select: patientSelect,
      where: { principalId },
    });
    return patient === null ? null : mapPatient(patient);
  }

  async findPractitioner(principalId: string): Promise<PractitionerSettingsResponse | null> {
    const practitioner = await this.database.practitioner.findUnique({
      select: practitionerSelect,
      where: { principalId },
    });
    return practitioner?.publicProfile === null || practitioner === null
      ? null
      : mapPractitioner(practitioner);
  }

  async updatePatient(input: {
    emergencyContact: {
      displayName: string;
      phoneE164: string;
      relationship: string;
    } | null;
    expectedVersion: number;
    preferredLanguage: string | null;
    principalId: string;
    requestId: string;
  }): Promise<ProfileUpdateResult<PatientProfileResponse>> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.patient.findUnique({
        select: { id: true },
        where: { principalId: input.principalId },
      });
      if (current === null) return { outcome: "NOT_FOUND" };

      const changed = await transaction.patient.updateMany({
        data: { preferredLanguage: input.preferredLanguage, version: { increment: 1 } },
        where: { id: current.id, version: input.expectedVersion },
      });
      if (changed.count !== 1) return { outcome: "VERSION_CONFLICT" };

      if (input.emergencyContact === null) {
        await transaction.patientEmergencyContact.deleteMany({
          where: { patientId: current.id },
        });
      } else {
        await transaction.patientEmergencyContact.upsert({
          create: {
            ...input.emergencyContact,
            id: createOpaqueId(),
            patientId: current.id,
          },
          update: {
            ...input.emergencyContact,
            version: { increment: 1 },
          },
          where: { patientId: current.id },
        });
      }
      await transaction.auditEvent.create({
        data: {
          action: "patient.account_profile.updated",
          actorPrincipalId: input.principalId,
          effectiveRole: "PATIENT",
          id: createOpaqueId(),
          metadata: {
            emergencyContactPresent: input.emergencyContact !== null,
            preferredLanguagePresent: input.preferredLanguage !== null,
          },
          patientScopeId: current.id,
          requestId: input.requestId,
          resourceId: current.id,
          resourceType: "patient_account_profile",
          result: "SUCCEEDED",
        },
      });
      const patient = await transaction.patient.findUniqueOrThrow({
        select: patientSelect,
        where: { id: current.id },
      });
      return { outcome: "UPDATED", profile: mapPatient(patient) };
    });
  }

  async updatePractitioner(input: {
    acceptingPatients: boolean;
    biography: string | null;
    expectedVersion: number;
    headline: string | null;
    languageTags: readonly string[];
    principalId: string;
  }): Promise<ProfileUpdateResult<PractitionerSettingsResponse>> {
    return this.database.$transaction(async (transaction) => {
      const practitioner = await transaction.practitioner.findUnique({
        select: { id: true, publicProfile: { select: { version: true } } },
        where: { principalId: input.principalId },
      });
      if (practitioner?.publicProfile === null || practitioner === null) {
        return { outcome: "NOT_FOUND" };
      }
      const changed = await transaction.practitionerPublicProfile.updateMany({
        data: {
          acceptingPatients: input.acceptingPatients,
          biography: input.biography,
          headline: input.headline,
          version: { increment: 1 },
        },
        where: { practitionerId: practitioner.id, version: input.expectedVersion },
      });
      if (changed.count !== 1) return { outcome: "VERSION_CONFLICT" };

      await transaction.practitionerLanguage.deleteMany({
        where: { practitionerId: practitioner.id },
      });
      if (input.languageTags.length > 0) {
        await transaction.practitionerLanguage.createMany({
          data: input.languageTags.map((languageTag) => ({
            id: createOpaqueId(),
            languageTag,
            practitionerId: practitioner.id,
          })),
        });
      }
      const updated = await transaction.practitioner.findUniqueOrThrow({
        select: practitionerSelect,
        where: { id: practitioner.id },
      });
      return { outcome: "UPDATED", profile: mapPractitioner(updated) };
    });
  }
}

function mapPatient(patient: {
  countryCode: string | null;
  dateOfBirth: Date | null;
  emergencyContact: {
    displayName: string;
    id: string;
    phoneE164: string;
    relationship: string;
    version: number;
  } | null;
  familyName: string;
  givenName: string;
  id: string;
  phoneE164: string | null;
  preferredLanguage: string | null;
  version: number;
}): PatientProfileResponse {
  return {
    ...patient,
    dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  };
}

function mapPractitioner(practitioner: {
  displayName: string;
  id: string;
  languages: readonly { languageTag: string }[];
  publicProfile: {
    acceptingPatients: boolean;
    biography: string | null;
    headline: string | null;
    version: number;
  } | null;
  specialties: readonly { specialty: { name: string } }[];
  verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
}): PractitionerSettingsResponse {
  if (practitioner.publicProfile === null) throw new Error("Practitioner profile is unavailable");
  return {
    acceptingPatients: practitioner.publicProfile.acceptingPatients,
    biography: practitioner.publicProfile.biography,
    displayName: practitioner.displayName,
    headline: practitioner.publicProfile.headline,
    id: practitioner.id,
    languageTags: practitioner.languages.map(({ languageTag }) => languageTag),
    primarySpecialty: practitioner.specialties[0]?.specialty.name ?? null,
    verificationStatus: practitioner.verificationStatus,
    version: practitioner.publicProfile.version,
  };
}
