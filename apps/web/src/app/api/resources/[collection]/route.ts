// GET /api/resources/[collection]?<filters>  -> list
// POST /api/resources/[collection]            -> create
//
// A lightweight generic REST layer over Prisma. Filters are passed as query
// params (e.g. ?patientId=PAT-001). Supports `include` for related models
// via a comma list (e.g. ?include=provider,patient).
//
// The client service layer calls these endpoints; the UI never talks to
// Prisma directly, so the backend can later be swapped for a production API.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  serializePatient,
  serializeProvider,
  serializeService,
  serializeEncounter,
  serializePrescription,
  serializeLabRequest,
  serializeLabBooking,
  serializeReferral,
  serializeApplication,
  serializeCarePlan,
  serializeAccessGrant,
  serializePharmacyOrder,
} from "@/lib/serialize";

const MODELS = [
  "user",
  "patient",
  "provider",
  "providerApplication",
  "pharmacy",
  "pharmacyProduct",
  "laboratory",
  "hospital",
  "hospitalService",
  "logisticsProvider",
  "service",
  "servicePrice",
  "appointment",
  "clinicalEncounter",
  "diagnosis",
  "prescription",
  "prescriptionItem",
  "laboratoryRequest",
  "laboratoryBooking",
  "laboratoryResult",
  "pharmacyOrder",
  "pharmacyOrderItem",
  "delivery",
  "referral",
  "recordAccessGrant",
  "consent",
  "payment",
  "settlement",
  "carePlan",
  "notification",
  "rating",
  "complaint",
  "auditLog",
  "payoutRequest",
  "uploadedPrescription",
] as const;

export { MODELS };

type ModelName = (typeof MODELS)[number];

const INCLUDES: Partial<Record<ModelName, Record<string, boolean>>> = {
  appointment: { patient: true, provider: true, encounter: true, payment: true },
  clinicalEncounter: { appointment: true, patient: true, provider: true, prescriptions: true, labRequests: true, referrals: true, diagnoses: true },
  prescription: { patient: true, provider: true, items: true, pharmacyOrders: true, pharmacy: true },
  laboratoryRequest: { patient: true, provider: true, booking: true, result: true },
  laboratoryBooking: { laboratory: true, patient: true, request: true },
  hospital: { services: true },
  laboratoryResult: { laboratory: true, patient: true },
  pharmacyOrder: { patient: true, pharmacy: true, prescription: true, items: true, delivery: true },
  pharmacyProduct: { pharmacy: true },
  delivery: { logisticsProvider: true, order: true },
  referral: { patient: true, sender: true, recipient: true },
  providerApplication: { provider: true },
  service: { prices: true },
  uploadedPrescription: { patient: true },
};

export { INCLUDES };

function isModel(name: string): name is ModelName {
  return (MODELS as readonly string[]).includes(name);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string }> }
) {
  const { collection } = await params;
  if (!isModel(collection)) {
    return NextResponse.json({ error: `Unknown collection: ${collection}` }, { status: 404 });
  }
  const url = new URL(req.url);
  const where: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "include" || key === "q" || key === "limit" || key === "sort") continue;
    // basic type coercion
    if (value === "true") where[key] = true;
    else if (value === "false") where[key] = false;
    else if (/^-?\d+$/.test(value)) where[key] = parseInt(value, 10);
    else where[key] = value;
  }
  // Public hospital discovery must never reveal pending/rejected facilities.
  if (collection === "hospital") where.verificationStatus = "approved";
  const include = INCLUDES[collection] ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const take = limitParam ? parseInt(limitParam, 10) : undefined;
  const sortParam = url.searchParams.get("sort"); // e.g. "createdAt:desc"
  let orderBy: Prisma.Args<typeof db.patient, "findMany">["orderBy"] | undefined;
  if (sortParam) {
    const [field, dir] = sortParam.split(":");
    orderBy = { [field]: dir === "asc" ? "asc" : "desc" };
  }

  // @ts-expect-error — dynamic model access across Prisma delegate
  const rows = await db[collection].findMany({ where, include, orderBy, take });
  return NextResponse.json({ data: serializeMany(collection, rows) });
}

// Apply JSON-string deserializers per collection so the typed client sees
// arrays/objects (not raw strings) for fields stored as JSON in SQLite.
function serializeMany(collection: string, rows: unknown[]): unknown[] {
  switch (collection) {
    case "patient":
      return rows.map((r) => serializePatient(r as Record<string, unknown>));
    case "provider":
      return rows.map((r) => serializeProvider(r as Record<string, unknown>));
    case "providerApplication":
      return rows.map((r) => serializeApplication(r as Record<string, unknown>));
    case "service":
      return rows.map((r) => serializeService(r as Record<string, unknown>));
    case "clinicalEncounter":
      return rows.map((r) => serializeEncounter(r as Record<string, unknown>));
    case "prescription":
      return rows.map((r) => serializePrescription(r as Record<string, unknown>));
    case "laboratoryRequest":
      return rows.map((r) => serializeLabRequest(r as Record<string, unknown>));
    case "laboratoryBooking":
      return rows.map((r) => serializeLabBooking(r as Record<string, unknown>));
    case "referral":
      return rows.map((r) => serializeReferral(r as Record<string, unknown>));
    case "carePlan":
      return rows.map((r) => serializeCarePlan(r as Record<string, unknown>));
    case "recordAccessGrant":
      return rows.map((r) => serializeAccessGrant(r as Record<string, unknown>));
    case "pharmacyOrder":
      return rows.map((r) => serializePharmacyOrder(r as Record<string, unknown>));
    default:
      return rows;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string }> }
) {
  const { collection } = await params;
  if (!isModel(collection)) {
    return NextResponse.json({ error: `Unknown collection: ${collection}` }, { status: 404 });
  }
  if (collection === "hospital" || collection === "hospitalService") {
    return NextResponse.json({ error: "Hospitals are created only through Admin-approved onboarding." }, { status: 403 });
  }
  const body = await req.json();
  const include = INCLUDES[collection] ?? undefined;
  try {
    // @ts-expect-error — dynamic model access
    const created = await db[collection].create({ data: body, include });
    return NextResponse.json({ data: serializeMany(collection, [created])[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
