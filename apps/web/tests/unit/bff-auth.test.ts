import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import {
  CSRF_COOKIE,
  CSRF_HEADER,
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
});
