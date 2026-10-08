import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  CSRF_COOKIE,
  CSRF_HEADER,
  authenticatedListPath,
  callAuthenticatedApi,
  readSessionId,
  requireCsrf,
  SESSION_COOKIE,
  setAuthenticatedCookies,
} from "../../src/lib/auth/bff.js";

describe("BFF authentication boundary", () => {
  it("stores an encrypted HttpOnly session reference and rejects tampering", () => {
    const response = NextResponse.json({ ok: true });
    setAuthenticatedCookies(response, "0199a18e-a400-7000-8000-000000000001", "csrf-token");
    const session = response.cookies.get(SESSION_COOKIE);

    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("lax");
    expect(session?.value).not.toContain("0199a18e-a400-7000-8000-000000000001");

    const validRequest = new NextRequest("http://127.0.0.1:3000/api/bff/auth/session", {
      headers: { cookie: `${SESSION_COOKIE}=${session?.value ?? ""}` },
    });
    expect(readSessionId(validRequest)).toBe("0199a18e-a400-7000-8000-000000000001");

    const encrypted = session?.value ?? "";
    const tamperPosition = Math.floor(encrypted.length / 2);
    const replacement = encrypted[tamperPosition] === "A" ? "B" : "A";
    const tampered = `${encrypted.slice(0, tamperPosition)}${replacement}${encrypted.slice(tamperPosition + 1)}`;
    const tamperedRequest = new NextRequest("http://127.0.0.1:3000/api/bff/auth/session", {
      headers: { cookie: `${SESSION_COOKIE}=${tampered}` },
    });
    expect(() => readSessionId(tamperedRequest)).toThrow("Session is invalid");
  });

  it("binds the server-held session reference into signed upstream requests", async () => {
    const sessionId = "0199a18e-a400-7000-8000-000000000001";
    const cookieResponse = NextResponse.json({ ok: true });
    setAuthenticatedCookies(cookieResponse, sessionId, "csrf-token");
    const encryptedSession = cookieResponse.cookies.get(SESSION_COOKIE)?.value ?? "";
    const request = new NextRequest("http://127.0.0.1:3000/api/applications", {
      headers: {
        cookie: `${SESSION_COOKIE}=${encryptedSession}`,
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], pageInfo: { endCursor: null, hasNextPage: false } }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await callAuthenticatedApi(request, "/v1/applications");

    const upstream = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(upstream?.headers).get("x-rp-session-reference")).toBe(sessionId);
    expect(new Headers(upstream?.headers).get("traceparent")).toBe(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    );
    expect(new Headers(upstream?.headers).get("x-rp-internal-signature")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    fetchMock.mockRestore();
  });

  it("requires both an exact origin and matching double-submit token", () => {
    const valid = new NextRequest("http://127.0.0.1:3000/api/bff/auth/logout", {
      headers: {
        cookie: `${CSRF_COOKIE}=csrf-token`,
        [CSRF_HEADER]: "csrf-token",
        origin: "http://127.0.0.1:3000",
      },
      method: "POST",
    });
    expect(() => requireCsrf(valid)).not.toThrow();

    const crossSite = new NextRequest("http://127.0.0.1:3000/api/bff/auth/logout", {
      headers: {
        cookie: `${CSRF_COOKIE}=csrf-token`,
        [CSRF_HEADER]: "csrf-token",
        origin: "https://attacker.invalid",
      },
      method: "POST",
    });
    expect(() => requireCsrf(crossSite)).toThrow("Request origin is not allowed");
  });

  it("copies only bounded pagination inputs to upstream list routes", () => {
    const request = new NextRequest(
      "http://127.0.0.1:3000/api/patient/prescriptions?cursor=opaque&limit=50&patientId=forged",
    );
    expect(authenticatedListPath(request, "/v1/patient/prescriptions")).toBe(
      "/v1/patient/prescriptions?cursor=opaque&limit=50",
    );
    expect(() =>
      authenticatedListPath(
        new NextRequest("http://127.0.0.1:3000/api/patient/prescriptions?limit=500"),
        "/v1/patient/prescriptions",
      ),
    ).toThrow("Limit is invalid");
  });

  it("forwards an explicitly scoped organization without trusting actor identifiers", async () => {
    const sessionId = "0199a18e-a400-7000-8000-000000000001";
    const organizationId = "0199a18e-a400-7000-8000-000000000902";
    const cookieResponse = NextResponse.json({ ok: true });
    setAuthenticatedCookies(cookieResponse, sessionId, "csrf-token");
    const encryptedSession = cookieResponse.cookies.get(SESSION_COOKIE)?.value ?? "";
    const request = new NextRequest("http://127.0.0.1:3000/api/pharmacy/orders", {
      headers: { cookie: `${SESSION_COOKIE}=${encryptedSession}` },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [], pageInfo: { endCursor: null, hasNextPage: false } }),
        ),
      );

    await callAuthenticatedApi(request, "/v1/pharmacy/orders", { organizationId });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-organization-id")).toBe(organizationId);
    expect(headers.get("x-rp-session-reference")).toBe(sessionId);
    fetchMock.mockRestore();
  });
});
