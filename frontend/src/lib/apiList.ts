/** Normalize list API payloads that may be a bare array or `{ results: [...] }`. */
export function unwrapListResponse<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: T[] }).results;
  }
  return [];
}
