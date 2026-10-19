import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authErrorResponse, BffAuthError, proxyAuthenticatedApi } from "./bff";

const APPOINTMENT_SCOPES = new Set(["ALL", "TODAY", "UPCOMING", "COMPLETED", "UNSUCCESSFUL"]);
const LIST_PARAMETERS = new Set(["cursor", "dayFrom", "dayTo", "limit", "patientId", "q", "scope"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function proxyAppointmentList(
  request: NextRequest,
  owner: "patient" | "provider",
): Promise<NextResponse> | NextResponse {
  try {
    return proxyAuthenticatedApi(request, appointmentListPath(request.nextUrl, owner), "GET");
  } catch (error) {
    return authErrorResponse(error);
  }
}

export function proxyPatientPaymentList(
  request: NextRequest,
): Promise<NextResponse> | NextResponse {
  try {
    const output = new URLSearchParams();
    for (const key of request.nextUrl.searchParams.keys()) {
      if (key !== "cursor" && key !== "limit") {
        throw new BffAuthError("Payment query is invalid", 400, "invalid_request");
      }
    }
    copyOptionalCursor(request.nextUrl.searchParams, output);
    copyOptionalLimit(request.nextUrl.searchParams, output);
    const query = output.toString();
    return proxyAuthenticatedApi(
      request,
      `/v1/patient/payments${query.length === 0 ? "" : `?${query}`}`,
      "GET",
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export function appointmentListPath(url: URL, owner: "patient" | "provider"): string {
  const output = new URLSearchParams();
  for (const key of url.searchParams.keys()) {
    if (
      !LIST_PARAMETERS.has(key) ||
      (owner === "patient" && (key === "q" || key === "patientId"))
    ) {
      throw new BffAuthError("Appointment query is invalid", 400, "invalid_request");
    }
  }
  copyRequiredScope(url.searchParams, output);
  copyOptionalCursor(url.searchParams, output);
  copyOptionalLimit(url.searchParams, output);
  copyOptionalInstant(url.searchParams, output, "dayFrom");
  copyOptionalInstant(url.searchParams, output, "dayTo");
  if (owner === "provider") {
    copyOptionalQuery(url.searchParams, output);
    copyOptionalPatientId(url.searchParams, output);
  }
  return `/v1/${owner}/appointments?${output.toString()}`;
}

function copyOptionalPatientId(input: URLSearchParams, output: URLSearchParams) {
  const patientId = input.get("patientId");
  if (patientId === null) return;
  if (exactAppointmentUuid(patientId) === null) {
    throw new BffAuthError("Patient ID is invalid", 400, "invalid_request");
  }
  output.set("patientId", patientId);
}

export function exactAppointmentUuid(value: string): string | null {
  return UUID_PATTERN.test(value) ? value : null;
}

export function proxyProviderAppointment(
  request: NextRequest,
  appointmentId: string,
): Promise<NextResponse> | NextResponse {
  if (exactAppointmentUuid(appointmentId) === null) {
    return authErrorResponse(new BffAuthError("Appointment ID is invalid", 400, "invalid_request"));
  }
  return proxyAuthenticatedApi(
    request,
    `/v1/provider/appointments/${encodeURIComponent(appointmentId)}`,
    "GET",
  );
}

function copyRequiredScope(input: URLSearchParams, output: URLSearchParams) {
  const scope = input.get("scope");
  if (scope === null || !APPOINTMENT_SCOPES.has(scope)) {
    throw new BffAuthError("Appointment scope is invalid", 400, "invalid_request");
  }
  output.set("scope", scope);
}

function copyOptionalCursor(input: URLSearchParams, output: URLSearchParams) {
  const cursor = input.get("cursor");
  if (cursor === null) return;
  if (cursor.length < 1 || cursor.length > 1024) {
    throw new BffAuthError("Cursor is invalid", 400, "invalid_request");
  }
  output.set("cursor", cursor);
}

function copyOptionalLimit(input: URLSearchParams, output: URLSearchParams) {
  const limit = input.get("limit");
  if (limit === null) return;
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) {
    throw new BffAuthError("Limit is invalid", 400, "invalid_request");
  }
  output.set("limit", limit);
}

function copyOptionalInstant(
  input: URLSearchParams,
  output: URLSearchParams,
  key: "dayFrom" | "dayTo",
) {
  const value = input.get(key);
  if (value === null) return;
  if (value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new BffAuthError(`${key} is invalid`, 400, "invalid_request");
  }
  output.set(key, value);
}

function copyOptionalQuery(input: URLSearchParams, output: URLSearchParams) {
  const value = input.get("q");
  if (value === null) return;
  const query = value.trim();
  if (query.length < 2 || query.length > 100) {
    throw new BffAuthError("Search query is invalid", 400, "invalid_request");
  }
  output.set("q", query);
}
