"use client";

import { useEffect, useRef } from "react";
import { withWsToken } from "@/lib/authHeaders";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Realtime kitchen board: new orders + status changes without refresh.
 * Falls back to a slow poll if the WebSocket drops.
 */
export function useStaffOrdersRealtime(enabled: boolean, onEvent: () => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let reconnectId: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;
    let attempt = 0;

    const refresh = () => {
      onEventRef.current();
    };

    const startPollFallback = () => {
      if (pollId) return;
      pollId = setInterval(refresh, 15000);
    };

    const stopPollFallback = () => {
      if (!pollId) return;
      clearInterval(pollId);
      pollId = null;
    };

    const connect = () => {
      if (closedByCleanup) return;

      const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
      const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
      const wsUrl = withWsToken(`${wsProtocol}${wsHost}/ws/staff-orders/`);

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        startPollFallback();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        stopPollFallback();
        refresh();
      };

      ws.onmessage = () => {
        refresh();
      };

      ws.onerror = () => {
        // onclose will handle reconnect / fallback
      };

      ws.onclose = () => {
        if (closedByCleanup) return;
        startPollFallback();
        const delay = Math.min(10000, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectId = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      stopPollFallback();
      if (reconnectId) clearTimeout(reconnectId);
      if (!ws) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws?.close();
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [enabled]);
}
