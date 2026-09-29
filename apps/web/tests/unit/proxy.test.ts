import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

type ProxyModule = typeof import("../../src/proxy.js");

describe("web request correlation", () => {
  let proxy: ProxyModule["proxy"];
  let isApiRouteEnabled: ProxyModule["isApiRouteEnabled"];

  beforeAll(async () => {
    vi.stubEnv("API_BASE_URL", "http://127.0.0.1:4000");
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("APP_VERSION", "test-version");
    vi.stubEnv("BFF_ACTIVE_COOKIE_KEY_ID", "test-key-1");
    vi.stubEnv(
      "BFF_COOKIE_ENCRYPTION_KEYS",
      JSON.stringify({ "test-key-1": Buffer.alloc(32, 1).toString("base64") }),
    );
    vi.stubEnv("BFF_INTERNAL_SECRET", Buffer.alloc(32, 2).toString("base64"));
    vi.stubEnv("BFF_API_TIMEOUT_MS", "5000");
    vi.stubEnv("LOG_LEVEL", "info");
    vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
    ({ isApiRouteEnabled, proxy } = await import("../../src/proxy.js"));
  });

  it("propagates safe correlation headers without logging query values", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new NextRequest("http://localhost/private?token=must-not-be-logged", {
      headers: {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "x-request-id": "web-request-123",
      },
    });

    const response = proxy(request);

    expect(response.headers.get("x-request-id")).toBe("web-request-123");
    expect(response.headers.get("traceparent")).toMatch(
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/,
    );
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain('"path":"/private"');
    expect(log.mock.calls[0]?.[0]).not.toContain("must-not-be-logged");

    log.mockRestore();
  });

  it("rejects state-changing API calls without same-origin CSRF proof", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/actions/example", {
      headers: { origin: "https://attacker.invalid" },
      method: "POST",
    });

    const response = proxy(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("fails closed for unmigrated prototype APIs in protected environments", () => {
    expect(isApiRouteEnabled("production", "/api/actions/book-appointment")).toBe(false);
    expect(isApiRouteEnabled("staging", "/api/resources/users")).toBe(false);
    expect(isApiRouteEnabled("production", "/api/bff/auth/session")).toBe(true);
    expect(isApiRouteEnabled("production", "/api/public/hospitals")).toBe(true);
    expect(isApiRouteEnabled("production", "/api/public/pharmacies")).toBe(true);
    expect(isApiRouteEnabled("production", "/api/public/laboratories")).toBe(true);
    expect(
      isApiRouteEnabled("production", "/api/public/hospitals/0199a18e-a400-7000-8000-000000000201"),
    ).toBe(true);
    expect(isApiRouteEnabled("production", "/api/public/hospitals/not-a-uuid")).toBe(false);
    expect(isApiRouteEnabled("test", "/api/actions/book-appointment")).toBe(true);
    expect(isApiRouteEnabled("production", "/patient/dashboard")).toBe(true);
  });
});
