import type { NextRequest } from "next/server";

import { authErrorResponse, BffAuthError, proxyAuthenticatedApi } from "./bff";

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const APPOINTMENT_SCOPES = new Set(["ALL", "TODAY", "UPCOMING", "COMPLETED", "UNSUCCESSFUL"]);
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

export function proxyAdminAppointmentList(request: NextRequest) {
  return proxyValidated(request, "/v1/admin/appointments", (source, output) => {
    copyInstant(source, output, "dayFrom", true);
    copyInstant(source, output, "dayTo", true);
    copyEnum(source, output, "scope", APPOINTMENT_SCOPES);
    copyCommon(source, output);
  });
}

export function proxyAdminAuditList(request: NextRequest) {
  return proxyValidated(request, "/v1/admin/audit-events", (source, output) => {
    copyInstant(source, output, "from", false);
    copyInstant(source, output, "to", false);
    copyEnum(source, output, "effectiveRole", PLATFORM_ROLES);
    copyText(source, output, "action", 160);
    copyCommon(source, output);
  });
}

function proxyValidated(
  request: NextRequest,
  apiPath: string,
  build: (source: URLSearchParams, output: URLSearchParams) => void,
) {
  try {
    const output = new URLSearchParams();
    build(request.nextUrl.searchParams, output);
    return proxyAuthenticatedApi(request, `${apiPath}?${output.toString()}`, "GET");
  } catch (error) {
    return authErrorResponse(error);
  }
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
