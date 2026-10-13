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
  [NOTIFICATION_TEMPLATE.PHARMACY_ORDER_ACTION_REQUIRED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.PHARMACY_ORDER_STATUS_UPDATED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.LABORATORY_RESULT_ACTION_REQUIRED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.LABORATORY_RESULT_PUBLISHED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.PRESCRIPTION_ACTION_REQUIRED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.PRESCRIPTION_STATUS_UPDATED]: "TRANSACTIONAL",
  [NOTIFICATION_TEMPLATE.SECURITY_ALERT]: "SECURITY",
};
const INITIAL_NOTIFICATION_LOCALE = "en";
const INITIAL_TEMPLATE_VERSION = 1;

type NotificationResourceReference =
  { resourceId: string; resourceType: string } | { resourceId?: never; resourceType?: never };

/**
 * Persists the authenticated inbox item in the caller's business transaction.
 * An external email intent is added only when a qualified adapter is enabled, preventing
 * historical inbox events from being released if delivery is enabled later.
 */
export async function enqueueEmailNotification(
  transaction: Prisma.TransactionClient,
  config: Pick<ApiServiceConfig, "notificationDelivery">,
  input: NotificationResourceReference & {
    deduplicationKey: string;
    recipientPrincipalId: string;
    reference: string;
    templateKey: NotificationTemplateKey;
  },
): Promise<{ deliveryId: string | null }> {
  const category = TEMPLATE_CATEGORY[input.templateKey];
  await transaction.notificationInboxItem.create({
    data: {
      category,
      deduplicationKey: `inbox:${input.deduplicationKey}`,
      id: createOpaqueId(),
      locale: INITIAL_NOTIFICATION_LOCALE,
      recipientPrincipalId: input.recipientPrincipalId,
      reference: input.reference,
      ...(input.resourceId === undefined
        ? {}
        : { resourceId: input.resourceId, resourceType: input.resourceType }),
      templateKey: input.templateKey,
    },
    select: { id: true },
  });
  if (config.notificationDelivery.mode === "disabled") return { deliveryId: null };
  const deliveryId = createOpaqueId();
  await transaction.notificationDelivery.create({
    data: {
      category,
      channel: "EMAIL",
      deduplicationKey: input.deduplicationKey,
      id: deliveryId,
      locale: INITIAL_NOTIFICATION_LOCALE,
      recipientPrincipalId: input.recipientPrincipalId,
      templateKey: input.templateKey,
      templateVersion: INITIAL_TEMPLATE_VERSION,
      variables: { reference: input.reference },
    },
    select: { id: true },
  });
  return { deliveryId };
}

/** Adds one shared, per-reader inbox item for members of an organization. */
export async function enqueueOrganizationInboxNotification(
  transaction: Prisma.TransactionClient,
  input: NotificationResourceReference & {
    deduplicationKey: string;
    organizationId: string;
    reference: string;
    templateKey: NotificationTemplateKey;
  },
): Promise<void> {
  await transaction.notificationInboxItem.create({
    data: {
      category: TEMPLATE_CATEGORY[input.templateKey],
      deduplicationKey: `inbox:${input.deduplicationKey}`,
      id: createOpaqueId(),
      locale: INITIAL_NOTIFICATION_LOCALE,
      recipientOrganizationId: input.organizationId,
      reference: input.reference,
      ...(input.resourceId === undefined
        ? {}
        : { resourceId: input.resourceId, resourceType: input.resourceType }),
      templateKey: input.templateKey,
    },
    select: { id: true },
  });
}
