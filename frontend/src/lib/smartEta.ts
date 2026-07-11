export interface SmartEta {
  status: string;
  eta_seconds: number;
  eta_min_minutes: number;
  eta_max_minutes: number;
  eta_label: string;
  message: string;
  queue_ahead: number;
  item_units: number;
  source: "historical" | "default" | string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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
    item_units: itemCount,
    source: "default",
  };
}
