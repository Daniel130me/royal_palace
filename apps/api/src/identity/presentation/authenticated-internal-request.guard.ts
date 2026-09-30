import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { CurrentSession } from "@royal-palace/contracts";
import { INTERNAL_SESSION_REFERENCE_HEADER } from "@royal-palace/security";

import { SERVICE_CONFIG } from "../../tokens.js";
import { IdentityService } from "../application/identity.service.js";
import {
  assertSignedInternalRequest,
  singleHeader,
  type SignedFastifyRequest,
} from "./internal-request.guard.js";

export type AuthenticatedInternalRequest = SignedFastifyRequest & {
  currentSession: CurrentSession;
};

/**
 * Authenticates both service and user boundaries. The encrypted browser cookie never
 * leaves the BFF; its opaque session reference is bound into the internal HMAC before
 * the API resolves application-owned roles and memberships.
 */
@Injectable()
export class AuthenticatedInternalRequestGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedInternalRequest>();
    assertSignedInternalRequest(request, this.config.identity.bffInternalSecret);
    const sessionReference = singleHeader(request.headers[INTERNAL_SESSION_REFERENCE_HEADER]);
    if (sessionReference === undefined) throw unauthorizedSession();
    try {
      request.currentSession = await this.identity.currentSession(sessionReference);
      return true;
    } catch {
      throw unauthorizedSession();
    }
  }
}

function unauthorizedSession(): UnauthorizedException {
  return new UnauthorizedException({
    error: "invalid_session",
    message: "An active authenticated session is required",
  });
}
