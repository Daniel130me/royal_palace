import type { PlatformRole } from "@royal-palace/contracts";
import { describe, expect, it } from "vitest";

import { authorizedView } from "../../src/lib/nav.js";
import type { Session, UserRole } from "../../src/types/index.js";

function session(role: UserRole, platformRole: PlatformRole): Session {
  return {
    memberships: [],
    platformRoles: [platformRole],
    profileId: "0199a18e-a400-7000-8000-000000000001",
    role,
    userId: "0199a18e-a400-7000-8000-000000000001",
  };
}

describe("authenticated landing navigation", () => {
  it.each([
    ["admin", "ADMINISTRATOR", "admin"],
    ["doctor", "PROVIDER", "provider"],
    ["patient", "PATIENT", "patient"],
    ["pharmacy", "ORGANIZATION_STAFF", "pharmacy"],
  ] as const)("routes a %s session to its authorized dashboard", (role, platformRole, portal) => {
    expect(
      authorizedView(session(role, platformRole), {
        page: "dashboard",
        params: {},
        portal: "account",
      }),
    ).toEqual({ page: "dashboard", params: {}, portal });
  });

  it("sends an unauthenticated account landing request to sign-in", () => {
    expect(
      authorizedView(null, { page: "dashboard", params: {}, portal: "account" }),
    ).toEqual({ page: "login", params: {}, portal: "login" });
  });

  it("preserves intentional public navigation for an authenticated session", () => {
    expect(
      authorizedView(session("patient", "PATIENT"), {
        page: "pharmacies",
        params: {},
        portal: "public",
      }),
    ).toEqual({ page: "pharmacies", params: {}, portal: "public" });
  });
});
