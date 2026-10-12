import { timingSafeEqual } from "node:crypto";

export const SYNTHETIC_IDENTITY_ACCOUNTS = [
  {
    email: "patient-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Patient",
    label: "Patient reviewer",
    subject: "patient-reviewer",
  },
  {
    email: "provider-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Provider",
    label: "Healthcare specialist reviewer",
    subject: "provider-reviewer",
  },
  {
    email: "manager-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Manager",
    label: "Manager reviewer",
    subject: "manager-reviewer",
  },
  {
    email: "hospital-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Hospital",
    label: "Hospital reviewer",
    subject: "hospital-reviewer",
  },
  {
    email: "pharmacy-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Pharmacy",
    label: "Pharmacy reviewer",
    subject: "pharmacy-reviewer",
  },
  {
    email: "laboratory-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Laboratory",
    label: "Laboratory reviewer",
    subject: "laboratory-reviewer",
  },
  {
    email: "logistics-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Logistics",
    label: "Logistics reviewer",
    subject: "logistics-reviewer",
  },
  {
    email: "support-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Support",
    label: "Support reviewer",
    subject: "support-reviewer",
  },
  {
    email: "administrator-reviewer@synthetic.invalid",
    familyName: "Reviewer",
    givenName: "Administrator",
    label: "Administrator reviewer",
    subject: "administrator-reviewer",
  },
] as const;

export type SyntheticIdentityAccount = (typeof SYNTHETIC_IDENTITY_ACCOUNTS)[number];

export function findSyntheticAccount(identifier: string): SyntheticIdentityAccount | undefined {
  const normalized = identifier.trim().toLowerCase();
  return SYNTHETIC_IDENTITY_ACCOUNTS.find(
    (account) => account.email === normalized || account.subject === normalized,
  );
}

export function syntheticPasswordMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
