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

    // Manager payout settlement hook: when a manager payout is marked "paid"
    // (or "rejected") through this console, keep the earnings ledger in step
    // — allocated entries flip to the matching status and the manager is
    // notified. Rejected payouts release their allocations back to the
    // available balance. (Generic route keeps working for all other models.)
    if (collection === "payoutRequest" && typeof body.status === "string" && ["paid", "rejected"].includes(body.status)) {
      const payout = await db.payoutRequest.findUnique({
        where: { id },
        include: { allocatedEarnings: true },
      });
      if (payout && payout.entityType === "manager" && payout.managerId) {
        if (body.status === "paid") {
          await db.managerEarning.updateMany({
            where: { id: { in: payout.allocatedEarnings.map((e) => e.id) } },
            data: { status: "paid" },
          });
        } else {
          await db.managerEarning.updateMany({
            where: { id: { in: payout.allocatedEarnings.map((e) => e.id) } },
            data: { payoutRequestId: null },
          });
        }
        await db.notification.create({
          data: {
            id: `NTF-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
            recipientId: payout.managerId,
            recipientType: "manager",
            title: body.status === "paid" ? "Payout Paid" : "Payout Rejected",
            body:
              body.status === "paid"
                ? `Payout ${payout.payoutNumber} for ₦${payout.amountRequested.toLocaleString("en-NG")} has been paid.`
                : `Payout ${payout.payoutNumber} was rejected. The allocated earnings returned to your available balance.${body.adminNote ? ` Note: ${body.adminNote}` : ""}`,
            type: "manager",
            relatedId: payout.id,
            read: false,
          },
        });
      }
    }

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
