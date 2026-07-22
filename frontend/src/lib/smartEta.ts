export interface SmartEta {
  status: string;
  eta_seconds: number;
  eta_min_minutes: number;
  eta_max_minutes: number;
  eta_label: string;
  message: string;
  queue_ahead: number;
  /** 1-based spot in line (0 when ready / cancelled). */
  queue_position?: number;
  item_units: number;
  source: "historical" | "default" | string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export function getQueuePosition(eta: SmartEta | null | undefined): number {
  if (!eta) return 0;
  if (typeof eta.queue_position === "number" && eta.queue_position > 0) {
    return eta.queue_position;
  }
  if (eta.status === "ready" || eta.status === "completed" || eta.status === "cancelled") {
    return 0;
  }
  return Math.max(0, (eta.queue_ahead ?? 0) + 1);
}

/** Short badge text, e.g. "#3 in line" or "Next up". */
export function formatQueuePositionShort(eta: SmartEta | null | undefined): string | null {
  if (!eta) return null;
  if (eta.status === "ready" || eta.status === "completed") return null;
  if (eta.status === "cancelled") return null;

  const position = getQueuePosition(eta);
  if (eta.status === "preparing" && (eta.queue_ahead ?? 0) === 0) {
    return "Preparing now";
  }
  if (position <= 1) return "Next in line";
  return `#${position} in line`;
}

/** Full sentence for customers. */
export function formatQueuePositionDisplay(eta: SmartEta | null | undefined): string | null {
  if (!eta) return null;
  if (eta.status === "ready" || eta.status === "completed" || eta.status === "cancelled") {
    return null;
  }
  if (eta.message && /in line|preparing|next/i.test(eta.message)) {
    return eta.message;
  }
  const position = getQueuePosition(eta);
  const ahead = eta.queue_ahead ?? Math.max(0, position - 1);
  if (eta.status === "preparing" && ahead === 0) {
    return "You're up — we're preparing your order now.";
  }
  if (position <= 1) return "You're next in line.";
  if (ahead === 1) return "You're #2 in line — 1 order ahead.";
  return `You're #${position} in line — ${ahead} orders ahead.`;
}

export function formatSmartEtaDisplay(eta: SmartEta | null): string {
  if (!eta) return "~10–15 mins";
  if (eta.status === "ready" || eta.status === "completed") return "Ready now";
  if (eta.status === "cancelled") return "Cancelled";
  return eta.eta_label;
}

export async function fetchOrderEta(orderId: number | string): Promise<SmartEta | null> {
  const numericId =
    typeof orderId === "number"
      ? orderId
      : parseInt(String(orderId).replace(/^ORD-/i, ""), 10);

  if (Number.isNaN(numericId)) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/orders/${numericId}/eta/`);
    if (!res.ok) return null;
    return (await res.json()) as SmartEta;
  } catch {
    return null;
  }
}

export async function fetchEtaPreview(itemCount: number): Promise<SmartEta | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/auth/eta/preview/?item_count=${Math.max(1, itemCount)}`
    );
    if (!res.ok) return null;
    return (await res.json()) as SmartEta;
  } catch {
    return null;
  }
}

export function localFallbackEta(itemCount: number): SmartEta {
  const base = 600 + Math.max(0, itemCount - 1) * 60;
  const minMinutes = Math.max(3, Math.round((base * 0.85) / 60));
  const maxMinutes = Math.max(minMinutes, Math.round((base * 1.15) / 60));
  return {
    status: "preview",
    eta_seconds: base,
    eta_min_minutes: minMinutes,
    eta_max_minutes: maxMinutes,
    eta_label: minMinutes === maxMinutes ? `~${minMinutes} min` : `~${minMinutes}–${maxMinutes} mins`,
    message: "Estimated wait based on your order size.",
    queue_ahead: 0,
    queue_position: 1,
    item_units: itemCount,
    source: "default",
  };
}
