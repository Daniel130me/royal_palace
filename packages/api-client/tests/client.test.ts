import { describe, expect, it, vi } from "vitest";

import { createPublicDiscoveryClient } from "../src/index.js";

describe("generated public discovery client", () => {
  it("serializes typed practitioner filters to the same-origin BFF", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], pageInfo: { endCursor: null, hasNextPage: false } }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const client = createPublicDiscoveryClient({ baseUrl: "https://example.invalid", fetch });

    const result = await client.GET("/api/public/practitioners", {
      params: { query: { country: "CA", specialty: "cardiology" } },
    });

    expect(result.error).toBeUndefined();
    const request = fetch.mock.calls[0]?.[0] as Request | undefined;
    expect(request).toBeInstanceOf(Request);
    expect(request?.url).toBe(
      "https://example.invalid/api/public/practitioners?country=CA&specialty=cardiology",
    );
  });
});
