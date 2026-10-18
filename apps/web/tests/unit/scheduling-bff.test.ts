import { describe, expect, it } from "vitest";

import { appointmentListPath, exactAppointmentUuid } from "../../src/lib/auth/scheduling-bff.js";

describe("scheduling BFF validation", () => {
  it("forwards only bounded appointment-list parameters", () => {
    const path = appointmentListPath(
      new URL(
        "http://local/api/provider/appointments?scope=TODAY&limit=25&dayFrom=2026-10-18T00%3A00%3A00.000Z&dayTo=2026-10-19T00%3A00%3A00.000Z&q=Ada",
      ),
      "provider",
    );
    expect(path).toContain("/v1/provider/appointments?");
    expect(path).toContain("scope=TODAY");
    expect(path).toContain("q=Ada");
  });

  it("rejects unknown parameters and patient-side search", () => {
    expect(() =>
      appointmentListPath(new URL("http://local/?scope=ALL&ownerId=other"), "patient"),
    ).toThrow();
    expect(() =>
      appointmentListPath(new URL("http://local/?scope=ALL&q=Ada"), "patient"),
    ).toThrow();
  });

  it("accepts only exact UUID appointment identifiers", () => {
    const id = "0199a18e-a400-7000-8000-000000000203";
    expect(exactAppointmentUuid(id)).toBe(id);
    expect(exactAppointmentUuid(`${id}/clinical-record`)).toBeNull();
    expect(exactAppointmentUuid("../admin")).toBeNull();
  });
});
