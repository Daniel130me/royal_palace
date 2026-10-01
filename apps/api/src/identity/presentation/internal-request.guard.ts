import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_SESSION_REFERENCE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  verifyInternalRequest,
} from "@royal-palace/security/internal-request";
import type { FastifyRequest } from "fastify";

import { SERVICE_CONFIG } from "../../tokens.js";

export type SignedFastifyRequest = FastifyRequest & { rawBody?: Buffer };

@Injectable()
export class InternalRequestGuard implements CanActivate {
  constructor(@Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SignedFastifyRequest>();
    assertSignedInternalRequest(request, this.config.identity.bffInternalSecret);
    return true;
  }
}

export function assertSignedInternalRequest(request: SignedFastifyRequest, secret: string): void {
  const requestId = singleHeader(request.headers["x-request-id"]);
  if (requestId === undefined) throw unauthorizedInternalRequest();
  const path = request.url.split("?", 1)[0] ?? request.url;
  const valid = verifyInternalRequest(
    {
      body: request.rawBody?.toString("utf8") ?? "",
      idempotencyKey: singleHeader(request.headers["idempotency-key"]),
      method: request.method,
      path,
      requestId,
      sessionReference: singleHeader(request.headers[INTERNAL_SESSION_REFERENCE_HEADER]),
      signature: singleHeader(request.headers[INTERNAL_SIGNATURE_HEADER]),
      timestamp: singleHeader(request.headers[INTERNAL_TIMESTAMP_HEADER]),
    },
    secret,
  );
  if (!valid) throw unauthorizedInternalRequest();
}

function unauthorizedInternalRequest(): UnauthorizedException {
  return new UnauthorizedException({
    error: "invalid_internal_request",
    message: "Internal request authentication failed",
  });
}

export function singleHeader(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
