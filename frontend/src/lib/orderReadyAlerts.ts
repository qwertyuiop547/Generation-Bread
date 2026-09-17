/** Customer order-ready alerts: system notification + phone vibrate. */

const STORAGE_KEY = "gb_order_alerts_enabled";
const DEDUPE_PREFIX = "gb_alerted_order_";

export type OrderAlertStatus = "ready" | "completed" | "preparing" | "pending" | "cancelled";

export function areOrderAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setOrderAlertsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestOrderAlertPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if ("Notification" in window && Notification.permission === "default") {
    try {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        setOrderAlertsEnabled(false);
        return false;
      }
    } catch {
      // Some browsers throw if not triggered by a gesture
    }
  }

  setOrderAlertsEnabled(true);
  unlockOrderReadyVibrate();
  await registerOrderAlertServiceWorker();
  return true;
}

export async function registerOrderAlertServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw-order-alerts.js");
  } catch {
    return null;
  }
}

/** ~20s of repeating buzz/pause (Android Vibration API). */
const VIBRATE_READY_MS = 20_000;
const VIBRATE_CHUNK_MS = 4_000;

let vibrateRestartTimers: number[] = [];

function buildVibrateChunk(): number[] {
  // Short repeating chunk — some mobile browsers truncate very long patterns.
  return [450, 200, 450, 200, 450, 200, 450, 200, 450, 200, 450, 300];
}

export function stopOrderReadyVibrate(): void {
  if (typeof window !== "undefined") {
    for (const id of vibrateRestartTimers) window.clearTimeout(id);
  }
  vibrateRestartTimers = [];
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(0);
  } catch {
    // ignore
  }
}

/** Call from a user tap (Enable alerts) so Android allows later vibrate. */
export function unlockOrderReadyVibrate(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(30);
  } catch {
    // ignore
  }
}

function vibrateReadyPattern(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  stopOrderReadyVibrate();
  try {
    const bump = () => {
      try {
        navigator.vibrate(buildVibrateChunk());
      } catch {
        // ignore
      }
    };
    bump();
    const restarts = Math.ceil(VIBRATE_READY_MS / VIBRATE_CHUNK_MS) - 1;
    for (let i = 1; i <= restarts; i += 1) {
      vibrateRestartTimers.push(
        window.setTimeout(bump, i * VIBRATE_CHUNK_MS) as unknown as number
      );
    }
  } catch {
    // ignore
  }
}

function alreadyAlerted(orderKey: string, status: string): boolean {
  try {
    return sessionStorage.getItem(`${DEDUPE_PREFIX}${orderKey}:${status}`) === "1";
  } catch {
    return false;
  }
}

function markAlerted(orderKey: string, status: string): void {
  try {
    sessionStorage.setItem(`${DEDUPE_PREFIX}${orderKey}:${status}`, "1");
  } catch {
    // ignore
  }
}

function formatOrderLabel(orderId: number | string): string {
  if (typeof orderId === "string" && orderId.toUpperCase().startsWith("ORD-")) {
    return orderId.toUpperCase();
  }
  const n = typeof orderId === "number" ? orderId : parseInt(String(orderId).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return String(orderId);
  return `ORD-${String(n).padStart(4, "0")}`;
}

async function showSystemNotification(title: string, body: string, orderLabel: string): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: "/images/favicon-48.png",
    badge: "/images/favicon-32.png",
    tag: `order-ready-${orderLabel}`,
    renotify: true,
    requireInteraction: true,
    data: { url: `/track?order=${encodeURIComponent(orderLabel)}` },
  };

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // fall through to page Notification
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      window.location.href = `/track?order=${encodeURIComponent(orderLabel)}`;
      n.close();
    };
  } catch {
    // ignore
  }
}

function dispatchInAppBanner(title: string, body: string, orderLabel: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("gb:order-ready", {
      detail: { title, body, orderLabel },
    })
  );
}

/**
 * Fire vibrate + notification when an order becomes ready (or completed).
 * Safe to call from WebSocket handlers; dedupes per tab session.
 */
export async function notifyOrderReady(
  orderId: number | string,
  status: string,
  opts?: { force?: boolean }
): Promise<void> {
  if (typeof window === "undefined") return;
  const normalized = String(status || "").toLowerCase();
  if (normalized !== "ready" && normalized !== "completed") return;

  const orderLabel = formatOrderLabel(orderId);
  if (!opts?.force && alreadyAlerted(orderLabel, normalized)) return;
  markAlerted(orderLabel, normalized);

  const title =
    normalized === "ready" ? "Your order is ready!" : "Order completed";
  const body =
    normalized === "ready"
      ? `${orderLabel} is ready for pickup / serving. Tap to track.`
      : `${orderLabel} is done. Salamat!`;

  // Always vibrate when we can (even if notification permission denied) —
  // works best while the site tab is open on Android phones.
  vibrateReadyPattern();

  if (areOrderAlertsEnabled() || notificationPermission() === "granted") {
    await showSystemNotification(title, body, orderLabel);
  }

  dispatchInAppBanner(title, body, orderLabel);
}
