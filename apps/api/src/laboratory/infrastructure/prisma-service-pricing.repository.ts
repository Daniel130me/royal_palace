import { Inject, Injectable } from "@nestjs/common";
import type { ServicePriceResponse } from "@royal-palace/contracts";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type { ServicePricingRepository } from "../domain/service-pricing.types.js";

const priceSelect = {
  currency: true,
  effectiveFrom: true,
  effectiveUntil: true,
  id: true,
  patientPriceMinor: true,
  providerPayoutMinor: true,
  service: { select: { category: true, code: true, id: true, name: true } },
  status: true,
  version: true,
} as const;

@Injectable()
export class PrismaServicePricingRepository implements ServicePricingRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async list() {
    const rows = await this.database.servicePrice.findMany({
      orderBy: [{ service: { name: "asc" } }, { createdAt: "desc" }, { id: "desc" }],
      select: priceSelect,
    });
    return { data: rows.map(mapPrice) };
  }

  async create(input: {
    createdByPrincipalId: string;
    currency: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    patientPriceMinor: bigint;
    providerPayoutMinor: bigint;
    serviceId: string;
  }) {
    const service = await this.database.serviceTaxonomy.findFirst({
      select: { id: true },
      where: { id: input.serviceId, status: "ACTIVE" },
    });
    if (service === null) return null;
    return mapPrice(
      await this.database.servicePrice.create({
        data: {
          ...input,
          id: createOpaqueId(),
          updatedAt: new Date(),
        },
        select: priceSelect,
      }),
    );
  }

  async activate(input: {
    approvedByPrincipalId: string;
    expectedVersion: number;
    priceId: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const candidate = await transaction.servicePrice.findFirst({
        select: { id: true, serviceId: true },
        where: { id: input.priceId, status: "DRAFT", version: input.expectedVersion },
      });
      if (candidate === null) return null;
      const now = new Date();
      await transaction.servicePrice.updateMany({
        data: { status: "RETIRED", updatedAt: now, version: { increment: 1 } },
        where: { serviceId: candidate.serviceId, status: "ACTIVE" },
      });
      const activated = await transaction.servicePrice.updateMany({
        data: {
          approvedByPrincipalId: input.approvedByPrincipalId,
          status: "ACTIVE",
          updatedAt: now,
          version: { increment: 1 },
        },
        where: { id: candidate.id, status: "DRAFT", version: input.expectedVersion },
      });
      if (activated.count !== 1) return null;
      return mapPrice(
        await transaction.servicePrice.findUniqueOrThrow({
          select: priceSelect,
          where: { id: candidate.id },
        }),
      );
    });
  }
}

function mapPrice(row: {
  currency: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  id: string;
  patientPriceMinor: bigint;
  providerPayoutMinor: bigint;
  service: { category: string; code: string; id: string; name: string };
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  version: number;
}): ServicePriceResponse {
  return {
    ...row,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
    patientPriceMinor: row.patientPriceMinor.toString(),
    providerPayoutMinor: row.providerPayoutMinor.toString(),
  };
}
