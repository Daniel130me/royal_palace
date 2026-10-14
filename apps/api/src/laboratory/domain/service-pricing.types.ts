import type { ServicePriceListResponse, ServicePriceResponse } from "@royal-palace/contracts";

export interface ServicePricingRepository {
  activate(input: {
    approvedByPrincipalId: string;
    expectedVersion: number;
    priceId: string;
  }): Promise<ServicePriceResponse | null>;
  create(input: {
    createdByPrincipalId: string;
    currency: string;
    effectiveFrom: Date;
    effectiveUntil?: Date;
    patientPriceMinor: bigint;
    providerPayoutMinor: bigint;
    serviceId: string;
  }): Promise<ServicePriceResponse | null>;
  list(): Promise<ServicePriceListResponse>;
}

export const SERVICE_PRICING_REPOSITORY = Symbol("SERVICE_PRICING_REPOSITORY");
