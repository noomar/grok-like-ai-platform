export type RequiredKey = "OPENAI_API_KEY" | "SHOTSTACK_API_KEY" | "BLOB_READ_WRITE_TOKEN" | "ELEVENLABS_API_KEY";

export function hasKey(key: RequiredKey): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

export function getKey(key: RequiredKey): string | null {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function missingKeys(keys: RequiredKey[]): RequiredKey[] {
  return keys.filter((k) => !hasKey(k));
}
