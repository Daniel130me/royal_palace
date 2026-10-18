import type { NextRequest } from "next/server";

import { authErrorResponse, BffAuthError, proxyAuthenticatedApi } from "./bff";

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const APPOINTMENT_SCOPES = new Set(["ALL", "TODAY", "UPCOMING", "COMPLETED", "UNSUCCESSFUL"]);
const COMPLAINT_SCOPES = new Set(["ALL", "OPEN", "RESOLVED"]);
const COMPLAINT_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const DELIVERY_SCOPES = new Set(["ALL", "ACTIVE", "DELIVERED", "EXCEPTION"]);
const PLATFORM_ROLES = new Set([
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
const PRACTITIONER_SCOPES = new Set(["ALL", "PENDING", "VERIFIED", "SUSPENDED", "REVOKED"]);
const PRINCIPAL_SCOPES = new Set(["ALL", "ACTIVE", "DISABLED"]);

export function proxyAdminAppointmentList(request: NextRequest) {
  return proxyValidated(request, adminAppointmentListPath);
}

export function adminAppointmentListPath(url: URL): string {
  return validatedPath(
    url,
    "/v1/admin/appointments",
    ["dayFrom", "dayTo", "scope", "cursor", "limit", "q"],
    (source, output) => {
      copyInstant(source, output, "dayFrom", true);
      copyInstant(source, output, "dayTo", true);
      copyEnum(source, output, "scope", APPOINTMENT_SCOPES);
      copyCommon(source, output);
    },
  );
}

export function proxyAdminDashboard(request: NextRequest) {
  return proxyValidated(request, adminDashboardPath);
}

export function adminDashboardPath(url: URL): string {
  return validatedPath(url, "/v1/admin/dashboard", ["dayFrom", "dayTo"], (source, output) => {
    copyInstant(source, output, "dayFrom", true);
    copyInstant(source, output, "dayTo", true);
  });
}

export function proxyAdminComplaintList(request: NextRequest) {
  return proxyValidated(request, adminComplaintListPath);
}

export function adminComplaintListPath(url: URL): string {
  return validatedPath(
    url,
    "/v1/admin/complaints",
    ["priority", "scope", "cursor", "limit", "q"],
    (source, output) => {
      copyEnum(source, output, "priority", COMPLAINT_PRIORITIES);
      copyEnum(source, output, "scope", COMPLAINT_SCOPES);
      copyCommon(source, output);
    },
  );
}

export function proxyAdminDeliveryList(request: NextRequest) {
  return proxyValidated(request, adminDeliveryListPath);
}

export function adminDeliveryListPath(url: URL): string {
  return validatedPath(
    url,
    "/v1/admin/deliveries",
    ["scope", "cursor", "limit", "q"],
    (source, output) => {
      copyEnum(source, output, "scope", DELIVERY_SCOPES);
      copyCommon(source, output);
    },
  );
}

export function proxyAdminAuditList(request: NextRequest) {
  return proxyValidated(request, adminAuditListPath);
}

export function proxyAdminPractitionerList(request: NextRequest) {
  return proxyValidated(request, adminPractitionerListPath);
}

export function proxyAdminPrincipalList(request: NextRequest) {
  return proxyValidated(request, adminPrincipalListPath);
}

export function adminPrincipalListPath(url: URL): string {
  return validatedPath(
    url,
    "/v1/admin/principals",
    ["scope", "role", "cursor", "limit", "q"],
    (source, output) => {
      copyEnum(source, output, "scope", PRINCIPAL_SCOPES);
      copyEnum(source, output, "role", PLATFORM_ROLES);
      copyCommon(source, output);
    },
  );
}

export function adminPractitionerListPath(url: URL): string {
  return validatedPath(
    url,
    "/v1/admin/practitioners",
    ["scope", "cursor", "limit", "q"],
    (source, output) => {
      copyEnum(source, output, "scope", PRACTITIONER_SCOPES);
      copyCommon(source, output);
    },
  );
}

export function adminAuditListPath(url: URL): string {
  return validatedPath(
    url,
    "/v1/admin/audit-events",
    ["from", "to", "effectiveRole", "action", "cursor", "limit", "q"],
    (source, output) => {
      copyInstant(source, output, "from", false);
      copyInstant(source, output, "to", false);
      copyEnum(source, output, "effectiveRole", PLATFORM_ROLES);
      copyText(source, output, "action", 160);
      copyCommon(source, output);
    },
  );
}

function proxyValidated(request: NextRequest, buildPath: (url: URL) => string) {
  try {
    return proxyAuthenticatedApi(request, buildPath(request.nextUrl), "GET");
  } catch (error) {
    return authErrorResponse(error);
  }
}

function validatedPath(
  url: URL,
  apiPath: string,
  allowedKeys: readonly string[],
  build: (source: URLSearchParams, output: URLSearchParams) => void,
): string {
  const allowed = new Set(allowedKeys);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) invalid(key);
  }
  const output = new URLSearchParams();
  build(url.searchParams, output);
  const query = output.toString();
  return query.length === 0 ? apiPath : `${apiPath}?${query}`;
}

function copyCommon(source: URLSearchParams, output: URLSearchParams): void {
  const cursor = source.get("cursor");
  if (cursor !== null) {
    if (cursor.length < 1 || cursor.length > 2048) invalid("Cursor");
    output.set("cursor", cursor);
  }
  const limit = source.get("limit");
  if (limit !== null) {
    if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) invalid("Limit");
    output.set("limit", limit);
  }
  copyText(source, output, "q", 100);
}

function copyInstant(
  source: URLSearchParams,
  output: URLSearchParams,
  name: string,
  required: boolean,
): void {
  const value = source.get(name);
  if (value === null) {
    if (required) invalid(name);
    return;
  }
  if (!INSTANT_PATTERN.test(value) || Number.isNaN(Date.parse(value))) invalid(name);
  output.set(name, value);
}

function copyEnum(
  source: URLSearchParams,
  output: URLSearchParams,
  name: string,
  allowed: ReadonlySet<string>,
): void {
  const value = source.get(name);
  if (value === null) return;
  if (!allowed.has(value)) invalid(name);
  output.set(name, value);
}

function copyText(
  source: URLSearchParams,
  output: URLSearchParams,
  name: string,
  max: number,
): void {
  const value = source.get(name)?.trim();
  if (value === undefined || value.length === 0) return;
  if (value.length > max) invalid(name);
  output.set(name, value);
}

function invalid(name: string): never {
  throw new BffAuthError(`${name} is invalid`, 400, "invalid_request");
}
