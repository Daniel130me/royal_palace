import type {
  ApplicationDocumentIntentResponse,
  ApplicationNoteVisibility,
  OnboardingApplicationData,
  OnboardingApplicationDetail,
  OnboardingApplicationKind,
  OnboardingApplicationListResponse,
  OnboardingApplicationStatus,
} from "@royal-palace/contracts";

export interface StoredOnboardingApplication extends OnboardingApplicationDetail {
  applicantPrincipalId: string;
}

export interface ApplicationListCursor {
  createdAt: string;
  id: string;
}

export interface ListApplicationsQuery {
  applicantPrincipalId?: string;
  cursor?: ApplicationListCursor;
  kind?: OnboardingApplicationKind;
  limit: number;
  status?: OnboardingApplicationStatus;
  statuses?: readonly OnboardingApplicationStatus[];
}

export interface TransitionApplicationInput {
  actorPrincipalId: string;
  applicationId: string;
  correlationId?: string;
  expectedStatus: OnboardingApplicationStatus;
  expectedVersion: number;
  note?: string;
  noteVisibility: ApplicationNoteVisibility;
  reasonCategory: string;
  requestId: string;
  toStatus: OnboardingApplicationStatus;
}

export interface ReserveApplicationDocumentInput {
  applicationId: string;
  declaredContentType: string;
  declaredSha256: string;
  declaredSizeBytes: number;
  originalFilename: string;
  purpose: string;
  uploadExpiresAt: Date;
}

export interface StoredApplicationDocument {
  applicationId: string;
  cleanObjectKey: string | null;
  cleanVersionId: string | null;
  declaredContentType: string;
  declaredSha256: string;
  declaredSizeBytes: number;
  id: string;
  status: "AWAITING_UPLOAD" | "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED" | "SCAN_FAILED";
  storageObjectKey: string | null;
  uploadExpiresAt: Date | null;
}

export interface OnboardingRepository {
  createApplication(input: {
    applicantPrincipalId: string;
    correlationId?: string;
    data: OnboardingApplicationData;
    referral?: { linkId: string; managerProfileId: string };
    requestId: string;
  }): Promise<StoredOnboardingApplication>;
  findApplicationById(
    id: string,
    includeInternalHistory: boolean,
  ): Promise<StoredOnboardingApplication | null>;
  listApplications(query: ListApplicationsQuery): Promise<OnboardingApplicationListResponse>;
  reserveDocument(
    input: ReserveApplicationDocumentInput,
  ): Promise<{ document: ApplicationDocumentIntentResponse["document"]; storageObjectKey: string }>;
  findDocument(
    applicationId: string,
    documentId: string,
  ): Promise<StoredApplicationDocument | null>;
  quarantineDocument(input: {
    applicationId: string;
    documentId: string;
    versionId: string | null;
  }): Promise<boolean>;
  rejectDocument(input: {
    applicationId: string;
    documentId: string;
    reasonCode: string;
  }): Promise<void>;
  transitionApplication(input: TransitionApplicationInput): Promise<StoredOnboardingApplication>;
  updateApplication(input: {
    applicantPrincipalId: string;
    applicationId: string;
    data: OnboardingApplicationData;
    expectedVersion: number;
  }): Promise<StoredOnboardingApplication>;
}

export const ONBOARDING_REPOSITORY = Symbol("ONBOARDING_REPOSITORY");
