"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authHeaders } from "@/lib/authHeaders";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const TOTAL_TABLES = 10;
const POLL_MS = 8000;

interface TableInfo {
  table_number: string;
  table_status: "free" | "ordering" | "occupied";
  order_status: string | null;
  order_id: number | null;
  customer_name: string | null;
  total_price: string | null;
  created_at: string | null;
  items_count: number | null;
}

interface Summary { total: number; free: number; ordering: number; occupied: number; }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; glow: string; icon: string }> = {
  free:     { label: "Free",     color: "#22c55e", bg: "rgba(34,197,94,0.12)",  glow: "0 0 24px rgba(34,197,94,0.25)",  icon: "✓" },
  ordering: { label: "Ordering", color: "#eab308", bg: "rgba(234,179,8,0.12)",  glow: "0 0 24px rgba(234,179,8,0.25)",  icon: "🛒" },
  occupied: { label: "Occupied", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  glow: "0 0 24px rgba(239,68,68,0.25)",  icon: "☕" },
};

export default function AdminTablesPage() {
  const { isLoggedIn, isAdmin, isStaff, user } = useAuth();
  const router = useRouter();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: TOTAL_TABLES, free: TOTAL_TABLES, ordering: 0, occupied: 0 });
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<TableInfo | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (mounted && !isLoggedIn) router.push("/");
    if (mounted && isLoggedIn && !isStaff) router.push("/dashboard");
  }, [mounted, isLoggedIn, isStaff, router]);

  const fetchTables = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API}/api/auth/admin/tables/?admin_email=${encodeURIComponent(user.email)}&total_tables=${TOTAL_TABLES}`);
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables);
        setSummary(data.summary);
        setLastUpdate(new Date());
      }
    } catch { /* silent */ }
  }, [user?.email]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff) return;
    fetchTables();
    const id = setInterval(fetchTables, POLL_MS);
    return () => clearInterval(id);
  }, [mounted, isLoggedIn, isStaff, fetchTables]);

  if (!mounted || !isLoggedIn || !isStaff) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  const timeSince = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="min-h-screen app-canvas relative overflow-hidden">
      {/* BG blobs */}
      <div className="absolute top-[-10%] right-[-15%] w-[45vw] h-[45vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-15" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-10" />

      {/* Header */}
      <div className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight">Floor Map</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell userEmail={user?.email} />
            <Link href="/admin" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Orders
            </Link>
            <Link href="/admin-dashboard" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Analytics
            </Link>
            <button onClick={() => { void performLogout(signOut); }} className="group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-10 py-8 md:py-12 relative z-10">
        {/* Title + live badge */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-dark-brown uppercase tracking-tighter">Table Status</h2>
            <p className="font-paragraph text-dark-brown/60 mt-1">Live floor map — auto-refreshes every {POLL_MS / 1000}s</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" /></span>
            <span className="font-paragraph text-dark-brown/50 text-xs">Updated {lastUpdate.toLocaleTimeString()}</span>
            <button onClick={fetchTables} className="ml-2 bg-white/60 hover:bg-white border border-white/60 text-dark-brown rounded-full p-2 transition-all hover:shadow-md" title="Refresh now">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {(["free", "ordering", "occupied"] as const).map(s => {
            const cfg = STATUS_CFG[s];
            return (
              <div key={s} className="app-panel border rounded-3xl p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1" style={{ borderLeft: `4px solid ${cfg.color}` }}>
                <p className="font-paragraph text-dark-brown/50 text-sm mb-1">{cfg.label}</p>
                <p className="text-3xl md:text-4xl font-bold text-dark-brown">{summary[s]}</p>
                <p className="font-paragraph text-dark-brown/40 text-xs mt-1">of {summary.total} tables</p>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6">
          {Object.entries(STATUS_CFG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full" style={{ background: cfg.color, boxShadow: cfg.glow }} />
              <span className="font-paragraph text-dark-brown/70 text-sm font-semibold">{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Floor Map Grid */}
        <div className="bg-white/40 backdrop-blur-sm border border-white/60 rounded-3xl p-6 md:p-8 shadow-lg mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight">🥐 Generation Bread — Floor Plan</h3>
            <span className="font-paragraph text-dark-brown/40 text-xs uppercase">Tap a table for details</span>
          </div>

          {/* Cafe layout - decorative top bar */}
          <div className="w-full h-3 bg-dark-brown/10 rounded-full mb-6 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-dark-brown/20 rounded-full" style={{ width: "30%" }} />
            <span className="absolute top-1/2 left-[15%] -translate-y-1/2 text-[8px] text-dark-brown/40 font-bold uppercase">Counter</span>
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-[8px] text-dark-brown/30 font-bold uppercase">Entrance →</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 md:gap-5">
            {tables.map(t => {
              const cfg = STATUS_CFG[t.table_status];
              const isSelected = selected?.table_number === t.table_number;
              return (
                <button
                  key={t.table_number}
                  onClick={() => setSelected(isSelected ? null : t)}
                  className="relative group rounded-2xl p-4 md:p-5 transition-all duration-300 cursor-pointer border-2 text-left"
                  style={{
                    background: isSelected ? cfg.bg : "rgba(255,255,255,0.5)",
                    borderColor: isSelected ? cfg.color : "rgba(255,255,255,0.6)",
                    boxShadow: isSelected ? cfg.glow : "0 4px 12px rgba(82,49,34,0.06)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.boxShadow = cfg.glow; e.currentTarget.style.transform = "translateY(-4px) scale(1.02)"; }}
                  onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(82,49,34,0.06)"; } e.currentTarget.style.transform = ""; }}
                >
                  {/* Pulse indicator for active tables */}
                  {t.table_status !== "free" && (
                    <span className="absolute top-3 right-3 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: cfg.color }} />
                      <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: cfg.color }} />
                    </span>
                  )}
                  {t.table_status === "free" && (
                    <span className="absolute top-3 right-3 w-3 h-3 rounded-full" style={{ background: cfg.color, opacity: 0.6 }} />
                  )}

                  {/* Table icon */}
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-xl md:text-2xl mb-3 transition-transform group-hover:scale-110" style={{ background: cfg.bg }}>
                    {cfg.icon}
                  </div>

                  <p className="text-lg md:text-xl font-bold text-dark-brown">T-{t.table_number}</p>
                  <p className="text-xs font-bold uppercase mt-1 tracking-wide" style={{ color: cfg.color }}>{cfg.label}</p>

                  {t.customer_name && (
                    <p className="font-paragraph text-dark-brown/50 text-xs mt-2 truncate">{t.customer_name}</p>
                  )}
                  {t.total_price && (
                    <p className="font-bold text-dark-brown/70 text-xs mt-0.5">₱{Number(t.total_price).toFixed(0)}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="app-panel border rounded-3xl p-6 md:p-8 shadow-lg transition-all animate-[fadeUp_0.3s_ease-out]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: STATUS_CFG[selected.table_status].bg }}>
                  {STATUS_CFG[selected.table_status].icon}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-dark-brown">Table {selected.table_number}</h3>
                  <span className="text-sm font-bold uppercase" style={{ color: STATUS_CFG[selected.table_status].color }}>{STATUS_CFG[selected.table_status].label}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="bg-dark-brown/10 hover:bg-dark-brown/20 rounded-full p-2 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {selected.table_status === "free" ? (
              <div className="text-center py-6">
                <p className="text-4xl mb-3">🪑</p>
                <p className="font-paragraph text-dark-brown/50">This table is available</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/60 rounded-2xl p-4">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1">Customer</p>
                  <p className="font-bold text-dark-brown text-sm">{selected.customer_name || "—"}</p>
                </div>
                <div className="bg-white/60 rounded-2xl p-4">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1">Order Status</p>
                  <p className="font-bold text-sm uppercase" style={{ color: STATUS_CFG[selected.table_status].color }}>{selected.order_status}</p>
                </div>
                <div className="bg-white/60 rounded-2xl p-4">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1">Total</p>
                  <p className="font-bold text-dark-brown text-sm">₱{selected.total_price ? Number(selected.total_price).toFixed(2) : "—"}</p>
                </div>
                <div className="bg-white/60 rounded-2xl p-4">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1">Time</p>
                  <p className="font-bold text-dark-brown text-sm">{selected.created_at ? timeSince(selected.created_at) : "—"}</p>
                </div>
                <div className="bg-white/60 rounded-2xl p-4">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1">Order ID</p>
                  <p className="font-bold text-dark-brown text-sm">#{selected.order_id}</p>
                </div>
                <div className="bg-white/60 rounded-2xl p-4">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1">Items</p>
                  <p className="font-bold text-dark-brown text-sm">{selected.items_count} item{(selected.items_count || 0) > 1 ? "s" : ""}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
