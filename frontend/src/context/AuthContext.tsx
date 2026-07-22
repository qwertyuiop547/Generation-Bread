"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useSession } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export interface User {
  name: string;
  email: string;
  role: "user" | "staff" | "admin";
  image?: string;
  provider?: "local" | "google";
}

export type AuthResult = { ok: true } | { ok: false; error: string };

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => void;
  updateUser: (updates: Partial<Pick<User, "name" | "image">>) => void;
  changePassword: (currentPassword: string, newPassword: string) => boolean;
  refreshAccessToken: () => Promise<boolean>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoggedIn: false,
  isAuthLoading: true,
  isAdmin: false,
  isStaff: false,
  login: async () => ({ ok: false, error: "Not ready." }),
  register: async () => ({ ok: false, error: "Not ready." }),
  logout: () => {},
  updateUser: () => {},
  changePassword: () => false,
  refreshAccessToken: async () => false,
  apiFetch: async () => new Response(),
});

export const useAuth = () => useContext(AuthContext);

function rememberLocalUser(entry: {
  name: string;
  email: string;
  password?: string;
  role?: string;
  provider?: string;
}) {
  const usersRaw = localStorage.getItem("spylt_users") || "[]";
  const users = JSON.parse(usersRaw) as Array<Record<string, string>>;
  const idx = users.findIndex((u) => u.email === entry.email);
  const next = {
    name: entry.name,
    email: entry.email,
    password: entry.password ?? "",
    role: entry.role ?? "user",
    provider: entry.provider ?? "local",
  };
  if (idx === -1) users.push(next);
  else users[idx] = { ...users[idx], ...next };
  localStorage.setItem("spylt_users", JSON.stringify(users));
}

function findLegacyLocalAccount(email: string, password: string) {
  try {
    const usersRaw = localStorage.getItem("spylt_users") || "[]";
    const users = JSON.parse(usersRaw) as Array<{
      email?: string;
      password?: string;
      name?: string;
      provider?: string;
    }>;
    return (
      users.find(
        (u) =>
          u.email?.toLowerCase() === email.toLowerCase() &&
          u.password === password &&
          u.provider !== "google"
      ) || null
    );
  } catch {
    return null;
  }
}

async function parseErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.detail === "string") return data.detail;
    if (data?.email?.[0]) return String(data.email[0]);
    if (data?.password?.[0]) return String(data.password[0]);
    if (data?.name?.[0]) return String(data.name[0]);
  } catch {
    /* ignore */
  }
  if (res.status === 429) {
    return "Too many login attempts. Please wait a minute and try again.";
  }
  return fallback;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const { data: session, status } = useSession();

  const [localResolved, setLocalResolved] = useState(false);

  useEffect(() => {
    setMounted(true);

    const storedAccess = localStorage.getItem("spylt_access_token");
    const storedRefresh = localStorage.getItem("spylt_refresh_token");
    const storedUser = localStorage.getItem("spylt_user");

    if (storedAccess && storedRefresh && storedUser) {
      try {
        setAccessToken(storedAccess);
        setRefreshToken(storedRefresh);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("spylt_access_token");
        localStorage.removeItem("spylt_refresh_token");
        localStorage.removeItem("spylt_user");
      }
    }
    setLocalResolved(true);
  }, []);

  // Sync Google OAuth session → local user state and handle loading
  useEffect(() => {
    if (!localResolved) return;

    if (status === "loading") {
      setIsAuthLoading(true);
      return;
    }

    setIsAuthLoading(false);

    // Never override an existing email/password session with Google.
    if (user?.provider === "local" && accessToken) return;

    if (status === "authenticated" && session?.user && !user) {
      const googleUser: User = {
        name: session.user.name || "Google User",
        email: session.user.email || "",
        role: "user",
        image: session.user.image || undefined,
        provider: "google",
      };

      const usersRaw = localStorage.getItem("spylt_users") || "[]";
      const users = JSON.parse(usersRaw);
      const existing = users.find((u: { email: string }) => u.email === googleUser.email);
      if (existing?.role === "admin") {
        googleUser.role = "admin";
      }

      if (!existing) {
        users.push({
          name: googleUser.name,
          email: googleUser.email,
          password: "",
          role: "user",
          provider: "google",
        });
        localStorage.setItem("spylt_users", JSON.stringify(users));
      }

      setUser(googleUser);
      localStorage.setItem("spylt_user", JSON.stringify(googleUser));
    }
  }, [status, session, user, localResolved, accessToken]);

  // Mint Django JWTs for Google NextAuth sessions (needed for cart/orders API).
  useEffect(() => {
    if (!localResolved || status !== "authenticated" || !session?.user?.email) {
      return;
    }
    if (user?.provider === "local") return;
    if (accessToken || localStorage.getItem("spylt_access_token")) {
      return;
    }

    let cancelled = false;

    const exchangeGoogleJwt = async () => {
      try {
        const res = await fetch("/api/auth/django-jwt", { method: "POST" });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (!data.access || !data.refresh || cancelled) return;

        setAccessToken(data.access);
        setRefreshToken(data.refresh);
        localStorage.setItem("spylt_access_token", data.access);
        localStorage.setItem("spylt_refresh_token", data.refresh);

        const userData: User = {
          name: data.user?.name || session.user?.name || "Google User",
          email: data.user?.email || session.user?.email || "",
          role: (data.user?.role as User["role"]) || "user",
          image: session.user?.image || undefined,
          provider: "google",
        };
        setUser(userData);
        localStorage.setItem("spylt_user", JSON.stringify(userData));
      } catch {
        /* Cart/orders stay local until bridge succeeds on a later retry. */
      }
    };

    void exchangeGoogleJwt();
    return () => {
      cancelled = true;
    };
  }, [status, session, localResolved, accessToken, user?.provider]);

  const applyJwtSession = (data: {
    access: string;
    refresh: string;
    user: { name: string; email: string; role: string };
  }) => {
    setAccessToken(data.access);
    setRefreshToken(data.refresh);

    const userData: User = {
      name: data.user.name,
      email: data.user.email,
      role: data.user.role as User["role"],
      provider: "local",
    };
    setUser(userData);

    localStorage.setItem("spylt_access_token", data.access);
    localStorage.setItem("spylt_refresh_token", data.refresh);
    localStorage.setItem("spylt_user", JSON.stringify(userData));
  };

  const jwtLoginRequest = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/jwt/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res;
  };

  const migrateLegacyAccount = async (email: string, password: string, name: string) => {
    const reg = await fetch(`${API_BASE_URL}/api/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (reg.status === 201) {
      const data = await reg.json().catch(() => ({}));
      if (data.demo_code) {
        await fetch(`${API_BASE_URL}/api/auth/verify-email/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: data.demo_code }),
        });
      }
      return true;
    }

    // Account already on server — cannot reclaim with a different password.
    return false;
  };

  const register = async (name: string, email: string, password: string): Promise<AuthResult> => {
    try {
      if (password.length < 10) {
        return { ok: false, error: "Password must be at least 10 characters." };
      }

      const res = await fetch(`${API_BASE_URL}/api/auth/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        return {
          ok: false,
          error: await parseErrorMessage(res, "Could not create account."),
        };
      }

      const data = await res.json().catch(() => ({}));
      if (data.demo_code) {
        await fetch(`${API_BASE_URL}/api/auth/verify-email/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: data.demo_code }),
        });
      }

      const loginRes = await jwtLoginRequest(email, password);
      if (!loginRes.ok) {
        return {
          ok: false,
          error: await parseErrorMessage(
            loginRes,
            "Account created, but sign-in failed. Try logging in."
          ),
        };
      }

      const loginData = await loginRes.json();
      applyJwtSession(loginData);
      rememberLocalUser({ name, email, password, role: loginData.user?.role, provider: "local" });
      return { ok: true };
    } catch {
      return {
        ok: false,
        error:
          "Unable to reach the server. Check your connection, wait a few seconds if the API is waking up, then try again.",
      };
    }
  };

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      let res = await jwtLoginRequest(email, password);

      if (res.ok) {
        const data = await res.json();
        applyJwtSession(data);
        rememberLocalUser({
          name: data.user.name,
          email: data.user.email,
          password,
          role: data.user.role,
          provider: "local",
        });
        return { ok: true };
      }

      if (res.status === 429) {
        return {
          ok: false,
          error: await parseErrorMessage(
            res,
            "Too many login attempts. Please wait a minute and try again."
          ),
        };
      }

      // Migrate accounts that were previously saved only in localStorage.
      const legacy = findLegacyLocalAccount(email, password);
      if (legacy) {
        const migrated = await migrateLegacyAccount(
          email,
          password,
          legacy.name || email.split("@")[0] || "Customer"
        );
        if (migrated) {
          res = await jwtLoginRequest(email, password);
          if (res.ok) {
            const data = await res.json();
            applyJwtSession(data);
            return { ok: true };
          }
        }
      }

      return {
        ok: false,
        error: await parseErrorMessage(res, "Invalid email or password."),
      };
    } catch {
      return {
        ok: false,
        error:
          "Unable to reach the server. Check your connection, wait a few seconds if the API is waking up, then try again.",
      };
    }
  };

  const updateUser = (updates: Partial<Pick<User, "name" | "image">>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem("spylt_user", JSON.stringify(updatedUser));

    const usersRaw = localStorage.getItem("spylt_users") || "[]";
    const users = JSON.parse(usersRaw);
    const idx = users.findIndex((u: { email: string }) => u.email === user.email);
    if (idx !== -1) {
      if (updates.name) users[idx].name = updates.name;
      if (updates.image) users[idx].image = updates.image;
      localStorage.setItem("spylt_users", JSON.stringify(users));
    }
  };

  const changePassword = (currentPassword: string, newPassword: string): boolean => {
    if (!user) return false;
    const usersRaw = localStorage.getItem("spylt_users") || "[]";
    const users = JSON.parse(usersRaw);
    const idx = users.findIndex(
      (u: { email: string; password: string }) =>
        u.email === user.email && u.password === currentPassword
    );
    if (idx === -1) return false;
    users[idx].password = newPassword;
    localStorage.setItem("spylt_users", JSON.stringify(users));
    return true;
  };

  const logout = () => {
    const refresh =
      refreshToken ||
      (typeof window !== "undefined" ? localStorage.getItem("spylt_refresh_token") : null);
    if (refresh) {
      fetch(`${API_BASE_URL}/api/auth/logout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      }).catch(() => {});
    }
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem("spylt_user");
    localStorage.removeItem("spylt_access_token");
    localStorage.removeItem("spylt_refresh_token");
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    const refresh =
      refreshToken ||
      (typeof window !== "undefined" ? localStorage.getItem("spylt_refresh_token") : null);
    if (!refresh) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        // Drop dead JWTs but keep the local user session so checkout can continue
        // via email/AllowAny fallback instead of kicking them to login mid-order.
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem("spylt_access_token");
        localStorage.removeItem("spylt_refresh_token");
        return false;
      }

      const data = await res.json();
      setAccessToken(data.access);
      localStorage.setItem("spylt_access_token", data.access);
      if (data.refresh) {
        setRefreshToken(data.refresh);
        localStorage.setItem("spylt_refresh_token", data.refresh);
      }
      return true;
    } catch {
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem("spylt_access_token");
      localStorage.removeItem("spylt_refresh_token");
      return false;
    }
  };

  const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };

    const token =
      accessToken ||
      (typeof window !== "undefined" ? localStorage.getItem("spylt_access_token") : null);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && refreshToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        const newToken = localStorage.getItem("spylt_access_token");
        if (newToken) {
          headers["Authorization"] = `Bearer ${newToken}`;
        }
        response = await fetch(url, {
          ...options,
          headers,
        });
      }
    }

    return response;
  };

  if (!mounted) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          accessToken: null,
          refreshToken: null,
          isLoggedIn: false,
          isAuthLoading: true,
          isAdmin: false,
          isStaff: false,
          login: async () => ({ ok: false, error: "Not ready." }),
          register: async () => ({ ok: false, error: "Not ready." }),
          logout: () => {},
          updateUser: () => {},
          changePassword: () => false,
          refreshAccessToken: async () => false,
          apiFetch: async () => new Response(null, { status: 503 }),
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        isLoggedIn: !!user,
        isAuthLoading,
        isAdmin: user?.role === "admin",
        isStaff: user?.role === "staff" || user?.role === "admin",
        login,
        register,
        logout,
        updateUser,
        changePassword,
        refreshAccessToken,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
