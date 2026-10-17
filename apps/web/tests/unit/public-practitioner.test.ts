import { describe, expect, it } from "vitest";

import {
  buildPractitionerDiscoveryQuery,
  createPractitionerAvailabilityRange,
  PRACTITIONER_AVAILABILITY_HORIZON_DAYS,
  PRACTITIONER_DISCOVERY_PAGE_SIZE,
  practitionerModeLabel,
} from "@/lib/public-practitioner";

describe("public practitioner helpers", () => {
  it("creates bounded discovery queries and omits inactive filters", () => {
    expect(
      buildPractitionerDiscoveryQuery({
        language: "",
        location: "Toronto",
        mode: "VIDEO",
        profession: "all",
        query: "cardiology",
        specialty: "cardiology",
      }),
    ).toEqual({
      language: undefined,
      limit: PRACTITIONER_DISCOVERY_PAGE_SIZE,
      location: "Toronto",
      mode: "VIDEO",
      profession: undefined,
      q: "cardiology",
      specialty: "cardiology",
    });
  });

  it("uses a fixed UTC horizon without mutating the caller's instant", () => {
    const now = new Date("2026-10-17T23:30:00.000Z");
    const original = now.toISOString();
    const range = createPractitionerAvailabilityRange(now);

    expect(range.from).toBe(original);
    expect(range.to).toBe("2026-11-16T23:30:00.000Z");
    expect(now.toISOString()).toBe(original);
    expect(PRACTITIONER_AVAILABILITY_HORIZON_DAYS).toBe(30);
  });

  it("presents contract consultation modes without regional assumptions", () => {
    expect(practitionerModeLabel("HOME_VISIT")).toBe("home visit");
  });
});
