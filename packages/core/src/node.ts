import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WorkspaceSnapshot, WorkspaceSnapshotSchema } from "@atria/schema";
import { createDefaultWorkspace, WorkspaceRepository } from "./index";

export class FileSystemWorkspaceRepository implements WorkspaceRepository {
  private readonly snapshotFile: string;

  constructor(private readonly workspacePath: string) {
    this.snapshotFile = join(workspacePath, ".atria", "workspace.json");
  }

  async read(): Promise<WorkspaceSnapshot> {
    try {
      const raw = await readFile(this.snapshotFile, "utf8");
      return WorkspaceSnapshotSchema.parse(JSON.parse(raw));
    } catch {
      const snapshot = createDefaultWorkspace();
      await this.write(snapshot);
      return snapshot;
    }
  }

  async write(snapshot: WorkspaceSnapshot): Promise<void> {
    await mkdir(dirname(this.snapshotFile), { recursive: true });
    await writeFile(this.snapshotFile, JSON.stringify(WorkspaceSnapshotSchema.parse(snapshot), null, 2), "utf8");
  }
}

export function resolveWorkspacePath(input?: string): string {
  return input || process.env.ATRIA_WORKSPACE || join(process.cwd(), "examples", "workspace");
}

