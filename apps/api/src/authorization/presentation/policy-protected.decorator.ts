import { SetMetadata } from "@nestjs/common";

import type { AuthorizationPolicy } from "../domain/authorization.types.js";

export const AUTHORIZATION_POLICY_METADATA = "royal-palace:authorization-policy";

/** Marks a controller operation for the protected-route architecture test and API inventory. */
export const PolicyProtected = (policy: AuthorizationPolicy): MethodDecorator =>
  SetMetadata(AUTHORIZATION_POLICY_METADATA, policy);
