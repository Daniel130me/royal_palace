// Server-side serialization: convert Prisma rows (which store JSON arrays as
// strings for SQLite) into the typed shapes the client expects.

import type {
  Patient,
  Provider,
  Prescription,
  LaboratoryRequest,
  LaboratoryBooking,
  Referral,
  ProviderApplication,
  EncounterDocumentation,
  ClinicalEncounter,
  Service,
  CarePlan,
  RecordAccessGrant,
  PharmacyOrder,
} from "@/types";

function parseArr<T = string>(v: unknown): T[] {
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseObj<T = Record<string, unknown>>(v: unknown): T {
  if (typeof v !== "string") return {} as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return {} as T;
  }
}

export function serializePatient(p: Record<string, unknown>): Patient {
  return {
    ...(p as unknown as Patient),
    allergies: parseArr(p.allergies),
    conditions: parseArr(p.conditions),
    medications: parseArr(p.medications),
  } as Patient;
}

export function serializeProvider(p: Record<string, unknown>): Provider {
  return {
    ...(p as unknown as Provider),
    qualifications: parseArr(p.qualifications),
    languages: parseArr(p.languages),
    consultationModes: parseArr(p.consultationModes),
  } as Provider;
}

export function serializeService(s: Record<string, unknown>): Service {
  return s as unknown as Service;
}

export function serializeEncounter(e: Record<string, unknown>): ClinicalEncounter {
  return {
    ...(e as unknown as ClinicalEncounter),
    documentation: parseObj<EncounterDocumentation>(e.documentation),
  } as ClinicalEncounter;
}

export function serializePrescription(p: Record<string, unknown>): Prescription {
  return p as unknown as Prescription;
}

export function serializeLabRequest(r: Record<string, unknown>): LaboratoryRequest {
  return {
    ...(r as unknown as LaboratoryRequest),
    tests: parseArr(r.tests),
  } as LaboratoryRequest;
}

export function serializeLabBooking(b: Record<string, unknown>): LaboratoryBooking {
  const out = { ...(b as unknown as LaboratoryBooking) };
  // Recursively serialize the nested request so its `tests` field is parsed
  // from its SQLite JSON-string form into a typed array.
  if (out.request && typeof out.request === "object") {
    out.request = serializeLabRequest(out.request as unknown as Record<string, unknown>);
  }
  return out;
}

export function serializeReferral(r: Record<string, unknown>): Referral {
  return {
    ...(r as unknown as Referral),
    attachments: parseArr(r.attachments),
  } as Referral;
}

export function serializeApplication(a: Record<string, unknown>): ProviderApplication {
  return {
    ...(a as unknown as ProviderApplication),
    documents: parseArr(a.documents),
    history: parseArr(a.history),
  } as ProviderApplication;
}

export function serializeCarePlan(c: Record<string, unknown>): CarePlan {
  return {
    ...(c as unknown as CarePlan),
    goals: parseArr(c.goals),
  } as CarePlan;
}

export function serializeAccessGrant(g: Record<string, unknown>): RecordAccessGrant {
  return {
    ...(g as unknown as RecordAccessGrant),
    informationShared: parseArr(g.informationShared),
  } as RecordAccessGrant;
}

export function serializePharmacyOrder(o: Record<string, unknown>): PharmacyOrder {
  return o as unknown as PharmacyOrder;
}

export { parseArr, parseObj };
