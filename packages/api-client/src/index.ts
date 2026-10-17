import createClient from "openapi-fetch";

import type { paths } from "./generated/public-discovery.js";
import type { paths as OnboardingPaths } from "./generated/onboarding.js";
import type { paths as ManagerPaths } from "./generated/manager.js";
import type { paths as SchedulingPaymentPaths } from "./generated/scheduling-payment.js";
import type { paths as NotificationPaths } from "./generated/notifications.js";
import type { paths as PrescriptionPaths } from "./generated/prescriptions.js";
import type { paths as LaboratoryPaths } from "./generated/laboratory.js";
import type { paths as ClinicalEncounterPaths } from "./generated/clinical-encounters.js";
import type { paths as OrganizationFinancePaths } from "./generated/organization-finance.js";
import type { paths as OrganizationTeamPaths } from "./generated/organization-team.js";
import type { paths as LogisticsPaths } from "./generated/logistics.js";
import type { paths as AdministrationPaths } from "./generated/administration.js";

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
export type {
  components as LaboratoryComponents,
  paths as LaboratoryPaths,
} from "./generated/laboratory.js";
export type {
  components as ClinicalEncounterComponents,
  paths as ClinicalEncounterPaths,
} from "./generated/clinical-encounters.js";
export type {
  components as OrganizationFinanceComponents,
  paths as OrganizationFinancePaths,
} from "./generated/organization-finance.js";
export type {
  components as OrganizationTeamComponents,
  paths as OrganizationTeamPaths,
} from "./generated/organization-team.js";
export type {
  components as LogisticsComponents,
  paths as LogisticsPaths,
} from "./generated/logistics.js";
export type {
  components as AdministrationComponents,
  paths as AdministrationPaths,
} from "./generated/administration.js";

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

export function createLaboratoryClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<LaboratoryPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createClinicalEncounterClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<ClinicalEncounterPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createOrganizationFinanceClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<OrganizationFinancePaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createOrganizationTeamClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<OrganizationTeamPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createLogisticsClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<LogisticsPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}

export function createAdministrationClient(options: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<AdministrationPaths>({
    baseUrl: options.baseUrl,
    credentials: "same-origin",
    fetch: options.fetch,
  });
}
