"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/authHeaders";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface ForecastDay {
  date: string;
  weekday: string;
  expected_orders: number;
  based_on_days: number;
  top_items: { name: string; expected_qty: number }[];
}

interface ForecastPayload {
  method: string;
  history_days: number;
  seasonal_note: string;
  daily: ForecastDay;
  weekly: { expected_orders: number; days: ForecastDay[] };
  staffing: { summary: string; tomorrow: { baristas: number; cashiers: number } };
  inventory: { name: string; on_hand: number; expected_tomorrow: number; note: string }[];
}

export default function DemandForecastPanel({ email }: { email?: string }) {
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/api/auth/admin/forecast/?admin_email=${encodeURIComponent(email)}`
        );
        if (!res.ok) throw new Error("Forecast is not available yet.");
        const body = (await res.json()) as ForecastPayload;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Forecast failed.");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [email]);

  if (error) {
    return (
      <section className="mb-8 rounded-3xl border border-[#EBE3D7] bg-[#FFFDF9] p-5 text-sm text-[#2A1810]/60">
        {error}
      </section>
    );
  }
  if (!data) {
    return (
      <section className="mb-8 rounded-3xl border border-[#EBE3D7] bg-[#FFFDF9] p-5 text-sm text-[#2A1810]/50">
        Preparing the demand forecast...
      </section>
    );
  }

  const maxOrders = Math.max(1, ...data.weekly.days.map((day) => day.expected_orders));

  return (
    <section className="mb-8 rounded-3xl border border-[#EBE3D7] bg-[#FFFDF9] p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#A26833]">Demand forecast</p>
          <h2 className="text-2xl font-black uppercase tracking-tight text-[#2A1810]">Tomorrow and this week</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#2A1810]/60">{data.method}</p>
        </div>
        <p className="text-xs text-[#2A1810]/45">{data.history_days} days of completed orders</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-[#2A1810] p-5 text-[#FAEADE]">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#E3A458]">Daily</p>
          <p className="mt-2 text-4xl font-black">{data.daily.expected_orders}</p>
          <p className="mt-1 text-sm">expected orders on {data.daily.weekday}</p>
          <p className="mt-3 text-xs text-[#FAEADE]/70">
            Based on {data.daily.based_on_days || "overall"} past {data.daily.weekday}
            {data.daily.based_on_days === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="rounded-2xl border border-[#EBE3D7] bg-[#FAF6F0] p-5">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">Weekly</p>
          <p className="mt-2 text-4xl font-black text-[#2A1810]">{data.weekly.expected_orders}</p>
          <p className="mt-1 text-sm text-[#2A1810]/70">expected orders over the next 7 days</p>
        </div>
        <div className="rounded-2xl border border-[#EBE3D7] p-5">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">Staffing recommendation</p>
          <p className="mt-3 text-sm leading-relaxed text-[#2A1810]">{data.staffing.summary}</p>
          <p className="mt-3 text-sm font-bold text-[#A26833]">
            {data.staffing.tomorrow.baristas} barista{data.staffing.tomorrow.baristas === 1 ? "" : "s"} · {data.staffing.tomorrow.cashiers} cashier
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-2">
        {data.weekly.days.map((day) => (
          <div key={day.date} className="rounded-2xl bg-[#FAF6F0] px-2 py-3 text-center">
            <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/45">{day.weekday.slice(0, 3)}</p>
            <div className="mx-auto mt-2 flex h-16 w-3 items-end rounded-full bg-[#EBE3D7]">
              <div
                className="w-3 rounded-full bg-[#A26833]"
                style={{ height: `${Math.max(8, (day.expected_orders / maxOrders) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-black text-[#2A1810]">{day.expected_orders}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[#2A1810]/55">{data.seasonal_note}</p>

      {data.daily.top_items.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/45">Likely items tomorrow</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.daily.top_items.map((item) => (
              <span key={item.name} className="rounded-full bg-[#F5EFE6] px-3 py-1 text-xs font-bold text-[#2A1810]">
                {item.name} · {item.expected_qty}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.inventory.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">Inventory from this forecast</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-950">
            {data.inventory.map((item) => (
              <li key={item.name}>
                {item.name}: {item.on_hand} on hand, about {item.expected_tomorrow} expected. {item.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
