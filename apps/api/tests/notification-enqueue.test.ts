import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type { Prisma } from "../src/generated/prisma/client.js";
import { describe, expect, it, vi } from "vitest";

import { enqueueEmailNotification } from "../src/notification/infrastructure/enqueue-notification.js";
import { createOpaqueId } from "../src/platform/identifiers.js";
import { testConfig } from "./test-config.js";

function transaction(create: ReturnType<typeof vi.fn>): Prisma.TransactionClient {
  return { notificationDelivery: { create } } as unknown as Prisma.TransactionClient;
}

describe("enqueueEmailNotification", () => {
  it("does not accumulate delivery work while adapters are disabled", async () => {
    const create = vi.fn();
    await enqueueEmailNotification(transaction(create), testConfig, {
      deduplicationKey: "application:test:status:submitted:v1",
      recipientPrincipalId: createOpaqueId(),
      reference: "APPLICATION-TEST",
      templateKey: "APPLICATION_STATUS_UPDATED",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an English email intent without a destination or protected status detail", async () => {
    const create = vi.fn(async (_input: Prisma.NotificationDeliveryCreateArgs) => ({
      id: createOpaqueId(),
    }));
    await enqueueEmailNotification(
      transaction(create),
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
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "TRANSACTIONAL",
        channel: "EMAIL",
        locale: "en",
        templateVersion: 1,
        variables: { reference: "APPLICATION-TEST" },
      }),
      select: { id: true },
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("data.destination");
  });
});
