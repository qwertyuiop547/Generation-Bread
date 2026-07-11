/** Auth helpers for API + WebSocket calls. */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("spylt_access_token");
}

export function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getAccessToken();
  const base: Record<string, string> = {};
  if (extra instanceof Headers) {
    extra.forEach((v, k) => {
      base[k] = v;
    });
  } else if (Array.isArray(extra)) {
    for (const [k, v] of extra) base[k] = v;
  } else if (extra) {
    Object.assign(base, extra);
  }
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

/** Append JWT to a WebSocket URL as ?token= */
export function withWsToken(wsUrl: string, token?: string | null): string {
  const t = token ?? getAccessToken();
  if (!t) return wsUrl;
  const sep = wsUrl.includes("?") ? "&" : "?";
  return `${wsUrl}${sep}token=${encodeURIComponent(t)}`;
}
