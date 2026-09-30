import type { OnboardingApplicationStatus } from "@royal-palace/contracts";

const ALLOWED_TRANSITIONS: Readonly<
  Record<OnboardingApplicationStatus, readonly OnboardingApplicationStatus[]>
> = {
  APPROVED: [],
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  MORE_INFORMATION_REQUIRED: ["SUBMITTED", "APPROVED", "REJECTED", "WITHDRAWN"],
  REJECTED: [],
  SUBMITTED: ["UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"],
  WITHDRAWN: [],
};

export class InvalidApplicationTransitionError extends Error {
  constructor(
    readonly from: OnboardingApplicationStatus,
    readonly to: OnboardingApplicationStatus,
  ) {
    super(`Application cannot transition from ${from} to ${to}`);
    this.name = "InvalidApplicationTransitionError";
  }
}

export function assertApplicationTransition(
  from: OnboardingApplicationStatus,
  to: OnboardingApplicationStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidApplicationTransitionError(from, to);
  }
}

export function isApplicantEditable(status: OnboardingApplicationStatus): boolean {
  return status === "DRAFT" || status === "MORE_INFORMATION_REQUIRED";
}

export function isTerminalApplicationStatus(status: OnboardingApplicationStatus): boolean {
  return status === "APPROVED" || status === "REJECTED" || status === "WITHDRAWN";
}
