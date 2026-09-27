import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

type ProxyHandler = typeof import("../../src/proxy.js").proxy;

describe("web request correlation", () => {
  let proxy: ProxyHandler;

  beforeAll(async () => {
    vi.stubEnv("API_BASE_URL", "http://127.0.0.1:4000");
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("APP_VERSION", "test-version");
    vi.stubEnv("LOG_LEVEL", "info");
    ({ proxy } = await import("../../src/proxy.js"));
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
});
