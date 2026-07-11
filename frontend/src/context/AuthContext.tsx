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

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => boolean;
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
  login: async () => false,
  register: () => false,
  logout: () => {},
  updateUser: () => {},
  changePassword: () => false,
  refreshAccessToken: async () => false,
  apiFetch: async () => new Response(),
});

export const useAuth = () => useContext(AuthContext);

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

    // Check localStorage for JWT tokens
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
    // Don't resolve auth loading until localStorage has been checked
    if (!localResolved) return;

    if (status === "loading") {
      setIsAuthLoading(true);
      return;
    }
    
    // Both localStorage and session are resolved — auth loading is done
    setIsAuthLoading(false);

    if (status === "authenticated" && session?.user && !user) {
      const googleUser: User = {
        name: session.user.name || "Google User",
        email: session.user.email || "",
        role: "user",
        image: session.user.image || undefined,
        provider: "google",
      };

      // Check if this Google email is an admin
      const usersRaw = localStorage.getItem("spylt_users") || "[]";
      const users = JSON.parse(usersRaw);
      const existing = users.find((u: { email: string }) => u.email === googleUser.email);
      if (existing?.role === "admin") {
        googleUser.role = "admin";
      }

      // Save Google user to registered users list (if not already)
      if (!existing) {
        users.push({ name: googleUser.name, email: googleUser.email, password: "", role: "user", provider: "google" });
        localStorage.setItem("spylt_users", JSON.stringify(users));
      }

      setUser(googleUser);
      localStorage.setItem("spylt_user", JSON.stringify(googleUser));
    }
  }, [status, session, user, localResolved]);

  const register = (name: string, email: string, password: string): boolean => {
    const usersRaw = localStorage.getItem("spylt_users") || "[]";
    const users = JSON.parse(usersRaw);

    const exists = users.find((u: { email: string }) => u.email === email);
    if (exists) return false;

    users.push({ name, email, password, role: "user" });
    localStorage.setItem("spylt_users", JSON.stringify(users));

    const userData: User = { name, email, role: "user", provider: "local" };
    setUser(userData);
    localStorage.setItem("spylt_user", JSON.stringify(userData));
    return true;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/jwt/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      
      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      
      const userData: User = {
        name: data.user.name,
        email: data.user.email,
        role: data.user.role as "user" | "staff" | "admin",
        provider: "local",
      };
      setUser(userData);
      
      localStorage.setItem("spylt_access_token", data.access);
      localStorage.setItem("spylt_refresh_token", data.refresh);
      localStorage.setItem("spylt_user", JSON.stringify(userData));
      
      return true;
    } catch {
      return false;
    }
  };

  const updateUser = (updates: Partial<Pick<User, "name" | "image">>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem("spylt_user", JSON.stringify(updatedUser));

    // Also update the registered users list
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
      (u: { email: string; password: string }) => u.email === user.email && u.password === currentPassword
    );
    if (idx === -1) return false;
    users[idx].password = newPassword;
    localStorage.setItem("spylt_users", JSON.stringify(users));
    return true;
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem("spylt_user");
    localStorage.removeItem("spylt_access_token");
    localStorage.removeItem("spylt_refresh_token");
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken) return false;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!res.ok) {
        logout();
        return false;
      }

      const data = await res.json();
      setAccessToken(data.access);
      localStorage.setItem("spylt_access_token", data.access);
      return true;
    } catch {
      logout();
      return false;
    }
  };

  const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };

    const token = accessToken || (typeof window !== "undefined" ? localStorage.getItem("spylt_access_token") : null);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let response = await fetch(url, {
      ...options,
      headers,
    });

    // If 401 Unauthorized, try to refresh token
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

  if (!mounted) return null;

  return (
    <AuthContext.Provider value={{ user, accessToken, refreshToken, isLoggedIn: !!user, isAuthLoading, isAdmin: user?.role === "admin", isStaff: user?.role === "staff" || user?.role === "admin", login, register, logout, updateUser, changePassword, refreshAccessToken, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
};
