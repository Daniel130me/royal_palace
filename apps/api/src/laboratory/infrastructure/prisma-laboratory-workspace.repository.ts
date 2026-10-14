import { Inject, Injectable } from "@nestjs/common";
import type { LaboratoryWorkspaceResponse } from "@royal-palace/contracts";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { LaboratoryWorkspaceRepository } from "../domain/laboratory-workspace.types.js";

@Injectable()
export class PrismaLaboratoryWorkspaceRepository implements LaboratoryWorkspaceRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async find(organizationId: string): Promise<LaboratoryWorkspaceResponse | null> {
    const now = new Date();
    const organization = await this.database.organization.findFirst({
      relationLoadStrategy: "join",
      select: {
        displayName: true,
        facilityLocations: {
          orderBy: [{ isPrimary: "desc" }, { label: "asc" }, { id: "asc" }],
          select: {
            addressLine1: true,
            addressLine2: true,
            administrativeArea: true,
            countryCode: true,
            label: true,
            locality: true,
            postalCode: true,
            publicPhone: true,
          },
          take: 1,
          where: { status: "ACTIVE" },
        },
        id: true,
        legalName: true,
        organizationServices: {
          orderBy: [{ service: { name: "asc" } }, { id: "asc" }],
          select: {
            description: true,
            id: true,
            service: {
              select: {
                category: true,
                code: true,
                name: true,
                servicePrices: {
                  orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
                  select: {
                    currency: true,
                    patientPriceMinor: true,
                    providerPayoutMinor: true,
                  },
                  take: 1,
                  where: {
                    effectiveFrom: { lte: now },
                    OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
                    status: "ACTIVE",
                  },
                },
              },
            },
            status: true,
            supportsHomeCollection: true,
          },
        },
        publicProfile: { select: { publicPhone: true, websiteUrl: true } },
        registrations: {
          orderBy: [{ verifiedAt: "desc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            authorityName: true,
            jurisdictionCode: true,
            registrationNumber: true,
            verifiedAt: true,
          },
          take: 1,
        },
        verificationStatus: true,
      },
      where: { id: organizationId, status: "ACTIVE", type: "LABORATORY" },
    });
    if (organization === null) return null;
    const location = organization.facilityLocations[0] ?? null;
    const registration = organization.registrations[0] ?? null;
    return {
      organization: {
        displayName: organization.displayName,
        id: organization.id,
        legalName: organization.legalName,
        publicPhone: organization.publicProfile?.publicPhone ?? location?.publicPhone ?? null,
        verificationStatus: organization.verificationStatus,
        websiteUrl: organization.publicProfile?.websiteUrl ?? null,
      },
      primaryLocation: location,
      registration:
        registration === null
          ? null
          : {
              ...registration,
              verifiedAt: registration.verifiedAt?.toISOString() ?? null,
            },
      services: organization.organizationServices.map((offering) => {
        const price = offering.service.servicePrices[0] ?? null;
        return {
          category: offering.service.category,
          code: offering.service.code,
          description: offering.description,
          id: offering.id,
          name: offering.service.name,
          pricing:
            price === null
              ? null
              : {
                  currency: price.currency,
                  laboratoryPayoutMinor: price.providerPayoutMinor.toString(),
                  patientPriceMinor: price.patientPriceMinor.toString(),
                },
          status: offering.status,
          supportsHomeCollection: offering.supportsHomeCollection,
        };
      }),
    };
  }
}
