import { createHash } from "node:crypto";

import type {
  OnboardingApplicationKind,
  OnboardingApplicationStatus,
} from "@royal-palace/contracts";
import { z } from "zod";

import type { ApplicationListCursor } from "../domain/onboarding-repository.types.js";

const cursorSchema = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    filterHash: z.string().regex(/^[0-9a-f]{64}$/),
    id: z.uuid(),
    version: z.literal(1),
  })
  .strict();

export class InvalidApplicationCursorError extends Error {
  constructor() {
    super("The application cursor is invalid or does not match the current filters");
    this.name = "InvalidApplicationCursorError";
  }
}

export interface ApplicationListFilters {
  applicantPrincipalId?: string;
  kind?: OnboardingApplicationKind;
  status?: OnboardingApplicationStatus;
  statuses?: readonly OnboardingApplicationStatus[];
}

export function applicationFilterHash(filters: ApplicationListFilters): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(filters)
            .filter(([, value]) => value !== undefined)
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
      ),
    )
    .digest("hex");
}

export function encodeApplicationCursor(cursor: ApplicationListCursor, filterHash: string): string {
  return Buffer.from(JSON.stringify({ ...cursor, filterHash, version: 1 }), "utf8").toString(
    "base64url",
  );
}

export function decodeApplicationCursor(
  value: string,
  expectedFilterHash: string,
): ApplicationListCursor {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error();
    const cursor = cursorSchema.parse(JSON.parse(decoded));
    if (cursor.filterHash !== expectedFilterHash) throw new Error();
    return { createdAt: cursor.createdAt, id: cursor.id };
  } catch {
    throw new InvalidApplicationCursorError();
  }
}
