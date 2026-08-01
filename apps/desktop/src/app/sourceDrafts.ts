export interface SourceDraft {
  key: string;
  type: "artifact" | "asset";
  id: string;
  title: string;
  filePath: string;
  source: string;
  baselineSource: string;
}

export type SourceDraftSaveResult =
  | { status: "saved"; savedSource: string }
  | { status: "conflict"; message: string }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

interface SourceDraftPersistence {
  read(): Promise<string>;
  write(source: string): Promise<void>;
  checkpoint(): Promise<void>;
}

export function isSourceDraftDirty(draft: SourceDraft | undefined): boolean {
  return Boolean(draft && draft.source !== draft.baselineSource);
}

export async function persistSourceDraft(
  draft: SourceDraft,
  persistence: SourceDraftPersistence,
): Promise<SourceDraftSaveResult> {
  let diskSource: string;
  try {
    diskSource = await persistence.read();
  } catch (reason) {
    if (isMissingFile(reason)) {
      return {
        status: "missing",
        message: "This file was removed outside Atria. Restore it from the editor or discard the draft.",
      };
    }
    return { status: "error", message: `Atria could not read this file before saving. ${messageFor(reason)}` };
  }

  if (diskSource !== draft.baselineSource) {
    return {
      status: "conflict",
      message: "This file changed outside Atria. Review the disk version before applying your edits.",
    };
  }

  try {
    await persistence.write(draft.source);
    await persistence.checkpoint();
    return { status: "saved", savedSource: draft.source };
  } catch (reason) {
    return { status: "error", message: `Atria could not save this file. ${messageFor(reason)}` };
  }
}

function isMissingFile(reason: unknown): boolean {
  const message = messageFor(reason).toLowerCase();
  return message.includes("os error 2") || message.includes("not found") || message.includes("does not exist");
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
