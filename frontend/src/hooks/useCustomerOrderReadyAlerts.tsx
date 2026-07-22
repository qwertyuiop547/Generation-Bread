"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { withWsToken } from "@/lib/authHeaders";
import {
  areOrderAlertsEnabled,
  notifyOrderReady,
  registerOrderAlertServiceWorker,
} from "@/lib/orderReadyAlerts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Keeps a customer WebSocket open app-wide so ready alerts (vibrate + notification)
 * still fire on dashboard / order / track / profile.
 */
export function useCustomerOrderReadyAlerts() {
  const { user, isLoggedIn, isStaff, isAdmin, isAuthLoading } = useAuth();
  const enabled = isLoggedIn && !isAuthLoading && !!user?.email && !isStaff && !isAdmin;

  useEffect(() => {
    if (!enabled) return;
    if (areOrderAlertsEnabled()) {
      void registerOrderAlertServiceWorker();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !user?.email) return;

    let ws: WebSocket | null = null;
    let reconnectId: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;
    let attempt = 0;

    const connect = () => {
      if (closedByCleanup) return;
      const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
      const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
      const wsUrl = withWsToken(
        `${wsProtocol}${wsHost}/ws/orders/${encodeURIComponent(user.email)}/`
      );

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "order_status_update") return;
          void notifyOrderReady(data.order_id, data.status);
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = () => {
        if (closedByCleanup) return;
        const delay = Math.min(12000, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectId = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectId) clearTimeout(reconnectId);
      if (!ws) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws?.close();
        return;
      }
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [enabled, user?.email]);
}

/** Mount-once wrapper for Providers. */
export function CustomerOrderReadyAlerts() {
  useCustomerOrderReadyAlerts();
  return null;
}
