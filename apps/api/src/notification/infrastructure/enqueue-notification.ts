import type { ApiServiceConfig } from "@royal-palace/config/environment";
import {
  NOTIFICATION_TEMPLATE,
  type NotificationCategory,
  type NotificationTemplateKey,
} from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { createOpaqueId } from "../../platform/identifiers.js";

const TEMPLATE_CATEGORY: Readonly<Record<NotificationTemplateKey, NotificationCategory>> = {
  [NOTIFICATION_TEMPLATE.APPLICATION_ACTION_REQUIRED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.APPLICATION_STATUS_UPDATED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.APPOINTMENT_STATUS_UPDATED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.PAYMENT_STATUS_UPDATED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.PRESCRIPTION_ACTION_REQUIRED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.PRESCRIPTION_STATUS_UPDATED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.SECURITY_ALERT]: "SECURITY",
};
const INITIAL_NOTIFICATION_LOCALE = "en";
const INITIAL_TEMPLATE_VERSION = 1;

/**
 * Adds a privacy-safe email intent in the caller's business transaction.
 * Protected environments deliberately create no intent until a real adapter is qualified;
 * this prevents old messages being released when delivery is enabled later.
 */
export async function enqueueEmailNotification(
  transaction: Prisma.TransactionClient,
  config: Pick<ApiServiceConfig, "notificationDelivery">,
  input: {
    deduplicationKey: string;
    recipientPrincipalId: string;
    reference: string;
    templateKey: NotificationTemplateKey;
  },
): Promise<void> {
  if (config.notificationDelivery.mode === "disabled") return;
  await transaction.notificationDelivery.create({
    data: {
      category: TEMPLATE_CATEGORY[input.templateKey],
      channel: "EMAIL",
      deduplicationKey: input.deduplicationKey,
      id: createOpaqueId(),
      locale: INITIAL_NOTIFICATION_LOCALE,
      recipientPrincipalId: input.recipientPrincipalId,
      templateKey: input.templateKey,
      templateVersion: INITIAL_TEMPLATE_VERSION,
      variables: { reference: input.reference },
    },
    select: { id: true },
  });
}
