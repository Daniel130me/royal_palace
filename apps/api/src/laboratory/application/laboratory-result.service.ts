import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import type {
  CurrentSession,
  LaboratoryCriticalResultStatus,
  LaboratoryResultStatus,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import {
  DOCUMENT_STORAGE,
  type DocumentStorage,
} from "../../platform/documents/document-storage.port.js";
import { SERVICE_CONFIG } from "../../tokens.js";
import type { LaboratoryRequestContext } from "./laboratory.service.js";
import { LaboratoryFlowError } from "./laboratory.service.js";
import {
  LABORATORY_RESULT_REPOSITORY,
  type LaboratoryCriticalResultAccessRecord,
  type LaboratoryResultAccessRecord,
  type LaboratoryResultDraft,
  type LaboratoryResultRepository,
} from "../domain/laboratory-result.types.js";

@Injectable()
export class LaboratoryResultService {
  constructor(
    @Inject(LABORATORY_RESULT_REPOSITORY)
    private readonly repository: LaboratoryResultRepository,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig,
  ) {}

  async createAttachmentUploadIntent(
    context: LaboratoryRequestContext,
    organizationId: string,
    resultId: string,
    input: {
      declaredContentType: string;
      declaredSha256: string;
      declaredSizeBytes: number;
      originalFilename: string;
      purpose: string;
    },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, resultId);
    const uploadExpiresAt = new Date(
      Date.now() + this.config.objectStorage.uploadTtlSeconds * 1000,
    );
    const reserved = await this.repository.createAttachmentUpload({
      ...input,
      organizationId,
      resultId,
      uploadExpiresAt,
    });
    const signed = await this.storage.signUpload({
      contentType: input.declaredContentType,
      expiresInSeconds: this.config.objectStorage.uploadTtlSeconds,
      key: reserved.storageObjectKey,
      sha256Hex: input.declaredSha256,
    });
    return {
      attachmentId: reserved.attachmentId,
      upload: {
        expiresAt: uploadExpiresAt.toISOString(),
        headers: signed.headers,
        method: "PUT" as const,
        url: signed.url,
      },
    };
  }

  async completeAttachmentUpload(
    context: LaboratoryRequestContext,
    organizationId: string,
    resultId: string,
    attachmentId: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, resultId);
    const attachment = await this.requireAttachment(resultId, attachmentId);
    if (
      attachment.laboratoryOrganizationId !== organizationId ||
      attachment.status !== "AWAITING_UPLOAD" ||
      attachment.storageObjectKey === null ||
      attachment.uploadExpiresAt === null ||
      attachment.uploadExpiresAt.getTime() <= Date.now()
    ) {
      throw attachmentConflict();
    }
    const evidence = await this.storage.inspectQuarantined(attachment.storageObjectKey);
    if (evidence === null) throw attachmentConflict("Attachment upload is incomplete");
    const expectedChecksum = Buffer.from(attachment.declaredSha256, "hex").toString("base64");
    if (
      evidence.checksumSha256 !== expectedChecksum ||
      evidence.sizeBytes !== attachment.declaredSizeBytes ||
      evidence.contentType !== attachment.declaredContentType ||
      ((this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
        evidence.versionId === null)
    ) {
      await this.repository.rejectAttachmentUpload({
        attachmentId,
        organizationId,
        reasonCode: "UPLOAD_EVIDENCE_MISMATCH",
      });
      throw attachmentConflict("Attachment upload failed verification");
    }
    const completed = await this.repository.completeAttachmentUpload({
      attachmentId,
      organizationId,
      quarantineVersionId: evidence.versionId,
    });
    if (!completed) throw attachmentConflict();
    return { status: "QUARANTINED" as const };
  }

  async downloadAttachment(
    context: LaboratoryRequestContext,
    resultId: string,
    attachmentId: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const attachment = await this.requireAttachment(resultId, attachmentId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        laboratoryOrganizationId: attachment.laboratoryOrganizationId,
        patientPrincipalId: attachment.patientPrincipalId,
        practitionerPrincipalId: attachment.practitionerPrincipalId,
        resourceId: attachment.resultId,
        resourceType: "laboratory_result_attachment",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT,
      requestId: context.requestId,
    });
    const laboratoryMember = context.actor.memberships.some(
      (membership) => membership.organizationId === attachment.laboratoryOrganizationId,
    );
    if (
      (!laboratoryMember && attachment.resultStatus !== "PUBLISHED") ||
      attachment.status !== "CLEAN" ||
      attachment.cleanObjectKey === null
    ) {
      throw new LaboratoryFlowError(
        "laboratory_result_attachment_not_found",
        404,
        "Attachment was not found",
      );
    }
    if (
      (this.config.appEnvironment === "staging" || this.config.appEnvironment === "production") &&
      attachment.cleanVersionId === null
    ) {
      throw new LaboratoryFlowError(
        "laboratory_result_attachment_not_found",
        404,
        "Attachment was not found",
      );
    }
    const expiresAt = new Date(Date.now() + this.config.objectStorage.downloadTtlSeconds * 1000);
    const url = await this.storage.signCleanDownload({
      expiresInSeconds: this.config.objectStorage.downloadTtlSeconds,
      key: attachment.cleanObjectKey,
      versionId: attachment.cleanVersionId,
    });
    return { expiresAt: expiresAt.toISOString(), url };
  }

  async createDraft(
    context: LaboratoryRequestContext,
    organizationId: string,
    idempotencyKey: string,
    draft: LaboratoryResultDraft,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, draft.bookingId);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ draft, organizationId }))
      .digest("hex");
    return publicResult(
      await this.repository.createDraft({
        actorPrincipalId: context.actor.principalId,
        draft,
        idempotencyKey,
        organizationId,
        requestHash,
        requestId: context.requestId,
      }),
    );
  }

  async updateDraft(
    context: LaboratoryRequestContext,
    organizationId: string,
    resultId: string,
    input: Omit<LaboratoryResultDraft, "bookingId"> & { expectedVersion: number },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, resultId);
    return publicResult(
      this.requireMutation(
        await this.repository.updateDraft({
          actorPrincipalId: context.actor.principalId,
          components: input.components,
          expectedVersion: input.expectedVersion,
          ...(input.interpretation === undefined ? {} : { interpretation: input.interpretation }),
          organizationId,
          requestId: context.requestId,
          resultId,
        }),
      ),
    );
  }

  async transitionReview(
    context: LaboratoryRequestContext,
    organizationId: string,
    resultId: string,
    input: {
      expectedVersion: number;
      reasonCode: string;
      toStatus: "DRAFT" | "IN_REVIEW";
    },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, resultId);
    return publicResult(
      this.requireMutation(
        await this.repository.transitionResult({
          actorPrincipalId: context.actor.principalId,
          organizationId,
          requestId: context.requestId,
          resultId,
          ...input,
        }),
      ),
    );
  }

  async publish(
    context: LaboratoryRequestContext,
    organizationId: string,
    resultId: string,
    expectedVersion: number,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, resultId);
    return publicResult(
      this.requireMutation(
        await this.repository.publish({
          acknowledgementSeconds: this.config.laboratory.criticalAcknowledgementSeconds,
          actorPrincipalId: context.actor.principalId,
          expectedVersion,
          organizationId,
          requestId: context.requestId,
          resultId,
        }),
      ),
    );
  }

  async createAmendment(
    context: LaboratoryRequestContext,
    organizationId: string,
    previousResultId: string,
    draft: Omit<LaboratoryResultDraft, "bookingId">,
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, previousResultId);
    return publicResult(
      await this.repository.createAmendment({
        actorPrincipalId: context.actor.principalId,
        components: draft.components,
        ...(draft.interpretation === undefined ? {} : { interpretation: draft.interpretation }),
        organizationId,
        previousResultId,
        requestId: context.requestId,
      }),
    );
  }

  async get(context: LaboratoryRequestContext, resultId: string) {
    this.assertSyntheticClinicalWorkflow();
    const result = await this.requireResult(resultId);
    await this.authorizeView(context, result);
    if (!isLaboratoryMember(context.actor, result) && result.status !== "PUBLISHED") {
      throw new LaboratoryFlowError("laboratory_result_not_found", 404, "Result was not found");
    }
    return publicResult(result);
  }

  async listForLaboratory(
    context: LaboratoryRequestContext,
    organizationId: string,
    input: { cursor?: string; limit: number; status?: LaboratoryResultStatus },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorizeLaboratoryManagement(context, organizationId, organizationId);
    return this.repository.listResults({
      ...(input.cursor === undefined ? {} : { cursor: decodeResultCursor(input.cursor) }),
      limit: input.limit,
      organizationId,
      ...(input.status === undefined ? {} : { status: input.status }),
    });
  }

  async listForPatient(
    context: LaboratoryRequestContext,
    input: { cursor?: string; limit: number },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        laboratoryOrganizationId: "self-list",
        patientPrincipalId: context.actor.principalId,
        practitionerPrincipalId: "self-list",
        resourceId: context.actor.principalId,
        resourceType: "patient_laboratory_result_list",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT,
      requestId: context.requestId,
    });
    return this.repository.listResults({
      ...(input.cursor === undefined ? {} : { cursor: decodePublishedResultCursor(input.cursor) }),
      limit: input.limit,
      patientPrincipalId: context.actor.principalId,
      status: "PUBLISHED",
    });
  }

  async listForPractitioner(
    context: LaboratoryRequestContext,
    input: { cursor?: string; limit: number; patientId?: string },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        laboratoryOrganizationId: "self-list",
        patientPrincipalId: "self-list",
        practitionerPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "practitioner_laboratory_result_list",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT,
      requestId: context.requestId,
    });
    return this.repository.listResults({
      ...(input.cursor === undefined ? {} : { cursor: decodePublishedResultCursor(input.cursor) }),
      limit: input.limit,
      ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
      practitionerPrincipalId: context.actor.principalId,
      status: "PUBLISHED",
    });
  }

  async listCriticalForPractitioner(
    context: LaboratoryRequestContext,
    input: { cursor?: string; limit: number; status?: LaboratoryCriticalResultStatus },
  ) {
    this.assertSyntheticClinicalWorkflow();
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: context.actor.principalId,
        resourceId: context.actor.principalId,
        resourceType: "practitioner_critical_laboratory_result_list",
      },
      policy: AUTHORIZATION_POLICY.ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT,
      requestId: context.requestId,
    });
    const page = await this.repository.listCriticalByPractitioner({
      ...(input.cursor === undefined ? {} : { cursor: decodeCriticalCursor(input.cursor) }),
      limit: input.limit,
      practitionerPrincipalId: context.actor.principalId,
      ...(input.status === undefined ? {} : { status: input.status }),
    });
    return { ...page, data: page.data.map(publicCriticalResult) };
  }

  acknowledgeCritical(
    context: LaboratoryRequestContext,
    criticalResultId: string,
    expectedVersion: number,
  ) {
    return this.transitionCritical(context, criticalResultId, expectedVersion);
  }

  resolveCritical(
    context: LaboratoryRequestContext,
    criticalResultId: string,
    expectedVersion: number,
    resolutionCode: string,
  ) {
    return this.transitionCritical(context, criticalResultId, expectedVersion, resolutionCode);
  }

  private async transitionCritical(
    context: LaboratoryRequestContext,
    criticalResultId: string,
    expectedVersion: number,
    resolutionCode?: string,
  ) {
    this.assertSyntheticClinicalWorkflow();
    const critical = await this.requireCriticalResult(criticalResultId);
    await this.authorization.authorize({
      actor: context.actor,
      context: {
        practitionerPrincipalId: critical.practitionerPrincipalId,
        resourceId: critical.id,
        resourceType: "laboratory_critical_result",
      },
      policy: AUTHORIZATION_POLICY.ACKNOWLEDGE_CRITICAL_LABORATORY_RESULT,
      requestId: context.requestId,
    });
    return publicCriticalResult(
      this.requireMutation(
        resolutionCode === undefined
          ? await this.repository.acknowledgeCritical({
              actorPrincipalId: context.actor.principalId,
              criticalResultId,
              expectedVersion,
              requestId: context.requestId,
            })
          : await this.repository.resolveCritical({
              actorPrincipalId: context.actor.principalId,
              criticalResultId,
              expectedVersion,
              requestId: context.requestId,
              resolutionCode,
            }),
      ),
    );
  }

  private authorizeLaboratoryManagement(
    context: LaboratoryRequestContext,
    organizationId: string,
    resourceId: string,
  ) {
    return this.authorization.authorize({
      actor: context.actor,
      context: { organizationId, resourceId, resourceType: "laboratory_result" },
      policy: AUTHORIZATION_POLICY.MANAGE_LABORATORY_RESULT,
      requestId: context.requestId,
    });
  }

  private authorizeView(context: LaboratoryRequestContext, result: LaboratoryResultAccessRecord) {
    return this.authorization.authorize({
      actor: context.actor,
      context: {
        laboratoryOrganizationId: result.laboratoryOrganizationId,
        patientPrincipalId: result.patientPrincipalId,
        practitionerPrincipalId: result.practitionerPrincipalId,
        resourceId: result.id,
        resourceType: "laboratory_result",
      },
      policy: AUTHORIZATION_POLICY.VIEW_LABORATORY_RESULT,
      requestId: context.requestId,
    });
  }

  private async requireResult(resultId: string) {
    const result = await this.repository.findResultById(resultId);
    if (result === null) {
      throw new LaboratoryFlowError("laboratory_result_not_found", 404, "Result was not found");
    }
    return result;
  }

  private async requireCriticalResult(criticalResultId: string) {
    const result = await this.repository.findCriticalById(criticalResultId);
    if (result === null) {
      throw new LaboratoryFlowError(
        "laboratory_critical_result_not_found",
        404,
        "Critical result was not found",
      );
    }
    return result;
  }

  private async requireAttachment(resultId: string, attachmentId: string) {
    const attachment = await this.repository.findAttachmentById({ attachmentId, resultId });
    if (attachment === null) {
      throw new LaboratoryFlowError(
        "laboratory_result_attachment_not_found",
        404,
        "Attachment was not found",
      );
    }
    return attachment;
  }

  private requireMutation<T>(result: T | null): T {
    if (result === null) {
      throw new LaboratoryFlowError(
        "laboratory_result_conflict",
        409,
        "The result conflicts with current data",
      );
    }
    return result;
  }

  private assertSyntheticClinicalWorkflow() {
    if (this.config.clinicalWorkflow.mode !== "synthetic") {
      throw new LaboratoryFlowError(
        "clinical_workflow_disabled",
        503,
        "Clinical workflows are not enabled in this environment",
      );
    }
  }
}

function decodeResultCursor(value: string): { createdAt: Date; id: string } {
  return decodeCursor(value, "createdAt") as { createdAt: Date; id: string };
}

function decodePublishedResultCursor(value: string): { id: string; publishedAt: Date } {
  return decodeCursor(value, "publishedAt") as { id: string; publishedAt: Date };
}

function decodeCriticalCursor(value: string): { acknowledgementDueAt: Date; id: string } {
  return decodeCursor(value, "acknowledgementDueAt") as { acknowledgementDueAt: Date; id: string };
}

function decodeCursor(
  value: string,
  dateKey: "acknowledgementDueAt" | "createdAt" | "publishedAt",
) {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof decoded.id !== "string" || typeof decoded[dateKey] !== "string") throw new Error();
    const date = new Date(decoded[dateKey]);
    if (!Number.isFinite(date.getTime())) throw new Error();
    return { [dateKey]: date, id: decoded.id };
  } catch {
    throw new LaboratoryFlowError("invalid_cursor", 400, "Cursor is invalid");
  }
}

function publicResult(result: LaboratoryResultAccessRecord) {
  const {
    laboratoryOrganizationId: _laboratoryOrganizationId,
    patientPrincipalId: _patientPrincipalId,
    practitionerPrincipalId: _practitionerPrincipalId,
    ...response
  } = result;
  return response;
}

function isLaboratoryMember(actor: CurrentSession, result: LaboratoryResultAccessRecord) {
  return actor.memberships.some(
    (membership) => membership.organizationId === result.laboratoryOrganizationId,
  );
}

function publicCriticalResult(result: LaboratoryCriticalResultAccessRecord) {
  const { practitionerPrincipalId: _practitionerPrincipalId, ...response } = result;
  return response;
}

function attachmentConflict(message = "Attachment upload is unavailable") {
  return new LaboratoryFlowError("laboratory_result_attachment_conflict", 409, message);
}
