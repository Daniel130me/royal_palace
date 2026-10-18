import { createHash } from "node:crypto";

import { z } from "zod";

import type { AppointmentListCursor } from "../domain/scheduling-payment.types.js";

const cursorSchema = z
  .object({
    filterHash: z.string().length(64),
    id: z.uuid(),
    startsAt: z.iso.datetime(),
    version: z.literal(1),
  })
  .strict();

export class InvalidAppointmentListCursorError extends Error {
  constructor() {
    super("The pagination cursor is invalid for this appointment query");
    this.name = "InvalidAppointmentListCursorError";
  }
}

export function appointmentListFilterHash(filters: unknown): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

export function decodeAppointmentListCursor(
  encoded: string | undefined,
  expectedFilterHash: string,
): AppointmentListCursor | undefined {
  if (encoded === undefined) return undefined;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (parsed.filterHash !== expectedFilterHash) throw new InvalidAppointmentListCursorError();
    return { id: parsed.id, startsAt: new Date(parsed.startsAt) };
  } catch (error) {
    if (error instanceof InvalidAppointmentListCursorError) throw error;
    throw new InvalidAppointmentListCursorError();
  }
}

export function encodeAppointmentListCursor(
  cursor: AppointmentListCursor,
  filterHash: string,
): string {
  return Buffer.from(
    JSON.stringify({
      filterHash,
      id: cursor.id,
      startsAt: cursor.startsAt.toISOString(),
      version: 1,
    }),
  ).toString("base64url");
}
