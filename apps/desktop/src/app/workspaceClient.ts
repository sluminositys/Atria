import { MemoryWorkspaceRepository, WorkspaceService, createDefaultWorkspace } from "@atria/core";

const repository = new MemoryWorkspaceRepository(createDefaultWorkspace());

export const workspaceService = new WorkspaceService(repository);

