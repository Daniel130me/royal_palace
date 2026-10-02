import { createHash } from "node:crypto";
import {
  NOTIFICATION_TEMPLATE,
  type NotificationChannel,
  type NotificationTemplateKey,
} from "@royal-palace/contracts";

export const MAX_NOTIFICATION_ATTEMPTS = 8;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;

export type { NotificationChannel } from "@royal-palace/contracts";

export interface RenderedNotification {
  body: string;
  subject: string | null;
  title: string | null;
}

interface TemplateDefinition {
  render(reference: string): RenderedNotification;
}

const REFERENCE_PATTERN = /^[A-Z0-9-]{1,64}$/;

// External channels deliberately contain no clinical, financial, or decision detail.
// A recipient must sign in to the authenticated application to view protected content.
const ENGLISH_TEMPLATES: Readonly<Record<NotificationTemplateKey, TemplateDefinition>> = {
  [NOTIFICATION_TEMPLATE.APPLICATION_ACTION_REQUIRED]: {
    render: (reference) => ({
      body: `Action is required for application ${reference}. Sign in to view the secure update.`,
      subject: "Application action required",
      title: "Application action required",
    }),
  },
  [NOTIFICATION_TEMPLATE.APPLICATION_STATUS_UPDATED]: {
    render: (reference) => ({
      body: `Application ${reference} has an update. Sign in to view it securely.`,
      subject: "Application updated",
      title: "Application updated",
    }),
  },
  [NOTIFICATION_TEMPLATE.APPOINTMENT_STATUS_UPDATED]: {
    render: (reference) => ({
      body: `Appointment ${reference} has an update. Sign in to view it securely.`,
      subject: "Appointment updated",
      title: "Appointment updated",
    }),
  },
  [NOTIFICATION_TEMPLATE.PAYMENT_STATUS_UPDATED]: {
    render: (reference) => ({
      body: `Payment ${reference} has an update. Sign in to view it securely.`,
      subject: "Payment updated",
      title: "Payment updated",
    }),
  },
  [NOTIFICATION_TEMPLATE.SECURITY_ALERT]: {
    render: (reference) => ({
      body: `Security event ${reference} requires your attention. Sign in to review it securely.`,
      subject: "Security alert",
      title: "Security alert",
    }),
  },
};

const TEMPLATE_CATALOGUE: Readonly<Record<string, Readonly<Record<string, TemplateDefinition>>>> = {
  en: ENGLISH_TEMPLATES,
};

export class NotificationTemplateError extends Error {
  readonly code = "NOTIFICATION_TEMPLATE_INVALID";
}

export function renderNotification(input: {
  channel: NotificationChannel;
  locale: string;
  templateKey: string;
  templateVersion: number;
  variables: unknown;
}): RenderedNotification {
  if (input.templateVersion !== 1) throw new NotificationTemplateError();
  const variables = parseVariables(input.variables);
  const template = TEMPLATE_CATALOGUE[input.locale]?.[input.templateKey];
  if (template === undefined) throw new NotificationTemplateError();
  const rendered = template.render(variables.reference);
  if (input.channel === "SMS") return { body: rendered.body, subject: null, title: null };
  if (input.channel === "PUSH")
    return { body: rendered.body, subject: null, title: rendered.title };
  return { body: rendered.body, subject: rendered.subject, title: null };
}

export function notificationRetryDelayMs(
  attemptNumber: number,
  random: () => number = Math.random,
): number | null {
  if (attemptNumber >= MAX_NOTIFICATION_ATTEMPTS) return null;
  const ceiling = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptNumber - 1),
    MAX_RETRY_DELAY_MS,
  );
  return Math.floor(ceiling * (0.5 + Math.min(1, Math.max(0, random())) * 0.5));
}

export function syntheticProviderMessageId(deliveryId: string): string {
  return `synthetic-${createHash("sha256").update(deliveryId).digest("hex").slice(0, 32)}`;
}

function parseVariables(value: unknown): { reference: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new NotificationTemplateError();
  }
  const entries = Object.entries(value);
  if (entries.length !== 1 || entries[0]?.[0] !== "reference") {
    throw new NotificationTemplateError();
  }
  const reference = entries[0][1];
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) {
    throw new NotificationTemplateError();
  }
  return { reference };
}
