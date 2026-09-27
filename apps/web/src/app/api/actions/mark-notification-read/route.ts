// POST /api/actions/mark-notification-read
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { notificationId, allFor, recipientType } = await req.json();
  if (notificationId) {
    await db.notification.update({ where: { id: notificationId }, data: { read: true } });
  } else if (allFor) {
    await db.notification.updateMany({ where: { recipientId: allFor, recipientType }, data: { read: true } });
  }
  return NextResponse.json({ ok: true });
}
