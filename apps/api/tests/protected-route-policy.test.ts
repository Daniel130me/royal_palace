import "reflect-metadata";

import { describe, expect, it } from "vitest";

import { AUTHORIZATION_POLICY } from "../src/authorization/domain/authorization.types.js";
import { AUTHORIZATION_POLICY_METADATA } from "../src/authorization/presentation/policy-protected.decorator.js";
import { InternalIdentityController } from "../src/identity/presentation/internal-identity.controller.js";
import { AdminLaboratoryReviewController } from "../src/laboratory/presentation/laboratory-review.controller.js";
import { PharmacyCommercialController } from "../src/pharmacy/presentation/pharmacy-commercial.controller.js";
import {
  PatientScannedPrescriptionController,
  PharmacyScannedPrescriptionController,
} from "../src/pharmacy/presentation/scanned-prescription.controller.js";

describe("protected route policy inventory", () => {
  it("maps administrative principal revocation to its named policy", () => {
    const handler = InternalIdentityController.prototype.revokePrincipalSessions;
    expect(Reflect.getMetadata(AUTHORIZATION_POLICY_METADATA, handler)).toBe(
      AUTHORIZATION_POLICY.REVOKE_PRINCIPAL_SESSIONS,
    );
  });

  it.each(["create", "complete", "list", "find", "download"] as const)(
    "maps scanned-prescription %s to the patient-owner policy",
    (handlerName) => {
      const handler = PatientScannedPrescriptionController.prototype[handlerName];
      expect(Reflect.getMetadata(AUTHORIZATION_POLICY_METADATA, handler)).toBe(
        AUTHORIZATION_POLICY.MANAGE_OWN_SCANNED_PRESCRIPTION,
      );
    },
  );

  it.each(["list", "find", "download", "transition"] as const)(
    "maps pharmacy scanned-prescription %s to its organization policy",
    (handlerName) => {
      const handler = PharmacyScannedPrescriptionController.prototype[handlerName];
      expect(Reflect.getMetadata(AUTHORIZATION_POLICY_METADATA, handler)).toBe(
        AUTHORIZATION_POLICY.MANAGE_PHARMACY_SCANNED_PRESCRIPTION,
      );
    },
  );

  it("protects scanned-prescription quote conversion with pharmacy quote policy", () => {
    const handler = PharmacyCommercialController.prototype.createScannedPrescriptionQuote;
    expect(Reflect.getMetadata(AUTHORIZATION_POLICY_METADATA, handler)).toBe(
      AUTHORIZATION_POLICY.MANAGE_PHARMACY_QUOTE,
    );
  });

  it.each(["list", "moderate"] as const)(
    "maps laboratory review moderation %s to its administrator-only policy",
    (handlerName) => {
      const handler = AdminLaboratoryReviewController.prototype[handlerName];
      expect(Reflect.getMetadata(AUTHORIZATION_POLICY_METADATA, handler)).toBe(
        AUTHORIZATION_POLICY.ADMINISTER_REVIEW_MODERATION,
      );
    },
  );
});
