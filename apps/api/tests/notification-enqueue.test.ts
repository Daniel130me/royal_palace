import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { Prisma } from "../src/generated/prisma/client.js";
import { describe, expect, it, vi } from "vitest";

import { enqueueEmailNotification } from "../src/notification/infrastructure/enqueue-notification.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function transaction(
  inboxCreate: ReturnType<typeof vi.fn>,
  deliveryCreate: ReturnType<typeof vi.fn>,
): Prisma.TransactionClient {
  return {
    notificationDelivery: { create: deliveryCreate },
    notificationInboxItem: { create: inboxCreate },
  } as unknown as Prisma.TransactionClient;
}

describe("enqueueEmailNotification", () => {
  it("creates an authenticated inbox item but no external work while adapters are disabled", async () => {
    const inboxCreate = vi.fn(async () => ({ id: createOpaqueId() }));
    const deliveryCreate = vi.fn();
    await enqueueEmailNotification(transaction(inboxCreate, deliveryCreate), testConfig, {
      deduplicationKey: "application:test:status:submitted:v1",
      recipientPrincipalId: createOpaqueId(),
      reference: "APPLICATION-TEST",
      templateKey: "APPLICATION_STATUS_UPDATED",
    });
    expect(inboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deduplicationKey: "inbox:application:test:status:submitted:v1",
        recipientPrincipalId: expect.any(String),
        templateKey: "APPLICATION_STATUS_UPDATED",
      }),
      select: { id: true },
    });
    expect(deliveryCreate).not.toHaveBeenCalled();
  });

  it("creates an English email intent without a destination or protected status detail", async () => {
    const inboxCreate = vi.fn(async () => ({ id: createOpaqueId() }));
    const deliveryCreate = vi.fn(async (_input: Prisma.NotificationDeliveryCreateArgs) => ({
      id: createOpaqueId(),
    }));
    await enqueueEmailNotification(
      transaction(inboxCreate, deliveryCreate),
      {
        ...testConfig,
        notificationDelivery: { mode: "synthetic" },
      } as ApiServiceConfig,
      {
        deduplicationKey: "application:test:status:approved:v2",
        recipientPrincipalId: createOpaqueId(),
        reference: "APPLICATION-TEST",
        templateKey: "APPLICATION_STATUS_UPDATED",
      },
    );
    expect(deliveryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "TRANSACTIONAL",
        channel: "EMAIL",
        locale: "en",
        templateVersion: 1,
        variables: { reference: "APPLICATION-TEST" },
      }),
      select: { id: true },
    });
    expect(deliveryCreate.mock.calls[0]?.[0]).not.toHaveProperty("data.destination");
  });
});
