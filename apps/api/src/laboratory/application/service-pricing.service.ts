import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  SERVICE_PRICING_REPOSITORY,
  type ServicePricingRepository,
} from "../domain/service-pricing.types.js";

export class ServicePricingFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServicePricingFlowError";
  }
}

@Injectable()
export class ServicePricingService {
  constructor(
    @Inject(SERVICE_PRICING_REPOSITORY) private readonly repository: ServicePricingRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async list(context: { actor: CurrentSession; requestId: string }) {
    await this.authorize(context, "service_price_catalogue");
    return this.repository.list();
  }

  async create(
    context: { actor: CurrentSession; requestId: string },
    input: {
      currency: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      patientPriceMinor: string;
      providerPayoutMinor: string;
      serviceId: string;
    },
  ) {
    await this.authorize(context, input.serviceId);
    this.assertPrivilegedAssurance(context.actor);
    const effectiveFrom = parseInstant(input.effectiveFrom);
    const effectiveUntil =
      input.effectiveUntil === undefined ? undefined : parseInstant(input.effectiveUntil);
    if (effectiveUntil !== undefined && effectiveUntil <= effectiveFrom) {
      throw new ServicePricingFlowError("invalid_price_validity", 400, "Price validity is invalid");
    }
    const patientPriceMinor = parseMinor(input.patientPriceMinor);
    const providerPayoutMinor = parseMinor(input.providerPayoutMinor, true);
    if (providerPayoutMinor > patientPriceMinor) {
      throw new ServicePricingFlowError(
        "invalid_provider_payout",
        400,
        "Provider payout cannot exceed the patient price",
      );
    }
    const created = await this.repository.create({
      createdByPrincipalId: context.actor.principalId,
      currency: input.currency.trim().toUpperCase(),
      effectiveFrom,
      ...(effectiveUntil === undefined ? {} : { effectiveUntil }),
      patientPriceMinor,
      providerPayoutMinor,
      serviceId: input.serviceId,
    });
    if (created === null)
      throw new ServicePricingFlowError("service_not_found", 404, "Service was not found");
    return created;
  }

  async activate(
    context: { actor: CurrentSession; requestId: string },
    priceId: string,
    expectedVersion: number,
  ) {
    await this.authorize(context, priceId);
    this.assertPrivilegedAssurance(context.actor);
    const activated = await this.repository.activate({
      approvedByPrincipalId: context.actor.principalId,
      expectedVersion,
      priceId,
    });
    if (activated === null)
      throw new ServicePricingFlowError("price_conflict", 409, "Price changed or is unavailable");
    return activated;
  }

  private authorize(context: { actor: CurrentSession; requestId: string }, resourceId: string) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { resourceId, resourceType: "service_price" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_SERVICE_PRICING,
      requestId: context.requestId,
    });
  }

  private assertPrivilegedAssurance(session: CurrentSession) {
    const age = Date.now() - new Date(session.authenticatedAt).getTime();
    if (
      session.assuranceContext !== this.config.identity.privilegedAssuranceContext ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > this.config.identity.privilegedAuthMaxAgeSeconds * 1000
    ) {
      throw new ServicePricingFlowError(
        "step_up_required",
        403,
        "Step-up authentication is required",
      );
    }
  }
}

function parseInstant(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new ServicePricingFlowError("invalid_instant", 400, "Date is invalid");
  return parsed;
}

function parseMinor(value: string, allowZero = false) {
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n)
    throw new ServicePricingFlowError("invalid_amount", 400, "Amount is invalid");
  return parsed;
}
