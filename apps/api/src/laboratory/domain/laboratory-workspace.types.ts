import type { LaboratoryWorkspaceResponse } from "@royal-palace/contracts";

export interface LaboratoryWorkspaceRepository {
  find(organizationId: string): Promise<LaboratoryWorkspaceResponse | null>;
}

export const LABORATORY_WORKSPACE_REPOSITORY = Symbol("LABORATORY_WORKSPACE_REPOSITORY");
