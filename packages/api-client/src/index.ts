import createClient from "openapi-fetch";

import type { paths } from "./generated/public-discovery.js";
import type { paths as OnboardingPaths } from "./generated/onboarding.js";
import type { paths as ManagerPaths } from "./generated/manager.js";
import type { paths as SchedulingPaymentPaths } from "./generated/scheduling-payment.js";
import type { paths as NotificationPaths } from "./generated/notifications.js";
import type { paths as PrescriptionPaths } from "./generated/prescriptions.js";

export type { components, paths } from "./generated/public-discovery.js";
export type {
  components as OnboardingComponents,
  paths as OnboardingPaths,
} from "./generated/onboarding.js";
export type {
  components as ManagerComponents,
  paths as ManagerPaths,
} from "./generated/manager.js";
export type {
  components as SchedulingPaymentComponents,
  paths as SchedulingPaymentPaths,
} from "./generated/scheduling-payment.js";
export type {
  components as NotificationComponents,
  paths as NotificationPaths,
} from "./generated/notifications.js";
export type {
  components as PrescriptionComponents,
  paths as PrescriptionPaths,
} from "./generated/prescriptions.js";

export function createPublicDiscoveryClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createOnboardingClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<OnboardingPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createManagerClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<ManagerPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createSchedulingPaymentClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<SchedulingPaymentPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createNotificationClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<NotificationPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createPrescriptionClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<PrescriptionPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}
