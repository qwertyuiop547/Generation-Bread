"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { authHeaders, getAccessToken, withWsToken } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import {
  areOrderAlertsEnabled,
  notifyOrderReady,
  registerOrderAlertServiceWorker,
} from "@/lib/orderReadyAlerts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export type CustomerOrderStatusEvent = {
  type: "order_status_update" | "order_payment_update";
  order_id: number;
  status?: string;
  payment_method?: string;
  payment_status?: string;
  rating?: number | null;
};

function dispatchOrderEvent(detail: CustomerOrderStatusEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("gb:order-status", { detail }));
}

/**
 * Keeps a customer WebSocket open app-wide + HTTP poll fallback so order status
 * and ready alerts (vibrate + notification) work on mobile even if WS drops.
 */
export function useCustomerOrderReadyAlerts() {
  const { user, accessToken, isLoggedIn, isStaff, isAdmin, isAuthLoading } = useAuth();
  const enabled =
    isLoggedIn && !isAuthLoading && !!user?.email && !isStaff && !isAdmin && !!accessToken;
  const lastStatusRef = useRef<Record<string, string>>({});

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
    let pollId: ReturnType<typeof setInterval> | null = null;
    let closedByCleanup = false;
    let attempt = 0;

    const handlePayload = (data: CustomerOrderStatusEvent) => {
      if (!data?.order_id) return;
      dispatchOrderEvent(data);
      if (data.type === "order_status_update" && data.status) {
        const key = String(data.order_id);
        lastStatusRef.current[key] = data.status;
        void notifyOrderReady(data.order_id, data.status);
      }
    };

    const pollOrders = async () => {
      if (!getAccessToken()) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/orders/?limit=30`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const rows = unwrapListResponse<{
          id: number;
          status: string;
          payment_method?: string;
          payment_status?: string;
          rating?: number | null;
        }>(await res.json());

        for (const order of rows) {
          const key = String(order.id);
          const prev = lastStatusRef.current[key];
          if (prev && prev !== order.status) {
            handlePayload({
              type: "order_status_update",
              order_id: order.id,
              status: order.status,
              rating: order.rating ?? null,
            });
          } else if (!prev) {
            // Seed without alerting on first sight of existing orders.
            lastStatusRef.current[key] = order.status;
          }
        }
      } catch {
        // ignore transient network errors
      }
    };

    const connect = () => {
      if (closedByCleanup) return;
      if (!getAccessToken()) {
        return;
      }

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
          const data = JSON.parse(event.data) as CustomerOrderStatusEvent;
          if (data.type !== "order_status_update" && data.type !== "order_payment_update") {
            return;
          }
          handlePayload(data);
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

    void pollOrders();
    pollId = setInterval(() => void pollOrders(), 10000);
    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectId) clearTimeout(reconnectId);
      if (pollId) clearInterval(pollId);
      if (!ws) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws?.close();
        return;
      }
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [enabled, user?.email, accessToken]);
}

/** Mount-once wrapper for Providers. */
export function CustomerOrderReadyAlerts() {
  useCustomerOrderReadyAlerts();
  return null;
}
