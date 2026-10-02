import type { CurrentSession } from "@royal-palace/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationDeniedError,
  AuthorizationService,
} from "../src/authorization/application/authorization.service.js";
import { PolicyEngine } from "../src/authorization/domain/policy-engine.js";
import {
  NotificationAdministrationService,
  NotificationDeliveryDisabledError,
} from "../src/notification/application/notification-administration.service.js";
import type { NotificationAdministrationRepository } from "../src/notification/domain/notification-administration.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

const enabledConfig = {
  ...testConfig,
  notificationDelivery: { mode: "synthetic" as const },
};

function session(role: "ADMINISTRATOR" | "SUPPORT"): CurrentSession {
  return {
    absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
    assuranceContext: "urn:royal-palace:aal2",
    authenticatedAt: new Date().toISOString(),
    authenticationMethods: ["pwd", "otp"],
    idleExpiresAt: "2099-01-01T00:00:00.000Z",
    memberships: [],
    principalId: createOpaqueId(),
    roles: [role],
    sessionId: createOpaqueId(),
  };
}

describe("NotificationAdministrationService", () => {
  it("allows an audited administrator replay with an immutable reason", async () => {
    const replay = vi.fn<NotificationAdministrationRepository["replay"]>(async (input) => ({
      id: createOpaqueId(),
      replayOfId: input.deliveryId,
      status: "PENDING",
    }));
    const append = vi.fn(async () => undefined);
    const service = new NotificationAdministrationService(
      new AuthorizationService(new PolicyEngine(), { append }),
      { replay },
      enabledConfig,
    );
    const actor = session("ADMINISTRATOR");
    const deliveryId = createOpaqueId();

    await expect(
      service.replay({ actor, requestId: "request-1" }, deliveryId, "Provider issue resolved"),
    ).resolves.toMatchObject({ replayOfId: deliveryId, status: "PENDING" });
    expect(replay).toHaveBeenCalledWith({
      actorPrincipalId: actor.principalId,
      deliveryId,
      reason: "Provider issue resolved",
    });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: "ADMINISTER_NOTIFICATION_DELIVERY",
        resourceId: deliveryId,
        result: "SUCCEEDED",
      }),
    );
  });

  it("denies support before the replay repository is called", async () => {
    const replay = vi.fn<NotificationAdministrationRepository["replay"]>();
    const service = new NotificationAdministrationService(
      new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
      { replay },
      enabledConfig,
    );

    await expect(
      service.replay(
        { actor: session("SUPPORT"), requestId: "request-2" },
        createOpaqueId(),
        "Retry",
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(replay).not.toHaveBeenCalled();
  });

  it("does not enqueue an orphan replay while delivery is disabled", async () => {
    const replay = vi.fn<NotificationAdministrationRepository["replay"]>();
    const service = new NotificationAdministrationService(
      new AuthorizationService(new PolicyEngine(), { append: vi.fn(async () => undefined) }),
      { replay },
      testConfig,
    );

    await expect(
      service.replay(
        { actor: session("ADMINISTRATOR"), requestId: "request-3" },
        createOpaqueId(),
        "Retry",
      ),
    ).rejects.toBeInstanceOf(NotificationDeliveryDisabledError);
    expect(replay).not.toHaveBeenCalled();
  });
});
