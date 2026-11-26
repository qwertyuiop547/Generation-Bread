export function paymentLabel(method?: string | null): string {
  switch ((method || "").toLowerCase()) {
    case "cash":
      return "Cash";
    case "gcash":
      return "GCash";
    case "gotyme":
      return "GoTyme";
    case "card":
      return "Card";
    default:
      return "Not chosen";
  }
}

export function paymentBadgeClass(method?: string | null, paid?: boolean): string {
  const key = (method || "").toLowerCase();
  if (!key) return "bg-[#2A1810]/5 text-[#2A1810]/55 border-[#2A1810]/10";
  if (paid) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (key === "gcash") return "bg-blue-50 text-blue-800 border-blue-200";
  if (key === "gotyme") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (key === "card") return "bg-slate-100 text-slate-800 border-slate-200";
  return "bg-amber-50 text-amber-900 border-amber-200";
}
