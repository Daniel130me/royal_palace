import { createHash } from "node:crypto";

import { z } from "zod";

import type { PaymentListCursor } from "../domain/scheduling-payment.types.js";

const cursorSchema = z
  .object({
    createdAt: z.iso.datetime(),
    filterHash: z.string().length(64),
    id: z.uuid(),
    version: z.literal(1),
  })
  .strict();

export class InvalidPaymentListCursorError extends Error {
  constructor() {
    super("The pagination cursor is invalid for this payment query");
    this.name = "InvalidPaymentListCursorError";
  }
}

export function paymentListFilterHash(filters: unknown): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

export function decodePaymentListCursor(
  encoded: string | undefined,
  expectedFilterHash: string,
): PaymentListCursor | undefined {
  if (encoded === undefined) return undefined;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (parsed.filterHash !== expectedFilterHash) throw new InvalidPaymentListCursorError();
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch (error) {
    if (error instanceof InvalidPaymentListCursorError) throw error;
    throw new InvalidPaymentListCursorError();
  }
}

export function encodePaymentListCursor(cursor: PaymentListCursor, filterHash: string): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      filterHash,
      id: cursor.id,
      version: 1,
    }),
  ).toString("base64url");
}
