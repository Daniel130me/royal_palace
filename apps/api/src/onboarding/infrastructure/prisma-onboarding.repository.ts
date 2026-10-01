import { Inject, Injectable } from "@nestjs/common";
import type {
  ApplicationDocumentMetadata,
  OnboardingApplicationData,
  OnboardingApplicationSummary,
} from "@royal-palace/contracts";

import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";
import type {
  ListApplicationsQuery,
  OnboardingRepository,
  ReserveApplicationDocumentInput,
  StoredOnboardingApplication,
  TransitionApplicationInput,
} from "../domain/onboarding-repository.types.js";

const applicationDetailSelect = {
  approvedOrganizationId: true,
  approvedPatientId: true,
  approvedPractitionerId: true,
  applicantPrincipalId: true,
  createdAt: true,
  documents: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      declaredContentType: true,
      declaredSha256: true,
      declaredSizeBytes: true,
      id: true,
      originalFilename: true,
      purpose: true,
      status: true,
      statusReasonCode: true,
    },
  },
  id: true,
  kind: true,
  organizationDetail: {
    select: {
      addressLine1: true,
      addressLine2: true,
      administrativeArea: true,
      contactEmail: true,
      contactName: true,
      contactPhoneE164: true,
      countryCode: true,
      displayName: true,
      legalName: true,
      locality: true,
      organizationType: true,
      postalCode: true,
      jurisdictionCode: true,
      registrationAuthority: true,
      registrationNumber: true,
      requestedServices: {
        orderBy: { serviceId: "asc" as const },
        select: { serviceId: true },
      },
    },
  },
  patientDetail: {
    select: {
      countryCode: true,
      dateOfBirth: true,
      familyName: true,
      givenName: true,
      phoneE164: true,
      preferredLanguage: true,
    },
  },
  practitionerDetail: {
    select: {
      biography: true,
      credentialType: true,
      facilityName: true,
      familyName: true,
      givenName: true,
      honorific: true,
      jurisdictionCode: true,
      registrationAuthority: true,
      registrationNumber: true,
      requestedProfessions: {
        orderBy: [{ isPrimary: "desc" as const }, { professionId: "asc" as const }],
        select: { professionId: true },
      },
      requestedSpecialties: {
        orderBy: [{ isPrimary: "desc" as const }, { specialtyId: "asc" as const }],
        select: { specialtyId: true },
      },
      selectedOrganizationId: true,
    },
  },
  status: true,
  statusHistory: {
    orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }],
    select: {
      fromStatus: true,
      id: true,
      note: true,
      noteVisibility: true,
      occurredAt: true,
      reasonCategory: true,
      toStatus: true,
    },
  },
  submittedAt: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.OnboardingApplicationSelect;

const applicationSummarySelect = {
  createdAt: true,
  id: true,
  kind: true,
  organizationDetail: { select: { displayName: true } },
  patientDetail: { select: { familyName: true, givenName: true } },
  practitionerDetail: { select: { familyName: true, givenName: true, honorific: true } },
  status: true,
  submittedAt: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.OnboardingApplicationSelect;

type ApplicationDetailRecord = Prisma.OnboardingApplicationGetPayload<{
  select: typeof applicationDetailSelect;
}>;
type ApplicationSummaryRecord = Prisma.OnboardingApplicationGetPayload<{
  select: typeof applicationSummarySelect;
}>;
type Transaction = Prisma.TransactionClient;

export class ApplicationConflictError extends Error {
  constructor(message = "Application changed while the request was being processed") {
    super(message);
    this.name = "ApplicationConflictError";
  }
}

export class InvalidCatalogueSelectionError extends Error {
  constructor(readonly catalogue: "organization" | "profession" | "service" | "specialty") {
    super(`One or more selected ${catalogue} entries are unavailable`);
    this.name = "InvalidCatalogueSelectionError";
  }
}

@Injectable()
export class PrismaOnboardingRepository implements OnboardingRepository {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async createApplication(input: {
    applicantPrincipalId: string;
    correlationId?: string;
    data: OnboardingApplicationData;
    referral?: { linkId: string; managerProfileId: string };
    requestId: string;
  }): Promise<StoredOnboardingApplication> {
    const applicationId = createOpaqueId();
    try {
      await this.database.$transaction(async (transaction) => {
        const attributionEventId = input.referral === undefined ? undefined : createOpaqueId();
        await validateCatalogueSelections(transaction, input.data);
        await transaction.onboardingApplication.create({
          data: {
            ...typedDetailCreate(input.data),
            applicant: { connect: { id: input.applicantPrincipalId } },
            id: applicationId,
            kind: input.data.kind,
            statusHistory: {
              create: {
                correlationId: input.correlationId,
                id: createOpaqueId(),
                noteVisibility: "APPLICANT",
                reasonCategory: "APPLICATION_CREATED",
                requestId: input.requestId,
                toStatus: "DRAFT",
              },
            },
          },
          select: { id: true },
        });
        if (input.referral !== undefined && attributionEventId !== undefined) {
          await transaction.referralAttributionEvent.create({
            data: {
              actorPrincipalId: input.applicantPrincipalId,
              applicationId,
              correlationId: input.correlationId,
              eventType: "ATTRIBUTED",
              id: attributionEventId,
              managerProfileId: input.referral.managerProfileId,
              reasonCategory: "APPLICANT_USED_REFERRAL_LINK",
              referralLinkId: input.referral.linkId,
              requestId: input.requestId,
            },
          });
          await transaction.currentReferralAttribution.create({
            data: {
              applicationId,
              currentEventId: attributionEventId,
              managerProfileId: input.referral.managerProfileId,
              referralLinkId: input.referral.linkId,
              updatedAt: new Date(),
            },
          });
        }
      });
    } catch (error) {
      throw translateConstraintError(error, "An open application of this type already exists");
    }
    return this.requireApplication(applicationId, true);
  }

  async findApplicationById(
    id: string,
    includeInternalHistory: boolean,
  ): Promise<StoredOnboardingApplication | null> {
    const record = await this.database.onboardingApplication.findUnique({
      relationLoadStrategy: "join",
      select: {
        ...applicationDetailSelect,
        statusHistory: {
          ...applicationDetailSelect.statusHistory,
          ...(includeInternalHistory ? {} : { where: { noteVisibility: "APPLICANT" as const } }),
        },
      },
      where: { id },
    });
    return record === null ? null : mapApplicationDetail(record);
  }

  async listApplications(query: ListApplicationsQuery) {
    const records = await this.database.onboardingApplication.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      relationLoadStrategy: "join",
      select: applicationSummarySelect,
      take: query.limit + 1,
      where: {
        ...(query.applicantPrincipalId === undefined
          ? {}
          : { applicantPrincipalId: query.applicantPrincipalId }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.status !== undefined
          ? { status: query.status }
          : query.statuses === undefined
            ? {}
            : { status: { in: [...query.statuses] } }),
        ...(query.cursor === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(query.cursor.createdAt) } },
                {
                  createdAt: new Date(query.cursor.createdAt),
                  id: { lt: query.cursor.id },
                },
              ],
            }),
      },
    });
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    return {
      data: page.map(mapApplicationSummary),
      pageInfo: { endCursor: hasNextPage ? "pending" : null, hasNextPage },
    };
  }

  async reserveDocument(
    input: ReserveApplicationDocumentInput,
  ): Promise<{ document: ApplicationDocumentMetadata; uploadAvailable: false }> {
    const document = await this.database.$transaction(async (transaction) => {
      const application = await transaction.onboardingApplication.findUnique({
        select: { status: true },
        where: { id: input.applicationId },
      });
      if (
        application === null ||
        (application.status !== "DRAFT" && application.status !== "MORE_INFORMATION_REQUIRED")
      ) {
        throw new ApplicationConflictError("Documents cannot be added in the current state");
      }
      return transaction.applicationDocument.create({
        data: { ...input, id: createOpaqueId() },
        select: applicationDetailSelect.documents.select,
      });
    });
    return { document, uploadAvailable: false };
  }

  async transitionApplication(
    input: TransitionApplicationInput,
  ): Promise<StoredOnboardingApplication> {
    try {
      await this.database.$transaction(async (transaction) => {
        const application = await transaction.onboardingApplication.findUnique({
          relationLoadStrategy: "join",
          select: applicationDetailSelect,
          where: { id: input.applicationId },
        });
        if (
          application === null ||
          application.status !== input.expectedStatus ||
          application.version !== input.expectedVersion
        ) {
          throw new ApplicationConflictError();
        }

        const approvedResourceId =
          input.toStatus === "APPROVED"
            ? await createApprovedResource(transaction, application, input.actorPrincipalId)
            : null;
        const now = new Date();
        const result = await transaction.onboardingApplication.updateMany({
          data: {
            ...(input.toStatus === "SUBMITTED" ? { submittedAt: now } : {}),
            ...(input.toStatus === "UNDER_REVIEW"
              ? { reviewStartedAt: now, reviewStartedByPrincipalId: input.actorPrincipalId }
              : {}),
            ...(input.toStatus === "APPROVED" || input.toStatus === "REJECTED"
              ? { decidedAt: now, decidedByPrincipalId: input.actorPrincipalId }
              : {}),
            ...(input.toStatus === "WITHDRAWN" ? { withdrawnAt: now } : {}),
            ...approvedResourceReference(application.kind, approvedResourceId),
            status: input.toStatus,
            version: { increment: 1 },
          },
          where: {
            id: input.applicationId,
            status: input.expectedStatus,
            version: input.expectedVersion,
          },
        });
        if (result.count !== 1) throw new ApplicationConflictError();
        await transaction.applicationStatusHistory.create({
          data: {
            actorPrincipalId: input.actorPrincipalId,
            applicationId: input.applicationId,
            correlationId: input.correlationId,
            fromStatus: input.expectedStatus,
            id: createOpaqueId(),
            note: input.note,
            noteVisibility: input.noteVisibility,
            reasonCategory: input.reasonCategory,
            requestId: input.requestId,
            toStatus: input.toStatus,
          },
        });
      });
    } catch (error) {
      throw translateConstraintError(
        error,
        "The verified registration is already associated with another approved record",
      );
    }
    return this.requireApplication(input.applicationId, true);
  }

  async updateApplication(input: {
    applicantPrincipalId: string;
    applicationId: string;
    data: OnboardingApplicationData;
    expectedVersion: number;
  }): Promise<StoredOnboardingApplication> {
    await this.database.$transaction(async (transaction) => {
      await validateCatalogueSelections(transaction, input.data);
      const existing = await transaction.onboardingApplication.findFirst({
        select: { kind: true, status: true },
        where: {
          applicantPrincipalId: input.applicantPrincipalId,
          id: input.applicationId,
          version: input.expectedVersion,
        },
      });
      if (
        existing === null ||
        existing.kind !== input.data.kind ||
        (existing.status !== "DRAFT" && existing.status !== "MORE_INFORMATION_REQUIRED")
      ) {
        throw new ApplicationConflictError();
      }
      await replaceTypedDetail(transaction, input.applicationId, input.data);
      const result = await transaction.onboardingApplication.updateMany({
        data: { version: { increment: 1 } },
        where: {
          applicantPrincipalId: input.applicantPrincipalId,
          id: input.applicationId,
          status: existing.status,
          version: input.expectedVersion,
        },
      });
      if (result.count !== 1) throw new ApplicationConflictError();
    });
    return this.requireApplication(input.applicationId, false);
  }

  private async requireApplication(
    applicationId: string,
    includeInternalHistory: boolean,
  ): Promise<StoredOnboardingApplication> {
    const application = await this.findApplicationById(applicationId, includeInternalHistory);
    if (application === null) throw new ApplicationConflictError("Application no longer exists");
    return application;
  }
}

type TypedDetailCreate = Pick<
  Prisma.OnboardingApplicationCreateInput,
  "organizationDetail" | "patientDetail" | "practitionerDetail"
>;

function typedDetailCreate(data: OnboardingApplicationData): TypedDetailCreate {
  switch (data.kind) {
    case "PATIENT":
      return {
        patientDetail: {
          create: {
            ...data.values,
            dateOfBirth: dateOnly(data.values.dateOfBirth),
          },
        },
      };
    case "ORGANIZATION": {
      const { serviceIds, ...values } = data.values;
      return {
        organizationDetail: {
          create: {
            ...values,
            requestedServices: {
              createMany: { data: unique(serviceIds).map((serviceId) => ({ serviceId })) },
            },
          },
        },
      };
    }
    case "PRACTITIONER": {
      const { professionIds, specialtyIds, ...values } = data.values;
      return {
        practitionerDetail: {
          create: {
            ...values,
            requestedProfessions: {
              createMany: {
                data: unique(professionIds).map((professionId, index) => ({
                  isPrimary: index === 0,
                  professionId,
                })),
              },
            },
            requestedSpecialties: {
              createMany: {
                data: unique(specialtyIds).map((specialtyId, index) => ({
                  isPrimary: index === 0,
                  specialtyId,
                })),
              },
            },
          },
        },
      };
    }
  }
}

async function replaceTypedDetail(
  transaction: Transaction,
  applicationId: string,
  data: OnboardingApplicationData,
): Promise<void> {
  switch (data.kind) {
    case "PATIENT":
      await transaction.patientApplicationDetail.update({
        data: { ...data.values, dateOfBirth: dateOnly(data.values.dateOfBirth) },
        where: { applicationId },
      });
      return;
    case "ORGANIZATION": {
      const { serviceIds, ...values } = data.values;
      await transaction.organizationApplicationService.deleteMany({ where: { applicationId } });
      await transaction.organizationApplicationDetail.update({
        data: {
          ...values,
          requestedServices: {
            createMany: { data: unique(serviceIds).map((serviceId) => ({ serviceId })) },
          },
        },
        where: { applicationId },
      });
      return;
    }
    case "PRACTITIONER": {
      const { professionIds, specialtyIds, ...values } = data.values;
      await Promise.all([
        transaction.practitionerApplicationProfession.deleteMany({ where: { applicationId } }),
        transaction.practitionerApplicationSpecialty.deleteMany({ where: { applicationId } }),
      ]);
      await transaction.practitionerApplicationDetail.update({
        data: {
          ...values,
          requestedProfessions: {
            createMany: {
              data: unique(professionIds).map((professionId, index) => ({
                isPrimary: index === 0,
                professionId,
              })),
            },
          },
          requestedSpecialties: {
            createMany: {
              data: unique(specialtyIds).map((specialtyId, index) => ({
                isPrimary: index === 0,
                specialtyId,
              })),
            },
          },
        },
        where: { applicationId },
      });
    }
  }
}

async function validateCatalogueSelections(
  transaction: Transaction,
  data: OnboardingApplicationData,
): Promise<void> {
  if (data.kind === "ORGANIZATION") {
    await requireActiveCount(
      unique(data.values.serviceIds),
      (ids) =>
        transaction.serviceTaxonomy.count({ where: { id: { in: [...ids] }, status: "ACTIVE" } }),
      "service",
    );
  }
  if (data.kind === "PRACTITIONER") {
    await Promise.all([
      requireActiveCount(
        unique(data.values.professionIds),
        (ids) =>
          transaction.professionTaxonomy.count({
            where: { id: { in: [...ids] }, status: "ACTIVE" },
          }),
        "profession",
      ),
      requireActiveCount(
        unique(data.values.specialtyIds),
        (ids) =>
          transaction.specialtyTaxonomy.count({
            where: { id: { in: [...ids] }, status: "ACTIVE" },
          }),
        "specialty",
      ),
      requireVerifiedOrganization(transaction, data.values.selectedOrganizationId),
    ]);
  }
}

async function requireVerifiedOrganization(
  transaction: Transaction,
  organizationId: string | null,
): Promise<{ displayName: string } | null> {
  if (organizationId === null) return null;
  const organization = await transaction.organization.findFirst({
    select: { displayName: true },
    where: { id: organizationId, verificationStatus: "VERIFIED" },
  });
  if (organization === null) throw new InvalidCatalogueSelectionError("organization");
  return organization;
}

async function requireActiveCount(
  ids: readonly string[],
  count: (ids: readonly string[]) => Promise<number>,
  catalogue: InvalidCatalogueSelectionError["catalogue"],
): Promise<void> {
  if (ids.length === 0) return;
  if ((await count(ids)) !== ids.length) throw new InvalidCatalogueSelectionError(catalogue);
}

async function createApprovedResource(
  transaction: Transaction,
  application: ApplicationDetailRecord,
  administratorPrincipalId: string,
): Promise<string> {
  const now = new Date();
  const resourceId = createOpaqueId();
  switch (application.kind) {
    case "PATIENT": {
      const detail = requireDetail(application.patientDetail, "patient");
      await transaction.patient.create({
        data: {
          ...detail,
          dateOfBirth: detail.dateOfBirth,
          id: resourceId,
          onboardedAt: now,
          principalId: application.applicantPrincipalId,
        },
      });
      await ensurePlatformRole(
        transaction,
        application.applicantPrincipalId,
        "PATIENT",
        administratorPrincipalId,
      );
      return resourceId;
    }
    case "ORGANIZATION": {
      const detail = requireDetail(application.organizationDetail, "organization");
      await requireActiveCount(
        detail.requestedServices.map(({ serviceId }) => serviceId),
        (ids) =>
          transaction.serviceTaxonomy.count({ where: { id: { in: [...ids] }, status: "ACTIVE" } }),
        "service",
      );
      const locationId = createOpaqueId();
      const organizationServices = detail.requestedServices.map(({ serviceId }) => ({
        id: createOpaqueId(),
        serviceId,
      }));
      await transaction.organization.create({
        data: {
          displayName: detail.displayName,
          facilityLocations: {
            create: {
              addressLine1: detail.addressLine1,
              addressLine2: detail.addressLine2,
              administrativeArea: detail.administrativeArea,
              countryCode: detail.countryCode,
              id: locationId,
              isPrimary: true,
              isPublic: false,
              label: "Primary location",
              locality: detail.locality,
              postalCode: detail.postalCode,
            },
          },
          id: resourceId,
          legalName: detail.legalName,
          organizationServices: {
            create: organizationServices.map((service) => ({ ...service, status: "ACTIVE" })),
          },
          publicProfile: { create: { slug: `organization-${resourceId}` } },
          registrations: {
            create: {
              id: createOpaqueId(),
              authorityName: detail.registrationAuthority,
              jurisdictionCode: detail.jurisdictionCode,
              registrationNumber: detail.registrationNumber,
              verifiedAt: now,
            },
          },
          type: detail.organizationType,
          verificationStatus: "VERIFIED",
          verifiedAt: now,
        },
      });
      if (organizationServices.length > 0) {
        await transaction.facilityService.createMany({
          data: organizationServices.map((service) => ({
            id: createOpaqueId(),
            locationId,
            organizationId: resourceId,
            organizationServiceId: service.id,
          })),
        });
      }
      const membership = await transaction.membership.create({
        data: {
          id: createOpaqueId(),
          organizationId: resourceId,
          principalId: application.applicantPrincipalId,
        },
      });
      await transaction.roleAssignment.create({
        data: {
          grantedByPrincipalId: administratorPrincipalId,
          id: createOpaqueId(),
          membershipId: membership.id,
          role: "ORGANIZATION_STAFF",
          scope: "ORGANIZATION",
        },
      });
      return resourceId;
    }
    case "PRACTITIONER": {
      const detail = requireDetail(application.practitionerDetail, "practitioner");
      const [selectedOrganization] = await Promise.all([
        requireVerifiedOrganization(transaction, detail.selectedOrganizationId),
        requireActiveCount(
          detail.requestedProfessions.map(({ professionId }) => professionId),
          (ids) =>
            transaction.professionTaxonomy.count({
              where: { id: { in: [...ids] }, status: "ACTIVE" },
            }),
          "profession",
        ),
        requireActiveCount(
          detail.requestedSpecialties.map(({ specialtyId }) => specialtyId),
          (ids) =>
            transaction.specialtyTaxonomy.count({
              where: { id: { in: [...ids] }, status: "ACTIVE" },
            }),
          "specialty",
        ),
      ]);
      const affiliationFacilityName = selectedOrganization?.displayName ?? detail.facilityName;
      await transaction.practitioner.create({
        data: {
          affiliations:
            affiliationFacilityName === null
              ? undefined
              : {
                  create: {
                    facilityName: affiliationFacilityName,
                    id: createOpaqueId(),
                    isPublic: false,
                    organizationId: detail.selectedOrganizationId,
                  },
                },
          credentials: {
            create: {
              credentialType: detail.credentialType,
              id: createOpaqueId(),
              issuerName: detail.registrationAuthority,
              jurisdictionCode: detail.jurisdictionCode,
              registrationNumber: detail.registrationNumber,
              verifiedAt: now,
            },
          },
          displayName: [detail.honorific, detail.givenName, detail.familyName]
            .filter(Boolean)
            .join(" "),
          familyName: detail.familyName,
          givenName: detail.givenName,
          honorific: detail.honorific,
          id: resourceId,
          principalId: application.applicantPrincipalId,
          professions: {
            create: detail.requestedProfessions.map(({ professionId }, index) => ({
              id: createOpaqueId(),
              isPrimary: index === 0,
              professionId,
            })),
          },
          publicProfile: {
            create: { biography: detail.biography, slug: `practitioner-${resourceId}` },
          },
          specialties: {
            create: detail.requestedSpecialties.map(({ specialtyId }, index) => ({
              id: createOpaqueId(),
              isPrimary: index === 0,
              specialtyId,
            })),
          },
          verificationStatus: "VERIFIED",
          verifiedAt: now,
        },
      });
      await ensurePlatformRole(
        transaction,
        application.applicantPrincipalId,
        "PROVIDER",
        administratorPrincipalId,
      );
      return resourceId;
    }
  }
}

async function ensurePlatformRole(
  transaction: Transaction,
  principalId: string,
  role: "PATIENT" | "PROVIDER",
  grantedByPrincipalId: string,
): Promise<void> {
  const existing = await transaction.roleAssignment.findFirst({
    select: { id: true },
    where: { effectiveUntil: null, principalId, role, scope: "PLATFORM" },
  });
  if (existing !== null) return;
  await transaction.roleAssignment.create({
    data: {
      grantedByPrincipalId,
      id: createOpaqueId(),
      principalId,
      role,
      scope: "PLATFORM",
    },
  });
}

function approvedResourceReference(
  kind: ApplicationDetailRecord["kind"],
  resourceId: string | null,
) {
  if (resourceId === null) return {};
  if (kind === "PATIENT") return { approvedPatientId: resourceId };
  if (kind === "ORGANIZATION") return { approvedOrganizationId: resourceId };
  return { approvedPractitionerId: resourceId };
}

function mapApplicationDetail(record: ApplicationDetailRecord): StoredOnboardingApplication {
  return {
    ...mapApplicationSummary(record),
    applicantPrincipalId: record.applicantPrincipalId,
    approvedResourceId:
      record.approvedPatientId ?? record.approvedOrganizationId ?? record.approvedPractitionerId,
    data: applicationData(record),
    documents: record.documents,
    history: record.statusHistory.map((entry) => ({
      ...entry,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  };
}

function mapApplicationSummary(record: ApplicationSummaryRecord): OnboardingApplicationSummary {
  return {
    createdAt: record.createdAt.toISOString(),
    displayName: applicationDisplayName(record),
    id: record.id,
    kind: record.kind,
    status: record.status,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

function applicationData(record: ApplicationDetailRecord): OnboardingApplicationData {
  switch (record.kind) {
    case "PATIENT": {
      const detail = requireDetail(record.patientDetail, "patient");
      return {
        kind: "PATIENT",
        values: {
          ...detail,
          dateOfBirth: detail.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        },
      };
    }
    case "ORGANIZATION": {
      const detail = requireDetail(record.organizationDetail, "organization");
      const { requestedServices, ...values } = detail;
      return {
        kind: "ORGANIZATION",
        values: { ...values, serviceIds: requestedServices.map(({ serviceId }) => serviceId) },
      };
    }
    case "PRACTITIONER": {
      const detail = requireDetail(record.practitionerDetail, "practitioner");
      const { requestedProfessions, requestedSpecialties, ...values } = detail;
      return {
        kind: "PRACTITIONER",
        values: {
          ...values,
          professionIds: requestedProfessions.map(({ professionId }) => professionId),
          specialtyIds: requestedSpecialties.map(({ specialtyId }) => specialtyId),
        },
      };
    }
  }
}

function applicationDisplayName(record: ApplicationSummaryRecord): string {
  if (record.organizationDetail !== null) return record.organizationDetail.displayName;
  const person = record.patientDetail ?? record.practitionerDetail;
  if (person === null) throw new Error("Application is missing its typed detail");
  return "honorific" in person
    ? [person.honorific, person.givenName, person.familyName].filter(Boolean).join(" ")
    : `${person.givenName} ${person.familyName}`;
}

function requireDetail<T>(value: T | null, kind: string): T {
  if (value === null) throw new Error(`${kind} application is missing its typed detail`);
  return value;
}

function dateOnly(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function translateConstraintError(error: unknown, message: string): unknown {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return new ApplicationConflictError(message);
  }
  return error;
}
