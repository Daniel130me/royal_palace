// GET/PATCH/DELETE /api/resources/[collection]/[id]

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MODELS } from "../route";
import { INCLUDES } from "../route";
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

function serializeOne(collection: string, row: unknown): unknown {
  switch (collection) {
    case "patient":
      return serializePatient(row as Record<string, unknown>);
    case "provider":
      return serializeProvider(row as Record<string, unknown>);
    case "providerApplication":
      return serializeApplication(row as Record<string, unknown>);
    case "service":
      return serializeService(row as Record<string, unknown>);
    case "clinicalEncounter":
      return serializeEncounter(row as Record<string, unknown>);
    case "prescription":
      return serializePrescription(row as Record<string, unknown>);
    case "laboratoryRequest":
      return serializeLabRequest(row as Record<string, unknown>);
    case "laboratoryBooking":
      return serializeLabBooking(row as Record<string, unknown>);
    case "referral":
      return serializeReferral(row as Record<string, unknown>);
    case "carePlan":
      return serializeCarePlan(row as Record<string, unknown>);
    case "recordAccessGrant":
      return serializeAccessGrant(row as Record<string, unknown>);
    case "pharmacyOrder":
      return serializePharmacyOrder(row as Record<string, unknown>);
    default:
      return row;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const { collection, id } = await params;
  if (!(MODELS as readonly string[]).includes(collection)) {
    return NextResponse.json({ error: `Unknown collection: ${collection}` }, { status: 404 });
  }
  const include = INCLUDES[collection as keyof typeof INCLUDES] ?? undefined;
  try {
    const row = await (db as unknown as Record<string, { findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<unknown> }>)[collection].findUnique({ where: { id }, include });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: serializeOne(collection, row) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const { collection, id } = await params;
  if (!(MODELS as readonly string[]).includes(collection)) {
    return NextResponse.json({ error: `Unknown collection: ${collection}` }, { status: 404 });
  }
  const body = await req.json();
  const include = INCLUDES[collection as keyof typeof INCLUDES] ?? undefined;
  try {
    const updated = await (db as unknown as Record<string, { update: (args: { where: { id: string }; data: unknown; include?: unknown }) => Promise<unknown> }>)[collection].update({ where: { id }, data: body, include });
    return NextResponse.json({ data: serializeOne(collection, updated) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  const { collection, id } = await params;
  if (!(MODELS as readonly string[]).includes(collection)) {
    return NextResponse.json({ error: `Unknown collection: ${collection}` }, { status: 404 });
  }
  try {
    await (db as unknown as Record<string, { delete: (args: { where: { id: string } }) => Promise<unknown> }>)[collection].delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
