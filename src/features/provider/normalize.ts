"use client";

// Defensive client-side normalization. The generic REST resource layer
// returns Prisma rows directly, so JSON-array / JSON-object fields stored
// as TEXT in SQLite arrive as strings. These helpers guarantee we always
// hand the UI typed values, regardless of the wire shape.

import type {
  ClinicalEncounter,
  EncounterDocumentation,
  HealthRecordItem,
  Patient,
  Prescription,
  Provider,
  LaboratoryRequest,
  LaboratoryResult,
  Referral,
  ProviderApplication,
  CarePlan,
  FileMeta,
} from "@/types";

function parseArr<T = string>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseObj<T = Record<string, unknown>>(v: unknown): T {
  if (v && typeof v === "object") return v as T;
  if (typeof v !== "string") return {} as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return {} as T;
  }
}

export function normalizeHealthItems(v: unknown): HealthRecordItem[] {
  return parseArr<HealthRecordItem>(v);
}

export function normalizePatient(p: unknown): Patient {
  const base = (p ?? {}) as Partial<Patient>;
  return {
    ...(base as Patient),
    allergies: normalizeHealthItems(base.allergies),
    conditions: normalizeHealthItems(base.conditions),
    medications: normalizeHealthItems(base.medications),
  };
}

export function normalizeProvider(p: unknown): Provider {
  const base = (p ?? {}) as Partial<Provider>;
  return {
    ...(base as Provider),
    qualifications: parseArr<string>(base.qualifications),
    languages: parseArr<string>(base.languages),
    consultationModes: parseArr<string>(base.consultationModes),
  };
}

export function normalizeDocumentation(d: unknown): EncounterDocumentation {
  const obj = parseObj<EncounterDocumentation>(d);
  return {
    ...obj,
    vitalSigns: obj.vitalSigns ?? {},
    attachments: Array.isArray(obj.attachments) ? (obj.attachments as FileMeta[]) : [],
  };
}

export function normalizeEncounter(e: unknown): ClinicalEncounter {
  const base = (e ?? {}) as Partial<ClinicalEncounter>;
  return {
    ...(base as ClinicalEncounter),
    documentation: normalizeDocumentation(base.documentation),
  };
}

export function normalizeAppointmentIntake(a: unknown): Record<string, unknown> {
  return parseObj<Record<string, unknown>>((a as { intakeForm?: unknown })?.intakeForm);
}

export function normalizePrescription(p: unknown): Prescription {
  return (p ?? {}) as Prescription;
}

export function normalizeLabRequest(r: unknown): LaboratoryRequest {
  const base = (r ?? {}) as Partial<LaboratoryRequest>;
  return {
    ...(base as LaboratoryRequest),
    tests: parseArr<string>(base.tests),
  };
}

export function normalizeLabResult(r: unknown): LaboratoryResult {
  return (r ?? {}) as LaboratoryResult;
}

export function normalizeReferral(r: unknown): Referral {
  const base = (r ?? {}) as Partial<Referral>;
  return {
    ...(base as Referral),
    attachments: parseArr<FileMeta>(base.attachments),
  };
}

export function normalizeApplication(a: unknown): ProviderApplication {
  const base = (a ?? {}) as Partial<ProviderApplication>;
  return {
    ...(base as ProviderApplication),
    documents: parseArr<FileMeta>(base.documents),
    history: parseArr<{ status: string; at: string; by: string; note?: string }>(base.history),
  };
}

export function normalizeCarePlan(c: unknown): CarePlan {
  const base = (c ?? {}) as Partial<CarePlan>;
  return {
    ...(base as CarePlan),
    goals: parseArr<string>(base.goals),
  };
}

export { parseArr, parseObj };

// Many domain types in types/index.ts omit the Prisma-managed `createdAt` /
// `updatedAt` timestamp fields. The API returns them, so this helper lets us
// access them safely without sprinkling casts across the UI.
export type WithTimestamps<T> = T & { createdAt?: string; updatedAt?: string };
