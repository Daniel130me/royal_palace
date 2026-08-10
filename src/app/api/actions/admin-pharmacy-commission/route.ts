// POST /api/actions/admin-pharmacy-commission
// Admin updates a pharmacy's commission percentage.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { pharmacyId, percentage, actorId } = await req.json();
  if (!pharmacyId || percentage == null) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  const pharmacy = await db.pharmacy.findUnique({ where: { id: pharmacyId } });
  if (!pharmacy) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
  const updated = await db.pharmacy.update({ where: { id: pharmacyId }, data: { commissionPct: Number(percentage) } });
  await audit({
    actorId: actorId ?? "ADM-001",
    actorRole: "admin",
    action: "admin_updated_pharmacy_commission",
    entityType: "pharmacy",
    entityId: pharmacyId,
    description: `Commission for ${pharmacy.name} set to ${percentage}%.`,
  });
  return NextResponse.json({ data: updated });
}
