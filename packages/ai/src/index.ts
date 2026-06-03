import { AiSettings } from "@atria/schema";

export interface AiDraftRequest {
  settings: AiSettings;
  artifactIds: string[];
  intent: "summarize" | "extract-conclusions" | "draft-page";
}

export function maskApiKey(value: string): string {
  if (!value) return "";
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

