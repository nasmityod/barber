export type JsonObject = Record<string, unknown>;

export async function readJsonObject(response: Response): Promise<JsonObject> {
  const value: unknown = await response.json();
  if (!isJsonObject(value)) throw new Error("El servidor devolvió una respuesta no válida.");
  return value;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiError(payload: JsonObject, fallback: string) {
  return typeof payload.error === "string" ? payload.error : fallback;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
