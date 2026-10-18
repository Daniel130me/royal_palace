import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PolicyProtected } from "../../authorization/presentation/policy-protected.decorator.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  AccountProfileConflictError,
  AccountProfileNotFoundError,
  AccountProfileService,
} from "../application/account-profile.service.js";

const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const patientUpdateSchema = z
  .object({
    emergencyContact: z
      .object({
        displayName: z.string().trim().min(1).max(160),
        phoneE164: z
          .string()
          .trim()
          .regex(/^\+[1-9]\d{1,14}$/),
        relationship: z.string().trim().min(1).max(100),
      })
      .strict()
      .nullable(),
    expectedVersion: z.number().int().min(1),
    preferredLanguage: nullableText(35),
  })
  .strict();
const practitionerUpdateSchema = z
  .object({
    acceptingPatients: z.boolean(),
    biography: nullableText(3000),
    expectedVersion: z.number().int().min(1),
    headline: nullableText(240),
    languageTags: z.array(z.string().trim().min(2).max(35)).max(20),
  })
  .strict();

@Controller("v1/account")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AccountProfileController {
  constructor(@Inject(AccountProfileService) private readonly profiles: AccountProfileService) {}

  @Get("patient-profile")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PROFILE)
  getPatient(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.profiles.getPatient(context(request)));
  }

  @Patch("patient-profile")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PROFILE)
  updatePatient(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    const input = parse(patientUpdateSchema, body);
    return execute(() =>
      this.profiles.updatePatient(context(request), {
        ...input,
        preferredLanguage: canonicalLanguage(input.preferredLanguage),
      }),
    );
  }

  @Get("practitioner-profile")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PROFILE)
  getPractitioner(@Req() request: AuthenticatedInternalRequest) {
    return execute(() => this.profiles.getPractitioner(context(request)));
  }

  @Patch("practitioner-profile")
  @PolicyProtected(AUTHORIZATION_POLICY.MANAGE_OWN_PROFILE)
  updatePractitioner(@Body() body: unknown, @Req() request: AuthenticatedInternalRequest) {
    const input = parse(practitionerUpdateSchema, body);
    return execute(() =>
      this.profiles.updatePractitioner(context(request), {
        ...input,
        languageTags: [...new Set(input.languageTags.map((tag) => canonicalLanguage(tag)))],
      }),
    );
  }
}

function canonicalLanguage(value: string): string;
function canonicalLanguage(value: string | null): string | null;
function canonicalLanguage(value: string | null): string | null {
  if (value === null) return null;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? value;
  } catch {
    throw new HttpException(
      { error: "invalid_language_tag", message: "Language must be a valid BCP 47 tag" },
      400,
    );
  }
}

function context(request: AuthenticatedInternalRequest) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string") {
    throw new HttpException(
      { error: "missing_request_id", message: "Request ID is required" },
      400,
    );
  }
  return { actor: request.currentSession, requestId };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpException({ error: "invalid_request", message: "Request is invalid" }, 400);
  }
  return result.data;
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      throw new HttpException({ error: "access_denied", message: "Access is denied" }, 403);
    }
    if (error instanceof AccountProfileNotFoundError) {
      throw new HttpException(
        { error: "account_profile_not_found", message: "Account profile was not found" },
        404,
      );
    }
    if (error instanceof AccountProfileConflictError) {
      throw new HttpException(
        { error: "account_profile_conflict", message: "Profile changed; reload and retry" },
        409,
      );
    }
    throw error;
  }
}
