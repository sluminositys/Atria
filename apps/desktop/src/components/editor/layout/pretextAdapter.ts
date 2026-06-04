type PretextModule = Record<string, unknown>;

let cachedPretext: Promise<PretextModule | null> | null = null;

export function loadPretext(): Promise<PretextModule | null> {
  cachedPretext ??= importOptionalPretext();
  return cachedPretext;
}

async function importOptionalPretext(): Promise<PretextModule | null> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<PretextModule>;
    return await dynamicImport("@chenglou/pretext");
  } catch {
    return null;
  }
}
