import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";

import { SERVICE_CONFIG } from "../../tokens.js";
import type { PayoutExecutionClaim, PayoutGateway } from "../domain/organization-finance.types.js";

/**
 * The provider-neutral boundary for payout execution. A real provider adapter must be reviewed
 * and qualified before another mode can be added to configuration.
 */
@Injectable()
export class ConfiguredPayoutGateway implements PayoutGateway {
  constructor(@Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig) {}

  async execute(input: PayoutExecutionClaim) {
    if (this.config.payoutGateway.mode !== "synthetic") {
      throw new Error("payout_gateway_disabled");
    }
    const digest = createHash("sha256").update(input.payoutId).digest("hex").slice(0, 24);
    return {
      providerCode: "synthetic",
      providerReference: `synthetic-payout-${digest}`,
      outcome: "SUCCEEDED",
    } as const;
  }
}
