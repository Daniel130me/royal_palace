import type { CurrentSession } from "@royal-palace/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationService } from "../src/authorization/application/authorization.service.js";
import {
  InvalidNotificationCursorError,
  NotificationInboxNotFoundError,
  NotificationInboxService,
  NotificationPreferenceConflictError,
} from "../src/notification/application/notification-inbox.service.js";
import type { NotificationInboxRepository } from "../src/notification/domain/notification-inbox.types.js";
import { createOpaqueId } from "../src/platform/identifiers.js";

const principalId = createOpaqueId();
const pharmacyId = createOpaqueId();
const actor: CurrentSession = {
  absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
  assuranceContext: "urn:royal-palace:aal2",
  authenticatedAt: new Date().toISOString(),
  authenticationMethods: ["pwd", "otp"],
  idleExpiresAt: "2099-01-01T00:00:00.000Z",
  memberships: [
    { organizationId: pharmacyId, organizationType: "PHARMACY", roles: ["ORGANIZATION_STAFF"] },
  ],
  principalId,
  roles: [],
  sessionId: createOpaqueId(),
};

describe("NotificationInboxService", () => {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const repository = {
    list: vi.fn(),
    listPreferences: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    updateMarketingPreference: vi.fn(),
  } as unknown as NotificationInboxRepository;
  const service = new NotificationInboxService(
    { authorize } as unknown as AuthorizationService,
    repository,
  );
  const context = { actor, requestId: "request-notification-001" };

  beforeEach(() => vi.clearAllMocks());

  it("derives personal and organization scope only from the authenticated session", async () => {
    vi.mocked(repository.list).mockResolvedValue({
      data: [],
      pageInfo: { endCursor: null, hasNextPage: false },
      unreadCount: 0,
    });

    await service.list(context, { limit: 25, unreadOnly: true });

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ policy: "VIEW_NOTIFICATION_INBOX" }),
    );
    expect(repository.list).toHaveBeenCalledWith({
      limit: 25,
      organizationIds: [pharmacyId],
      principalId,
      unreadOnly: true,
    });
  });

  it("rejects malformed cursors before repository access", async () => {
    await expect(
      service.list(context, { cursor: "not-a-cursor", limit: 25, unreadOnly: false }),
    ).rejects.toBeInstanceOf(InvalidNotificationCursorError);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("does not disclose notifications outside the derived recipient scope", async () => {
    vi.mocked(repository.markRead).mockResolvedValue(null);
    await expect(service.markRead(context, createOpaqueId())).rejects.toBeInstanceOf(
      NotificationInboxNotFoundError,
    );
  });

  it("surfaces concurrent marketing preference changes as conflicts", async () => {
    vi.mocked(repository.updateMarketingPreference).mockResolvedValue(null);
    await expect(
      service.updateMarketingPreference(context, { enabled: true, expectedVersion: 2 }),
    ).rejects.toBeInstanceOf(NotificationPreferenceConflictError);
  });
});
