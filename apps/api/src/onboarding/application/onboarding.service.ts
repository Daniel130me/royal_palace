import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  ApplicationDocumentDownloadResponse,
  ApplicationDocumentIntentResponse,
  CurrentSession,
  OnboardingApplicationData,
  OnboardingApplicationDetail,
  OnboardingApplicationKind,
  OnboardingApplicationListResponse,
  OnboardingApplicationStatus,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { ReferralClaimService } from "../../manager/application/referral-claim.service.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import {
  assertApplicationTransition,
  isApplicantEditable,
} from "../domain/application-state-machine.js";
import { validateDocumentDeclaration } from "../domain/document-policy.js";
import { DOCUMENT_STORAGE, type DocumentStorage } from "../domain/document-storage.port.js";
import {
  ONBOARDING_REPOSITORY,
  type OnboardingRepository,
  type StoredOnboardingApplication,
} from "../domain/onboarding-repository.types.js";

import {
  applicationFilterHash,
  decodeApplicationCursor,
  encodeApplicationCursor,
} from "./application-cursor.js";

const DEFAULT_PAGE_SIZE = 20;
export const MAX_APPLICATION_PAGE_SIZE = 50;
const ACTIONABLE_REVIEW_STATUSES: readonly OnboardingApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
];

export class OnboardingFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OnboardingFlowError";
  }
}

interface RequestContext {
  actor: CurrentSession;
  correlationId?: string;
  requestId: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(ONBOARDING_REPOSITORY) private readonly repository: OnboardingRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(ReferralClaimService) private readonly referrals: ReferralClaimService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async createApplication(
    context: RequestContext,
    data: OnboardingApplicationData,
    referralToken?: string,
  ): Promise<OnboardingApplicationDetail> {
    await this.authorizeOwner(context, "new", context.actor.principalId);
    const referral =
      referralToken === undefined ? undefined : await this.referrals.resolve(referralToken, data);
    return this.repository.createApplication({
      applicantPrincipalId: context.actor.principalId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      data,
      ...(referral === undefined ? {} : { referral }),
      requestId: context.requestId,
    });
  }

  async getOwnApplication(
    context: RequestContext,
    applicationId: string,
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, false);
    await this.authorizeOwner(context, application.id, application.applicantPrincipalId);
    return withoutRepositoryFields(application);
  }

  async listOwnApplications(
    context: RequestContext,
    input: ApplicationListInput,
  ): Promise<OnboardingApplicationListResponse> {
    await this.authorizeOwner(context, "own-application-list", context.actor.principalId);
    return this.list({ ...input, applicantPrincipalId: context.actor.principalId });
  }

  async updateOwnApplication(
    context: RequestContext,
    applicationId: string,
    expectedVersion: number,
    data: OnboardingApplicationData,
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, false);
    await this.authorizeOwner(context, application.id, application.applicantPrincipalId);
    if (application.kind !== data.kind || !isApplicantEditable(application.status)) {
      throw new OnboardingFlowError(
        "application_not_editable",
        409,
        "Application cannot be edited in its current state",
      );
    }
    return this.repository.updateApplication({
      applicantPrincipalId: context.actor.principalId,
      applicationId,
      data,
      expectedVersion,
    });
  }

  async reserveDocument(
    context: RequestContext,
    applicationId: string,
    input: {
      declaredContentType: string;
      declaredSha256: string;
      declaredSizeBytes: number;
      originalFilename: string;
      purpose: string;
    },
  ): Promise<ApplicationDocumentIntentResponse> {
    const application = await this.requireApplication(applicationId, false);
    await this.authorizeOwner(context, application.id, application.applicantPrincipalId);
    if (!isApplicantEditable(application.status)) {
      throw new OnboardingFlowError(
        "application_not_editable",
        409,
        "Documents cannot be added in the current state",
      );
    }
    validateDocumentDeclaration({ ...input, kind: application.kind });
    const expiresAt = new Date(Date.now() + this.config.objectStorage.uploadTtlSeconds * 1000);
    const reserved = await this.repository.reserveDocument({
      applicationId,
      ...input,
      uploadExpiresAt: expiresAt,
    });
    const signed = await this.storage.signUpload({
      contentType: input.declaredContentType,
      expiresInSeconds: this.config.objectStorage.uploadTtlSeconds,
      key: reserved.storageObjectKey,
      sha256Hex: input.declaredSha256,
    });
    return {
      document: reserved.document,
      upload: {
        expiresAt: expiresAt.toISOString(),
        headers: signed.headers,
        method: "PUT",
        url: signed.url,
      },
    };
  }

  async completeDocumentUpload(
    context: RequestContext,
    applicationId: string,
    documentId: string,
  ): Promise<{ status: "QUARANTINED" }> {
    const application = await this.requireApplication(applicationId, false);
    await this.authorizeOwner(context, application.id, application.applicantPrincipalId);
    const document = await this.repository.findDocument(applicationId, documentId);
    if (
      document === null ||
      document.status !== "AWAITING_UPLOAD" ||
      document.storageObjectKey === null ||
      document.uploadExpiresAt === null ||
      document.uploadExpiresAt.getTime() <= Date.now()
    ) {
      throw new OnboardingFlowError(
        "document_not_uploadable",
        409,
        "Document upload is unavailable",
      );
    }
    const evidence = await this.storage.inspectQuarantined(document.storageObjectKey);
    if (evidence === null) {
      throw new OnboardingFlowError(
        "document_upload_missing",
        409,
        "Document upload is incomplete",
      );
    }
    const expectedChecksum = Buffer.from(document.declaredSha256, "hex").toString("base64");
    if (
      evidence.checksumSha256 !== expectedChecksum ||
      evidence.sizeBytes !== document.declaredSizeBytes ||
      evidence.contentType !== document.declaredContentType ||
      ((this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
        evidence.versionId === null)
    ) {
      await this.repository.rejectDocument({
        applicationId,
        documentId,
        reasonCode: "UPLOAD_EVIDENCE_MISMATCH",
      });
      throw new OnboardingFlowError(
        "document_upload_invalid",
        409,
        "Document upload failed verification",
      );
    }
    const quarantined = await this.repository.quarantineDocument({
      applicationId,
      documentId,
      versionId: evidence.versionId,
    });
    if (!quarantined) {
      throw new OnboardingFlowError(
        "document_not_uploadable",
        409,
        "Document upload is unavailable",
      );
    }
    return { status: "QUARANTINED" };
  }

  async downloadDocument(
    context: RequestContext,
    applicationId: string,
    documentId: string,
    authority: "OWNER" | "REVIEW" | "DECIDE",
  ): Promise<ApplicationDocumentDownloadResponse> {
    const application = await this.requireApplication(applicationId, authority !== "OWNER");
    if (authority !== "OWNER" && application.status === "DRAFT") {
      throw new OnboardingFlowError("document_not_available", 404, "Document is unavailable");
    }
    if (authority === "OWNER") {
      await this.authorizeOwner(
        context,
        documentId,
        application.applicantPrincipalId,
        "application_document",
      );
    } else {
      await this.authorizeReview(
        context,
        { ...application, id: documentId },
        authority,
        "application_document",
      );
    }
    const document = await this.repository.findDocument(applicationId, documentId);
    if (
      document?.status !== "CLEAN" ||
      document.cleanObjectKey === null ||
      ((this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
        document.cleanVersionId === null)
    ) {
      throw new OnboardingFlowError("document_not_available", 404, "Document is unavailable");
    }
    const expiresAt = new Date(Date.now() + this.config.objectStorage.downloadTtlSeconds * 1000);
    const url = await this.storage.signCleanDownload({
      expiresInSeconds: this.config.objectStorage.downloadTtlSeconds,
      key: document.cleanObjectKey,
      versionId: document.cleanVersionId,
    });
    return { expiresAt: expiresAt.toISOString(), url };
  }

  async submitOwnApplication(
    context: RequestContext,
    applicationId: string,
    expectedVersion: number,
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, false);
    await this.authorizeOwner(context, application.id, application.applicantPrincipalId);
    assertApplicationTransition(application.status, "SUBMITTED");
    assertCompleteForSubmission(application.data);
    return this.repository.transitionApplication({
      actorPrincipalId: context.actor.principalId,
      applicationId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      expectedStatus: application.status,
      expectedVersion,
      noteVisibility: "APPLICANT",
      reasonCategory: "APPLICANT_SUBMITTED",
      requestId: context.requestId,
      toStatus: "SUBMITTED",
    });
  }

  async withdrawOwnApplication(
    context: RequestContext,
    applicationId: string,
    expectedVersion: number,
    note?: string,
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, false);
    await this.authorizeOwner(context, application.id, application.applicantPrincipalId);
    assertApplicationTransition(application.status, "WITHDRAWN");
    return this.repository.transitionApplication({
      actorPrincipalId: context.actor.principalId,
      applicationId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      expectedStatus: application.status,
      expectedVersion,
      note,
      noteVisibility: "APPLICANT",
      reasonCategory: "APPLICANT_WITHDREW",
      requestId: context.requestId,
      toStatus: "WITHDRAWN",
    });
  }

  async getForReview(
    context: RequestContext,
    applicationId: string,
    authority: "REVIEW" | "DECIDE",
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, true);
    await this.authorizeReview(context, application, authority);
    if (application.status === "DRAFT") {
      throw new OnboardingFlowError("application_not_found", 404, "Application was not found");
    }
    return withoutRepositoryFields(application);
  }

  async listForReview(
    context: RequestContext,
    authority: "REVIEW" | "DECIDE",
    input: ApplicationListInput,
  ): Promise<OnboardingApplicationListResponse> {
    const policy =
      authority === "DECIDE"
        ? AUTHORIZATION_POLICY.DECIDE_APPLICATION
        : AUTHORIZATION_POLICY.REVIEW_APPLICATION;
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        applicantPrincipalId: context.actor.principalId,
        resourceId: "application-review-queue",
        resourceType: "onboarding_application_queue",
      },
      policy,
      requestId: context.requestId,
    });
    if (input.status === "DRAFT") {
      throw new OnboardingFlowError(
        "draft_review_forbidden",
        400,
        "Draft applications are visible only to their applicants",
      );
    }
    return this.list({
      ...input,
      ...(input.status === undefined ? { statuses: ACTIONABLE_REVIEW_STATUSES } : {}),
    });
  }

  async startReview(
    context: RequestContext,
    applicationId: string,
    expectedVersion: number,
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, true);
    await this.authorizeReview(context, application, "REVIEW");
    if (application.status !== "SUBMITTED") {
      throw new OnboardingFlowError(
        "application_not_reviewable",
        409,
        "Only a submitted application can enter review",
      );
    }
    return this.repository.transitionApplication({
      actorPrincipalId: context.actor.principalId,
      applicationId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      expectedStatus: application.status,
      expectedVersion,
      noteVisibility: "INTERNAL",
      reasonCategory: "REVIEW_STARTED",
      requestId: context.requestId,
      toStatus: "UNDER_REVIEW",
    });
  }

  async decide(
    context: RequestContext,
    applicationId: string,
    input: {
      expectedVersion: number;
      note?: string;
      reasonCategory: string;
      toStatus: "APPROVED" | "MORE_INFORMATION_REQUIRED" | "REJECTED";
    },
  ): Promise<OnboardingApplicationDetail> {
    const application = await this.requireApplication(applicationId, true);
    await this.authorizeReview(context, application, "DECIDE");
    if (
      (input.toStatus === "APPROVED" || input.toStatus === "REJECTED") &&
      application.status === input.toStatus
    ) {
      return withoutRepositoryFields(application);
    }
    assertApplicationTransition(application.status, input.toStatus);
    if (input.toStatus !== "APPROVED" && input.note === undefined) {
      throw new OnboardingFlowError(
        "decision_note_required",
        400,
        "A clear applicant-facing note is required for this decision",
      );
    }
    return this.repository.transitionApplication({
      actorPrincipalId: context.actor.principalId,
      applicationId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      expectedStatus: application.status,
      expectedVersion: input.expectedVersion,
      note: input.note,
      noteVisibility: input.toStatus === "APPROVED" ? "INTERNAL" : "APPLICANT",
      reasonCategory: input.reasonCategory,
      requestId: context.requestId,
      toStatus: input.toStatus,
    });
  }

  private async list(input: ApplicationListInput): Promise<OnboardingApplicationListResponse> {
    const filters = {
      applicantPrincipalId: input.applicantPrincipalId,
      kind: input.kind,
      status: input.status,
      statuses: input.status === undefined ? input.statuses : undefined,
    };
    const filterHash = applicationFilterHash(filters);
    const cursor =
      input.cursor === undefined ? undefined : decodeApplicationCursor(input.cursor, filterHash);
    const response = await this.repository.listApplications({
      ...filters,
      ...(cursor === undefined ? {} : { cursor }),
      limit: Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_APPLICATION_PAGE_SIZE),
    });
    const last = response.data.at(-1);
    return {
      ...response,
      pageInfo: {
        ...response.pageInfo,
        endCursor:
          response.pageInfo.hasNextPage && last !== undefined
            ? encodeApplicationCursor({ createdAt: last.createdAt, id: last.id }, filterHash)
            : null,
      },
    };
  }

  private async requireApplication(
    applicationId: string,
    includeInternalHistory: boolean,
  ): Promise<StoredOnboardingApplication> {
    const application = await this.repository.findApplicationById(
      applicationId,
      includeInternalHistory,
    );
    if (application === null) {
      throw new OnboardingFlowError("application_not_found", 404, "Application was not found");
    }
    return application;
  }

  private authorizeOwner(
    context: RequestContext,
    applicationId: string,
    applicantPrincipalId: string,
    resourceType = "onboarding_application",
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        applicantPrincipalId,
        resourceId: applicationId,
        resourceType,
      },
      policy: AUTHORIZATION_POLICY.MANAGE_OWN_APPLICATION,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      requestId: context.requestId,
    });
  }

  private authorizeReview(
    context: RequestContext,
    application: StoredOnboardingApplication,
    authority: "REVIEW" | "DECIDE",
    resourceType = "onboarding_application",
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        applicantPrincipalId: application.applicantPrincipalId,
        resourceId: application.id,
        resourceType,
      },
      policy:
        authority === "DECIDE"
          ? AUTHORIZATION_POLICY.DECIDE_APPLICATION
          : AUTHORIZATION_POLICY.REVIEW_APPLICATION,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      requestId: context.requestId,
    });
  }
}

interface ApplicationListInput {
  applicantPrincipalId?: string;
  cursor?: string;
  kind?: OnboardingApplicationKind;
  limit?: number;
  status?: OnboardingApplicationStatus;
  statuses?: readonly OnboardingApplicationStatus[];
}

function assertCompleteForSubmission(data: OnboardingApplicationData): void {
  if (data.kind === "ORGANIZATION" && data.values.serviceIds.length === 0) {
    throw new OnboardingFlowError(
      "services_required",
      400,
      "An organization must select at least one service",
    );
  }
  if (
    data.kind === "PRACTITIONER" &&
    (data.values.professionIds.length === 0 || data.values.specialtyIds.length === 0)
  ) {
    throw new OnboardingFlowError(
      "clinical_catalogue_selection_required",
      400,
      "A practitioner must select at least one profession and specialty",
    );
  }
}

function withoutRepositoryFields(
  application: StoredOnboardingApplication,
): OnboardingApplicationDetail {
  const { applicantPrincipalId: _applicantPrincipalId, ...detail } = application;
  return detail;
}
