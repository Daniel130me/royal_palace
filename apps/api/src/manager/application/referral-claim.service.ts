import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { OnboardingApplicationData } from "@royal-palace/contracts";
import { issueReferralToken, verifyReferralToken } from "@royal-palace/security";

import { SERVICE_CONFIG } from "../../tokens.js";
import {
  MANAGER_REPOSITORY,
  type ManagerRepository,
  type StoredReferralLinkForClaim,
} from "../domain/manager-repository.types.js";

export interface ResolvedReferralClaim {
  linkId: string;
  managerProfileId: string;
}

export class InvalidReferralClaimError extends Error {
  constructor() {
    super("Referral link is invalid or unavailable");
    this.name = "InvalidReferralClaimError";
  }
}

@Injectable()
export class ReferralClaimService {
  constructor(
    @Inject(MANAGER_REPOSITORY) private readonly repository: ManagerRepository,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async resolve(
    token: string,
    application: OnboardingApplicationData,
    now = new Date(),
  ): Promise<ResolvedReferralClaim> {
    const claims = verifyReferralToken(token, this.config.identity.referralSigningKeys);
    if (claims === null) throw new InvalidReferralClaimError();
    const link = await this.repository.findReferralLinkForClaim(claims.linkId);
    if (!isUsable(link, claims, application, now)) throw new InvalidReferralClaimError();
    return { linkId: link.id, managerProfileId: link.managerProfileId };
  }

  issue(link: Pick<StoredReferralLinkForClaim, "id" | "signingKeyId" | "tokenVersion">): string {
    const key = this.config.identity.referralSigningKeys[link.signingKeyId];
    if (key === undefined) throw new Error("Referral signing key is unavailable");
    return issueReferralToken(
      { keyId: link.signingKeyId, linkId: link.id, tokenVersion: link.tokenVersion },
      key,
    );
  }
}

function isUsable(
  link: StoredReferralLinkForClaim | null,
  claims: { keyId: string; tokenVersion: number },
  application: OnboardingApplicationData,
  now: Date,
): link is StoredReferralLinkForClaim {
  if (
    link === null ||
    link.status !== "ACTIVE" ||
    link.managerStatus !== "ACTIVE" ||
    link.signingKeyId !== claims.keyId ||
    link.tokenVersion !== claims.tokenVersion ||
    link.validFrom > now ||
    (link.validUntil !== null && link.validUntil <= now)
  ) {
    return false;
  }
  if (application.kind === "PATIENT") return link.audience === "PATIENT";
  if (application.kind === "ORGANIZATION") {
    return (
      link.audience === "ORGANIZATION" &&
      link.organizationType === application.values.organizationType
    );
  }
  return false;
}
