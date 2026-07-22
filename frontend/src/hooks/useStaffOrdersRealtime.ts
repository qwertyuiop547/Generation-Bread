"use client";

import { useEffect, useRef } from "react";
import { getAccessToken, withWsToken } from "@/lib/authHeaders";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Realtime kitchen board: new orders + status changes without refresh.
 * Keeps a slow safety poll even while the WebSocket is open (missed broadcasts).
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

    const startPoll = (ms: number) => {
      if (pollId) clearInterval(pollId);
      pollId = setInterval(refresh, ms);
    };

    const stopPoll = () => {
      if (!pollId) return;
      clearInterval(pollId);
      pollId = null;
    };

    // Always fetch once on mount, even before WS connects.
    refresh();
    startPoll(20000);

    const connect = () => {
      if (closedByCleanup) return;
      if (!getAccessToken()) {
        startPoll(12000);
        return;
      }

      const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
      const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
      const wsUrl = withWsToken(`${wsProtocol}${wsHost}/ws/staff-orders/`);

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        startPoll(12000);
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        // Keep a slower safety poll in case channel broadcasts are missed.
        startPoll(25000);
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
        startPoll(12000);
        const delay = Math.min(10000, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectId = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      stopPoll();
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
