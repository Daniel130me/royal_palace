import { Inject, Injectable } from "@nestjs/common";
import type { PharmacyOperationalSettingsResponse } from "@royal-palace/contracts";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type {
  PharmacySettingsRepository,
  UpdatePharmacySettingsInput,
} from "../domain/pharmacy-settings.types.js";

const DEFAULT_PREPARATION_TARGET_MINUTES = 60;

const settingsSelect = {
  createdAt: true,
  deliveryEnabled: true,
  organization: {
    select: {
      displayName: true,
      id: true,
      publicProfile: { select: { publicPhone: true, websiteUrl: true } },
      verificationStatus: true,
    },
  },
  pickupEnabled: true,
  preparationTargetMinutes: true,
  updatedAt: true,
  version: true,
} as const;

@Injectable()
export class PrismaPharmacySettingsRepository implements PharmacySettingsRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async find(organizationId: string): Promise<PharmacyOperationalSettingsResponse | null> {
    const organization = await this.database.organization.findFirst({
      select: {
        displayName: true,
        id: true,
        publicProfile: { select: { publicPhone: true, websiteUrl: true } },
        type: true,
        updatedAt: true,
        verificationStatus: true,
        pharmacyOperationalSettings: { select: settingsSelect },
      },
      where: { id: organizationId, status: "ACTIVE", type: "PHARMACY" },
    });
    if (organization === null) return null;
    if (organization.pharmacyOperationalSettings !== null) {
      return mapSettings(organization.pharmacyOperationalSettings);
    }
    return {
      deliveryEnabled: false,
      organization: mapOrganization(organization),
      pickupEnabled: true,
      preparationTargetMinutes: DEFAULT_PREPARATION_TARGET_MINUTES,
      updatedAt: organization.updatedAt.toISOString(),
      version: 0,
    };
  }

  async update(
    input: UpdatePharmacySettingsInput,
  ): Promise<
    | { outcome: "UPDATED"; settings: PharmacyOperationalSettingsResponse }
    | { outcome: "NOT_FOUND" }
    | { outcome: "VERSION_CONFLICT" }
  > {
    return this.database.$transaction(async (transaction) => {
      const organization = await transaction.organization.findFirst({
        select: { id: true },
        where: { id: input.organizationId, status: "ACTIVE", type: "PHARMACY" },
      });
      if (organization === null) return { outcome: "NOT_FOUND" };
      const current = await transaction.pharmacyOperationalSettings.findUnique({
        select: { version: true },
        where: { organizationId: input.organizationId },
      });
      if (current === null) {
        if (input.expectedVersion !== 0) return { outcome: "VERSION_CONFLICT" };
        const created = await transaction.pharmacyOperationalSettings.create({
          data: {
            deliveryEnabled: input.deliveryEnabled,
            organizationId: input.organizationId,
            pickupEnabled: input.pickupEnabled,
            preparationTargetMinutes: input.preparationTargetMinutes,
            updatedAt: input.updatedAt,
            updatedByPrincipalId: input.principalId,
          },
          select: settingsSelect,
        });
        return { outcome: "UPDATED", settings: mapSettings(created) };
      }
      if (current.version !== input.expectedVersion) return { outcome: "VERSION_CONFLICT" };
      const changed = await transaction.pharmacyOperationalSettings.updateMany({
        data: {
          deliveryEnabled: input.deliveryEnabled,
          pickupEnabled: input.pickupEnabled,
          preparationTargetMinutes: input.preparationTargetMinutes,
          updatedAt: input.updatedAt,
          updatedByPrincipalId: input.principalId,
          version: { increment: 1 },
        },
        where: { organizationId: input.organizationId, version: current.version },
      });
      if (changed.count !== 1) return { outcome: "VERSION_CONFLICT" };
      return {
        outcome: "UPDATED",
        settings: mapSettings(
          await transaction.pharmacyOperationalSettings.findUniqueOrThrow({
            select: settingsSelect,
            where: { organizationId: input.organizationId },
          }),
        ),
      };
    });
  }
}

function mapOrganization(organization: {
  displayName: string;
  id: string;
  publicProfile: { publicPhone: string | null; websiteUrl: string | null } | null;
  verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED" | "REVOKED";
}) {
  return {
    displayName: organization.displayName,
    id: organization.id,
    publicPhone: organization.publicProfile?.publicPhone ?? null,
    verificationStatus: organization.verificationStatus,
    websiteUrl: organization.publicProfile?.websiteUrl ?? null,
  };
}

function mapSettings(settings: {
  deliveryEnabled: boolean;
  organization: Parameters<typeof mapOrganization>[0];
  pickupEnabled: boolean;
  preparationTargetMinutes: number;
  updatedAt: Date;
  version: number;
}): PharmacyOperationalSettingsResponse {
  return {
    deliveryEnabled: settings.deliveryEnabled,
    organization: mapOrganization(settings.organization),
    pickupEnabled: settings.pickupEnabled,
    preparationTargetMinutes: settings.preparationTargetMinutes,
    updatedAt: settings.updatedAt.toISOString(),
    version: settings.version,
  };
}
