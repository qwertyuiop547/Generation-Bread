/** Authenticated fetch with JWT + single-flight refresh on 401. */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("spylt_access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("spylt_refresh_token");
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

function headersToRecord(extra?: HeadersInit): Record<string, string> {
  const base: Record<string, string> = {};
  if (!extra) return base;
  if (extra instanceof Headers) {
    extra.forEach((v, k) => {
      base[k] = v;
    });
  } else if (Array.isArray(extra)) {
    for (const [k, v] of extra) base[k] = v;
  } else {
    Object.assign(base, extra);
  }
  return base;
}

let refreshInFlight: Promise<boolean> | null = null;

type TokenListener = (access: string | null, refresh: string | null) => void;
const tokenListeners = new Set<TokenListener>();

/** AuthContext registers here so silent refreshes keep React state in sync. */
export function subscribeAuthTokens(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

function notifyTokenListeners(access: string | null, refresh: string | null) {
  tokenListeners.forEach((listener) => {
    try {
      listener(access, refresh);
    } catch {
      /* ignore listener errors */
    }
  });
}

/** Refresh access JWT. Shared by AuthContext + authFetch. */
export async function refreshAccessTokenShared(
  onTokens?: (access: string | null, refresh: string | null) => void
): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const refresh = getRefreshToken();
  if (!refresh) {
    onTokens?.(null, null);
    notifyTokenListeners(null, null);
    return false;
  }

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        localStorage.removeItem("spylt_access_token");
        localStorage.removeItem("spylt_refresh_token");
        onTokens?.(null, null);
        notifyTokenListeners(null, null);
        return false;
      }

      const data = await res.json();
      localStorage.setItem("spylt_access_token", data.access);
      const nextRefresh = data.refresh || refresh;
      if (data.refresh) {
        localStorage.setItem("spylt_refresh_token", data.refresh);
      }
      onTokens?.(data.access, nextRefresh);
      notifyTokenListeners(data.access, nextRefresh);
      return true;
    } catch {
      localStorage.removeItem("spylt_access_token");
      localStorage.removeItem("spylt_refresh_token");
      onTokens?.(null, null);
      notifyTokenListeners(null, null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Drop-in replacement for fetch() on authenticated API routes.
 * Always attaches Bearer token; refreshes once on 401.
 * Safe with FormData (does not force Content-Type).
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = headersToRecord(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (isFormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessTokenShared();
    if (refreshed) {
      const newToken = getAccessToken();
      if (newToken) headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    }
  }

  return response;
}
