import { Inject, Injectable } from "@nestjs/common";
import type {
  CatalogueEntryStatus,
  ClinicalCatalogueEntry,
  ClinicalCatalogueKind,
  ClinicalCatalogueListResponse,
  CurrentSession,
} from "@royal-palace/contracts";

import { AuthorizationService } from "../../authorization/application/authorization.service.js";
import { AUTHORIZATION_POLICY } from "../../authorization/domain/authorization.types.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { createOpaqueId } from "../../platform/identifiers.js";

import { decodeCatalogueCursor, encodeCatalogueCursor } from "./catalogue-cursor.js";

const ADMIN_SOURCE_SYSTEM = "ROYAL_PALACE_ADMIN";
const DEFAULT_CATALOGUE_PAGE_SIZE = 50;
export const MAX_CATALOGUE_PAGE_SIZE = 100;

export class CatalogueConflictError extends Error {
  constructor(message = "Catalogue entry changed while the request was being processed") {
    super(message);
    this.name = "CatalogueConflictError";
  }
}

@Injectable()
export class ClinicalCatalogueService {
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async list(input: {
    actor: CurrentSession;
    cursor?: string;
    kind: ClinicalCatalogueKind;
    limit?: number;
    requestId: string;
    status?: CatalogueEntryStatus;
  }): Promise<ClinicalCatalogueListResponse> {
    await this.authorize(input.actor, input.requestId, `${input.kind.toLowerCase()}-catalogue`);
    const limit = Math.min(input.limit ?? DEFAULT_CATALOGUE_PAGE_SIZE, MAX_CATALOGUE_PAGE_SIZE);
    const cursor =
      input.cursor === undefined
        ? undefined
        : decodeCatalogueCursor(input.cursor, input.kind, input.status);
    if (input.kind === "PROFESSION") {
      const entries = await this.database.professionTaxonomy.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit + 1,
        where: {
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(cursor?.kind !== "PROFESSION"
            ? {}
            : {
                OR: [{ name: { gt: cursor.name } }, { id: { gt: cursor.id }, name: cursor.name }],
              }),
        },
      });
      return cataloguePage(
        entries.map((entry) => ({ ...entry, category: null, parentId: null })),
        limit,
        input.kind,
        input.status,
      );
    }
    const entries = await this.database.specialtyTaxonomy.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      take: limit + 1,
      where: {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(cursor?.kind !== "SPECIALTY"
          ? {}
          : {
              OR: [
                { category: { gt: cursor.category } },
                { category: cursor.category, name: { gt: cursor.name } },
                { category: cursor.category, id: { gt: cursor.id }, name: cursor.name },
              ],
            }),
      },
    });
    return cataloguePage(entries, limit, input.kind, input.status);
  }

  async create(input: {
    actor: CurrentSession;
    category?: string;
    code: string;
    description: string | null;
    kind: ClinicalCatalogueKind;
    name: string;
    parentId?: string | null;
    requestId: string;
    sourceUri: string | null;
  }): Promise<ClinicalCatalogueEntry> {
    await this.authorize(input.actor, input.requestId, `${input.kind.toLowerCase()}-catalogue`);
    if (input.kind === "PROFESSION") {
      const entry = await this.database.professionTaxonomy
        .create({
          data: {
            code: input.code,
            description: input.description,
            id: createOpaqueId(),
            name: input.name,
            sourceSystem: ADMIN_SOURCE_SYSTEM,
            sourceUri: input.sourceUri,
          },
        })
        .catch(translateCatalogueMutationError);
      return { ...entry, category: null, parentId: null };
    }
    if (input.category === undefined) {
      throw new CatalogueConflictError("A specialty category is required");
    }
    if (input.parentId !== null && input.parentId !== undefined) {
      const parent = await this.database.specialtyTaxonomy.findFirst({
        select: { id: true },
        where: { id: input.parentId, status: "ACTIVE" },
      });
      if (parent === null) throw new CatalogueConflictError("Parent specialty is unavailable");
    }
    return this.database.specialtyTaxonomy
      .create({
        data: {
          category: input.category,
          code: input.code,
          description: input.description,
          id: createOpaqueId(),
          name: input.name,
          parentId: input.parentId,
          sourceSystem: ADMIN_SOURCE_SYSTEM,
          sourceUri: input.sourceUri,
        },
      })
      .catch(translateCatalogueMutationError);
  }

  async update(input: {
    actor: CurrentSession;
    category?: string;
    description: string | null;
    expectedVersion: number;
    id: string;
    kind: ClinicalCatalogueKind;
    name: string;
    parentId?: string | null;
    requestId: string;
    status: CatalogueEntryStatus;
  }): Promise<ClinicalCatalogueEntry> {
    await this.authorize(input.actor, input.requestId, input.id);
    if (input.kind === "PROFESSION") {
      const result = await this.database.professionTaxonomy.updateMany({
        data: {
          description: input.description,
          name: input.name,
          status: input.status,
          version: { increment: 1 },
        },
        where: { id: input.id, version: input.expectedVersion },
      });
      if (result.count !== 1) throw new CatalogueConflictError();
      const entry = await this.database.professionTaxonomy.findUniqueOrThrow({
        where: { id: input.id },
      });
      return { ...entry, category: null, parentId: null };
    }
    if (input.category === undefined) {
      throw new CatalogueConflictError("A specialty category is required");
    }
    if (input.parentId === input.id) {
      throw new CatalogueConflictError("A specialty cannot be its own parent");
    }
    return this.database
      .$transaction(async (transaction) => {
        if (input.parentId !== null && input.parentId !== undefined) {
          const parent = await transaction.specialtyTaxonomy.findFirst({
            select: { id: true },
            where: { id: input.parentId, status: "ACTIVE" },
          });
          if (parent === null) throw new CatalogueConflictError("Parent specialty is unavailable");

          // Follow the proposed parent's ancestry in one database round trip.
          // The database trigger remains the final guard against concurrent or direct-write cycles.
          const [cycle] = await transaction.$queryRaw<readonly { wouldCycle: boolean }[]>`
          WITH RECURSIVE ancestors AS (
            SELECT "id", "parent_id"
            FROM "specialty_taxonomies"
            WHERE "id" = ${input.parentId}::uuid
            UNION
            SELECT parent."id", parent."parent_id"
            FROM "specialty_taxonomies" parent
            INNER JOIN ancestors child ON parent."id" = child."parent_id"
          )
          SELECT EXISTS(
            SELECT 1 FROM ancestors WHERE "id" = ${input.id}::uuid
          ) AS "wouldCycle"
        `;
          if (cycle?.wouldCycle === true) {
            throw new CatalogueConflictError("Specialty hierarchy would contain a cycle");
          }
        }

        if (input.status === "INACTIVE") {
          const activeChild = await transaction.specialtyTaxonomy.findFirst({
            select: { id: true },
            where: { parentId: input.id, status: "ACTIVE" },
          });
          if (activeChild !== null) {
            throw new CatalogueConflictError(
              "A specialty with active child entries cannot be deactivated",
            );
          }
        }

        const result = await transaction.specialtyTaxonomy.updateMany({
          data: {
            category: input.category,
            description: input.description,
            name: input.name,
            parentId: input.parentId,
            status: input.status,
            version: { increment: 1 },
          },
          where: { id: input.id, version: input.expectedVersion },
        });
        if (result.count !== 1) throw new CatalogueConflictError();
        return transaction.specialtyTaxonomy.findUniqueOrThrow({ where: { id: input.id } });
      })
      .catch(translateCatalogueMutationError);
  }

  private authorize(actor: CurrentSession, requestId: string, resourceId: string) {
    return this.authorization.authorize({
      actor,
      context: { resourceId, resourceType: "clinical_catalogue" },
      policy: AUTHORIZATION_POLICY.ADMINISTER_CATALOGUE,
      requestId,
    });
  }
}

function translateCatalogueMutationError(error: unknown): never {
  if (error instanceof CatalogueConflictError) throw error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2004")
  ) {
    throw new CatalogueConflictError("Catalogue entry conflicts with an existing record");
  }
  throw error;
}

function cataloguePage(
  entries: readonly ClinicalCatalogueEntry[],
  limit: number,
  kind: ClinicalCatalogueKind,
  status: CatalogueEntryStatus | undefined,
): ClinicalCatalogueListResponse {
  const hasNextPage = entries.length > limit;
  const data = hasNextPage ? entries.slice(0, limit) : entries;
  const last = data.at(-1);
  if (kind === "SPECIALTY" && last !== undefined && last.category === null) {
    throw new Error("Specialty catalogue entry is missing its required category");
  }
  return {
    data,
    pageInfo: {
      endCursor:
        hasNextPage && last !== undefined
          ? encodeCatalogueCursor(
              kind === "PROFESSION"
                ? { id: last.id, kind, name: last.name }
                : { category: last.category ?? "", id: last.id, kind, name: last.name },
              status,
            )
          : null,
      hasNextPage,
    },
  };
}
