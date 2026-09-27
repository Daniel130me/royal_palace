// Server-side audit helper. Safe to call from any API route.

import { db } from "@/lib/db";
import { genId } from "@/lib/format";

export interface AuditInput {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({ data: { id: genId("AUD"), ...input } });
  } catch (e) {
    // Audit must never break the main operation.
    console.error("[audit] failed to write audit log", e);
  }
}

export async function notify(input: {
  recipientId: string;
  recipientType: string;
  title: string;
  body: string;
  type: string;
  relatedId?: string;
}): Promise<void> {
  try {
    await db.notification.create({
      data: { id: genId("NTF"), ...input, read: false },
    });
  } catch (e) {
    console.error("[notify] failed to create notification", e);
  }
}
