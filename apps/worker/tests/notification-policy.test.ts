import { NOTIFICATION_TEMPLATE } from "@royal-palace/contracts";
import { describe, expect, it } from "vitest";

import {
  MAX_NOTIFICATION_ATTEMPTS,
  notificationRetryDelayMs,
  NotificationTemplateError,
  renderNotification,
  syntheticProviderMessageId,
} from "../src/notification/notification-policy.js";
import { SyntheticNotificationProvider } from "../src/notification/notification-provider.js";

describe("notification policy", () => {
  it("renders purpose-specific content without embedding sensitive detail", () => {
    const email = renderNotification({
      channel: "EMAIL",
      locale: "en",
      templateKey: NOTIFICATION_TEMPLATE.APPLICATION_STATUS_UPDATED,
      templateVersion: 1,
      variables: { reference: "APP-1024" },
    });
    expect(email).toMatchObject({ subject: "Application updated", title: null });
    expect(email.body).toContain("APP-1024");
    expect(email.body).toContain("Sign in");
    expect(email.body).not.toMatch(/approved|rejected|diagnos|amount|patient/i);

    expect(
      renderNotification({
        channel: "SMS",
        locale: "en",
        templateKey: NOTIFICATION_TEMPLATE.SECURITY_ALERT,
        templateVersion: 1,
        variables: { reference: "SEC-100" },
      }),
    ).toMatchObject({ subject: null, title: null });
  });

  it("rejects unknown locales, versions, templates, and extra variables", () => {
    for (const input of [
      { locale: "fr", templateVersion: 1, variables: { reference: "APP-1" } },
      { locale: "en", templateVersion: 2, variables: { reference: "APP-1" } },
      { locale: "en", templateVersion: 1, variables: { reference: "APP-1", status: "APPROVED" } },
      { locale: "en", templateVersion: 1, variables: { reference: "unsafe value" } },
    ]) {
      expect(() =>
        renderNotification({
          channel: "PUSH",
          templateKey: NOTIFICATION_TEMPLATE.APPLICATION_STATUS_UPDATED,
          ...input,
        }),
      ).toThrow(NotificationTemplateError);
    }
  });

  it("bounds exponential retries and stops at the attempt cap", () => {
    expect(notificationRetryDelayMs(1, () => 0)).toBe(15_000);
    expect(notificationRetryDelayMs(2, () => 1)).toBe(60_000);
    expect(notificationRetryDelayMs(MAX_NOTIFICATION_ATTEMPTS, () => 0)).toBeNull();
  });

  it("uses a stable provider idempotency result for the same delivery", async () => {
    const provider = new SyntheticNotificationProvider();
    const input = {
      body: "Safe message",
      channel: "EMAIL" as const,
      deliveryId: "0199f323-6e1b-70af-8d8e-e4d2a65cf810",
      recipientPrincipalId: "0199f323-6e1b-70af-8d8e-e4d2a65cf811",
      subject: "Subject",
      title: null,
    };
    await expect(provider.send(input)).resolves.toEqual(await provider.send(input));
    expect((await provider.send(input)).providerMessageId).toBe(
      syntheticProviderMessageId(input.deliveryId),
    );
  });
});
