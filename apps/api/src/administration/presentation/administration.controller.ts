import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthorizationDeniedError } from "../../authorization/application/authorization.service.js";
import type { AuthenticatedInternalRequest } from "../../identity/presentation/authenticated-internal-request.guard.js";
import { AuthenticatedInternalRequestGuard } from "../../identity/presentation/authenticated-internal-request.guard.js";
import {
  ADMINISTRATION_MAX_PAGE_SIZE,
  AdministrationFlowError,
  AdministrationService,
} from "../application/administration.service.js";
import { InvalidAdministrationCursorError } from "../application/administration-cursor.js";

const instantSchema = z.iso.datetime({ offset: true });
const platformRoleSchema = z.enum([
  "PATIENT",
  "MANAGER",
  "ORGANIZATION_APPLICANT",
  "ORGANIZATION_ADMIN",
  "ORGANIZATION_STAFF",
  "PROVIDER",
  "SUPPORT",
  "ADMINISTRATOR",
  "FINANCE",
  "LOGISTICS",
  "SYSTEM_WORKER",
]);
const commonListFields = {
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(ADMINISTRATION_MAX_PAGE_SIZE).optional(),
  q: z.string().trim().min(1).max(100).optional(),
};
const idSchema = z.uuid();
const dashboardQuerySchema = z
  .object({ dayFrom: instantSchema, dayTo: instantSchema })
  .strict()
  .refine((value) => new Date(value.dayTo) > new Date(value.dayFrom), {
    message: "Invalid day range",
  });
const complaintQuerySchema = z
  .object({
    ...commonListFields,
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    scope: z.enum(["ALL", "OPEN", "RESOLVED"]).default("OPEN"),
  })
  .strict();
const complaintTransitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    internalNote: z.string().trim().min(1).max(2000).optional(),
    status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]),
  })
  .strict();
const deliveryQuerySchema = z
  .object({
    ...commonListFields,
    scope: z.enum(["ALL", "ACTIVE", "DELIVERED", "EXCEPTION"]).default("ALL"),
  })
  .strict();
const appointmentQuerySchema = z
  .object({
    ...commonListFields,
    dayFrom: instantSchema,
    dayTo: instantSchema,
    scope: z.enum(["ALL", "TODAY", "UPCOMING", "COMPLETED", "UNSUCCESSFUL"]).default("ALL"),
  })
  .strict()
  .refine((value) => new Date(value.dayTo) > new Date(value.dayFrom), {
    message: "Invalid day range",
  });
const auditQuerySchema = z
  .object({
    ...commonListFields,
    action: z.string().trim().min(1).max(160).optional(),
    effectiveRole: platformRoleSchema.optional(),
    from: instantSchema.optional(),
    to: instantSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.to) > new Date(value.from),
    { message: "Invalid audit range" },
  );
const practitionerQuerySchema = z
  .object({
    ...commonListFields,
    scope: z.enum(["ALL", "PENDING", "VERIFIED", "SUSPENDED", "REVOKED"]).default("ALL"),
  })
  .strict();
const practitionerTransitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    note: z.string().trim().min(1).max(2000).optional(),
    status: z.enum(["VERIFIED", "SUSPENDED", "REVOKED"]),
  })
  .strict();

@Controller("v1/admin")
@UseGuards(AuthenticatedInternalRequestGuard)
export class AdministrationController {
  constructor(
    @Inject(AdministrationService) private readonly administration: AdministrationService,
  ) {}

  @Get("dashboard")
  getDashboard(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(dashboardQuerySchema, rawQuery);
    return execute(() => this.administration.getDashboard(requestContext(request), query));
  }

  @Get("complaints")
  listComplaints(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(complaintQuerySchema, rawQuery);
    return execute(() =>
      this.administration.listComplaints(requestContext(request), {
        cursor: query.cursor,
        limit: query.limit,
        priority: query.priority,
        query: query.q,
        scope: query.scope,
      }),
    );
  }

  @Patch("complaints/:complaintId")
  transitionComplaint(
    @Param("complaintId") rawComplaintId: string,
    @Body() rawBody: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.administration.transitionComplaint(
        requestContext(request),
        parse(idSchema, rawComplaintId),
        parse(complaintTransitionSchema, rawBody),
      ),
    );
  }

  @Get("deliveries")
  listDeliveries(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(deliveryQuerySchema, rawQuery);
    return execute(() =>
      this.administration.listDeliveries(requestContext(request), {
        cursor: query.cursor,
        limit: query.limit,
        query: query.q,
        scope: query.scope,
      }),
    );
  }

  @Get("appointments")
  listAppointments(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(appointmentQuerySchema, rawQuery);
    return execute(() =>
      this.administration.listAppointments(requestContext(request), {
        cursor: query.cursor,
        dayFrom: query.dayFrom,
        dayTo: query.dayTo,
        limit: query.limit,
        query: query.q,
        scope: query.scope,
      }),
    );
  }

  @Get("audit-events")
  listAuditEvents(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(auditQuerySchema, rawQuery);
    return execute(() =>
      this.administration.listAuditEvents(requestContext(request), {
        action: query.action,
        cursor: query.cursor,
        effectiveRole: query.effectiveRole,
        from: query.from,
        limit: query.limit,
        query: query.q,
        to: query.to,
      }),
    );
  }

  @Get("practitioners")
  listPractitioners(@Query() rawQuery: unknown, @Req() request: AuthenticatedInternalRequest) {
    const query = parse(practitionerQuerySchema, rawQuery);
    return execute(() =>
      this.administration.listPractitioners(requestContext(request), {
        cursor: query.cursor,
        limit: query.limit,
        query: query.q,
        scope: query.scope,
      }),
    );
  }

  @Get("practitioners/:practitionerId")
  getPractitioner(
    @Param("practitionerId") rawPractitionerId: string,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.administration.getPractitioner(
        requestContext(request),
        parse(idSchema, rawPractitionerId),
      ),
    );
  }

  @Patch("practitioners/:practitionerId/verification")
  transitionPractitioner(
    @Param("practitionerId") rawPractitionerId: string,
    @Body() rawBody: unknown,
    @Req() request: AuthenticatedInternalRequest,
  ) {
    return execute(() =>
      this.administration.transitionPractitioner(
        requestContext(request),
        parse(idSchema, rawPractitionerId),
        parse(practitionerTransitionSchema, rawBody),
      ),
    );
  }
}

function requestContext(request: AuthenticatedInternalRequest) {
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
    if (error instanceof InvalidAdministrationCursorError) {
      throw new HttpException({ error: "invalid_cursor", message: error.message }, 400);
    }
    if (error instanceof AdministrationFlowError) {
      throw new HttpException({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}
