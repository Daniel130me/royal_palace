// POST /api/actions/revoke-access
// Patient revokes a record-access grant.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { grantId, actorId } = await req.json();
  if (!grantId) return NextResponse.json({ error: "Missing grantId." }, { status: 400 });
  const grant = await db.recordAccessGrant.findUnique({ where: { id: grantId } });
  if (!grant) return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  const updated = await db.recordAccessGrant.update({ where: { id: grantId }, data: { status: "revoked" } });
  await audit({
    actorId: actorId ?? grant.patientId,
    actorRole: "patient",
    action: "patient_revoked_record_access",
    entityType: "record_access_grant",
    entityId: grantId,
    description: `Record access for ${grant.granteeName} revoked.`,
  });
  return NextResponse.json({ data: updated });
}
