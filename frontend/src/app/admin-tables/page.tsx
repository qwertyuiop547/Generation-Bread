"use client";

import { authFetch } from "@/lib/authHeaders";
import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import QRCode from "qrcode";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const TOTAL_TABLES = 10;
const POLL_MS = 8000;
const DEPLOYED_WEB_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://generation-bread-web.onrender.com";

function getPublicAppOrigin() {
  if (typeof window === "undefined") return DEPLOYED_WEB_URL;
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return isLocal ? DEPLOYED_WEB_URL : window.location.origin;
}

function getTableOrderUrl(tableNumber: number) {
  return `${getPublicAppOrigin()}/order?table=${tableNumber}`;
}

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

interface Summary {
  total: number;
  free: number;
  ordering: number;
  occupied: number;
}

const STATUS_CFG: Record<
  string,
  {
    label: string;
    sublabel: string;
    color: string;
    textColor: string;
    bg: string;
    border: string;
    glow: string;
    icon: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  free: {
    label: "Free",
    sublabel: "Available",
    color: "#059669",
    textColor: "text-emerald-800",
    bg: "bg-emerald-50/70",
    border: "border-emerald-200/80",
    glow: "0 4px 20px rgba(5,150,105,0.12)",
    icon: "✓",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
  },
  ordering: {
    label: "Ordering",
    sublabel: "In Progress",
    color: "#D97706",
    textColor: "text-amber-800",
    bg: "bg-amber-50/70",
    border: "border-amber-200/80",
    glow: "0 4px 20px rgba(217,119,6,0.14)",
    icon: "🛒",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
  },
  occupied: {
    label: "Occupied",
    sublabel: "Dining",
    color: "#DC2626",
    textColor: "text-rose-800",
    bg: "bg-rose-50/70",
    border: "border-rose-200/80",
    glow: "0 4px 20px rgba(220,38,38,0.14)",
    icon: "☕",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-800",
  },
};

export default function AdminTablesPage() {
  const { isLoggedIn, isStaff, user } = useAuth();
  const router = useRouter();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: TOTAL_TABLES,
    free: TOTAL_TABLES,
    ordering: 0,
    occupied: 0,
  });
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<TableInfo | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showQrManager, setShowQrManager] = useState(false);
  const [qrTableNumber, setQrTableNumber] = useState(1);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoggedIn) router.push("/");
    if (mounted && isLoggedIn && !isStaff) router.push("/dashboard");
  }, [mounted, isLoggedIn, isStaff, router]);

  const fetchTables = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await authFetch(
        `${API}/api/auth/admin/tables/?admin_email=${encodeURIComponent(
          user.email
        )}&total_tables=${TOTAL_TABLES}`
      );
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables);
        setSummary(data.summary);
        setLastUpdate(new Date());
      }
    } catch {
      /* silent */
    }
  }, [user?.email]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff) return;
    fetchTables();
    const id = setInterval(fetchTables, POLL_MS);
    return () => clearInterval(id);
  }, [mounted, isLoggedIn, isStaff, fetchTables]);

  useEffect(() => {
    if (!showQrManager) return;

    let cancelled = false;
    setIsGeneratingQr(true);
    setQrDataUrl("");
    setQrError("");

    QRCode.toDataURL(getTableOrderUrl(qrTableNumber), {
      width: 640,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#2A1810",
        light: "#FFFFFF",
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrError("Hindi ma-generate ang QR code. Subukan ulit.");
      })
      .finally(() => {
        if (!cancelled) setIsGeneratingQr(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qrTableNumber, showQrManager]);

  if (!mounted || !isLoggedIn || !isStaff) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin" />
      </div>
    );
  }

  const timeSince = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  const openQrManager = (tableNumber = 1) => {
    setQrTableNumber(tableNumber);
    setShowQrManager(true);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `generation-bread-table-${qrTableNumber}-qr.png`;
    anchor.click();
  };

  const copyQrLink = () => {
    const url = getTableOrderUrl(qrTableNumber);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const printQr = () => {
    if (!qrDataUrl) return;

    const printWindow = window.open("", "_blank", "width=720,height=820");
    if (!printWindow) {
      setQrError("Na-block ang print window. Payagan ang pop-ups at subukan ulit.");
      return;
    }

    const orderUrl = getTableOrderUrl(qrTableNumber);
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Generation Bread — Table ${qrTableNumber}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              color: #2A1810;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #FAF6F0;
            }
            main {
              width: 150mm;
              padding: 14mm;
              text-align: center;
              background: #FFFDF9;
              border: 3px solid #2A1810;
              border-radius: 28px;
              box-shadow: 0 10px 30px rgba(42,24,16,0.1);
            }
            .badge {
              display: inline-block;
              padding: 4px 14px;
              background: #2A1810;
              color: #FAEADE;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.15em;
              border-radius: 20px;
              margin-bottom: 12px;
            }
            h1 { margin: 0; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: #2A1810; }
            h2 { margin: 6px 0 20px; font-size: 24px; font-weight: 800; text-transform: uppercase; color: #A26833; }
            .qr-frame {
              display: inline-block;
              padding: 16px;
              background: #fff;
              border: 2px solid #EBE3D7;
              border-radius: 20px;
              margin: 0 auto;
            }
            img { display: block; width: 100mm; height: 100mm; }
            p { margin: 18px 0 4px; font-size: 16px; font-weight: 700; color: #2A1810; }
            small { display: block; overflow-wrap: anywhere; color: #A26833; font-size: 11px; font-family: monospace; }
            @media print {
              body { background: #fff; min-height: auto; }
              main { border: 2px solid #2A1810; box-shadow: none; break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <main>
            <div class="badge">Boutique Bakery & Cafe</div>
            <h1>GENERATION BREAD</h1>
            <h2>TABLE ${qrTableNumber}</h2>
            <div class="qr-frame">
              <img src="${qrDataUrl}" alt="Table ${qrTableNumber} QR code" />
            </div>
            <p>Scan with your camera to view menu & order</p>
            <small>${orderUrl}</small>
          </main>
          <script>
            window.addEventListener("load", () => {
              window.print();
              window.onafterprint = () => window.close();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2A1810] relative selection:bg-[#E3A458]/30 selection:text-[#2A1810]">
      {/* Background Ambience Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-8%] right-[-10%] w-[55vw] h-[55vw] rounded-full bg-gradient-to-br from-[#E3A458]/12 via-[#FAF6F0]/0 to-transparent blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-tr from-[#A26833]/10 via-[#FAF6F0]/0 to-transparent blur-3xl" />
      </div>

      {/* Sticky Luxury Navbar */}
      <nav className="sticky top-0 z-40 bg-[#FAF6F0]/90 backdrop-blur-md border-b border-[#EBE3D7] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link href="/admin" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2A1810] to-[#4A2B1D] p-2 flex items-center justify-center shadow-[0_4px_12px_rgba(42,24,16,0.15)] group-hover:scale-105 transition-transform">
              <CroissantLogoIcon className="w-6 h-6 text-[#FAEADE] transition-transform duration-300 group-hover:rotate-6" />
            </div>
            <div>
              <span className="text-sm font-black tracking-tight text-[#2A1810] uppercase flex items-center gap-1.5">
                GENERATION BREAD
                <span className="px-2 py-0.5 rounded-full bg-[#E3A458]/20 text-[#A26833] text-[9px] font-extrabold tracking-wider border border-[#E3A458]/30">
                  FLOOR MAP
                </span>
              </span>
              <span className="text-[10px] text-[#2A1810]/50 font-medium block">
                Dining Floor & Table Command Center
              </span>
            </div>
          </Link>

          {/* Nav Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell userEmail={user?.email} />

            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 bg-[#FFFDF9] hover:bg-[#F5EFE6] hover:text-[#2A1810] border border-[#EBE3D7] transition-all shadow-2xs hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              <span>Kitchen Hub</span>
            </Link>

            <Link
              href="/admin-dashboard"
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 bg-[#FFFDF9] hover:bg-[#F5EFE6] hover:text-[#2A1810] border border-[#EBE3D7] transition-all shadow-2xs hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              <span>Analytics</span>
            </Link>

            <Link
              href="/admin-sales"
              className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 bg-[#FFFDF9] hover:bg-[#F5EFE6] hover:text-[#2A1810] border border-[#EBE3D7] transition-all shadow-2xs hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <span>Sales Log</span>
            </Link>

            <button
              onClick={() => { void performLogout(signOut); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider text-red-700 bg-red-50/80 hover:bg-red-100/90 border border-red-200 transition-all shadow-2xs hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 relative z-10 space-y-8">
        {/* Hero Banner & Live Status Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E3A458]/15 border border-[#E3A458]/30 text-[#A26833] text-xs font-extrabold uppercase tracking-wider mb-2">
              <span>🪑</span>
              <span>Dine-In Operations & Live Table Floor Map</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#2A1810] tracking-tight uppercase">
              Table Status
            </h1>
            <p className="font-paragraph text-[#2A1810]/60 text-sm mt-1">
              Real-time bakery cafe floor grid · Auto-syncs every {POLL_MS / 1000}s
            </p>
          </div>

          {/* Action Tools */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openQrManager(1)}
              className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-[#2A1810] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#FAEADE] shadow-sm transition-all hover:bg-[#2A1810]/90 hover:-translate-y-0.5 active:scale-95 border border-[#4A2B1D]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
              </svg>
              <span>Table QR Codes</span>
            </button>

            <div className="flex items-center gap-2.5 bg-[#FFFDF9] border border-[#EBE3D7] rounded-full px-3.5 py-1.5 shadow-2xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="font-mono text-[#2A1810]/60 text-xs font-bold">
                {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <button
                onClick={fetchTables}
                className="cursor-pointer text-[#2A1810]/50 hover:text-[#2A1810] p-1 rounded-full hover:bg-[#FAF6F0] transition-colors"
                title="Sync now"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 3 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Free Tables */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] hover:border-emerald-300 rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] transition-all hover:-translate-y-0.5 group relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50 mb-1">
                  Available Tables
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#2A1810] font-mono">
                    {summary.free}
                  </span>
                  <span className="text-xs font-extrabold text-[#2A1810]/40 font-mono">
                    / {summary.total} total
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center text-xl shadow-2xs group-hover:scale-105 transition-transform">
                ✓
              </div>
            </div>
            {/* Progress line */}
            <div className="mt-4 w-full h-1.5 bg-[#FAF6F0] rounded-full overflow-hidden border border-[#EBE3D7]">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(summary.free / summary.total) * 100}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-emerald-800 uppercase mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Ready for walk-in or seat-in guests
            </p>
          </div>

          {/* Ordering Tables */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] hover:border-amber-300 rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] transition-all hover:-translate-y-0.5 group relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50 mb-1">
                  Ordering Tables
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#2A1810] font-mono">
                    {summary.ordering}
                  </span>
                  <span className="text-xs font-extrabold text-[#2A1810]/40 font-mono">
                    / {summary.total} total
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center text-xl shadow-2xs group-hover:scale-105 transition-transform">
                🛒
              </div>
            </div>
            {/* Progress line */}
            <div className="mt-4 w-full h-1.5 bg-[#FAF6F0] rounded-full overflow-hidden border border-[#EBE3D7]">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${(summary.ordering / summary.total) * 100}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-amber-800 uppercase mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Browsing digital menu or pending checkout
            </p>
          </div>

          {/* Occupied Tables */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] hover:border-rose-300 rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] transition-all hover:-translate-y-0.5 group relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50 mb-1">
                  Occupied Tables
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#2A1810] font-mono">
                    {summary.occupied}
                  </span>
                  <span className="text-xs font-extrabold text-[#2A1810]/40 font-mono">
                    / {summary.total} total
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 flex items-center justify-center text-xl shadow-2xs group-hover:scale-105 transition-transform">
                ☕
              </div>
            </div>
            {/* Progress line */}
            <div className="mt-4 w-full h-1.5 bg-[#FAF6F0] rounded-full overflow-hidden border border-[#EBE3D7]">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${(summary.occupied / summary.total) * 100}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-rose-800 uppercase mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Active dine-in orders currently served
            </p>
          </div>
        </div>

        {/* Legend Capsule Track */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#FFFDF9] border border-[#EBE3D7] rounded-2xl px-5 py-3 shadow-2xs">
          <span className="text-xs font-extrabold uppercase text-[#2A1810]/60 tracking-wider">
            Live Map Status Legend:
          </span>
          <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-emerald-900">Free / Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
              <span className="text-amber-900">Ordering (In Cart)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span className="text-rose-900">Occupied (Served / Dining)</span>
            </div>
          </div>
        </div>

        {/* Floor Map Layout Box */}
        <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(42,24,16,0.06)] relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-xl">🥐</span>
              <h2 className="text-lg sm:text-xl font-black text-[#2A1810] uppercase tracking-tight">
                Generation Bread — Dining Floor Plan
              </h2>
            </div>
            <span className="text-[11px] font-extrabold uppercase text-[#2A1810]/40 tracking-wider">
              Tap any table card for live order breakdown
            </span>
          </div>

          {/* Architectural Layout Indicator Bar */}
          <div className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-2.5 mb-8 relative overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider px-2">
              <div className="flex items-center gap-2 text-[#2A1810]">
                <span className="w-2 h-2 rounded-full bg-[#E3A458]"></span>
                <span>☕ Counter & Kitchen Service Area</span>
              </div>
              <div className="flex items-center gap-2 text-[#2A1810]/50 font-mono">
                <span>🚪 Main Entrance & Patio →</span>
              </div>
            </div>
          </div>

          {/* Grid of Tables: 1 to 10 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 md:gap-5">
            {tables.map((t) => {
              const cfg = STATUS_CFG[t.table_status] || STATUS_CFG.free;
              const isSelected = selected?.table_number === t.table_number;
              const formattedTableNum = String(t.table_number).padStart(2, "0");

              return (
                <button
                  key={t.table_number}
                  onClick={() => setSelected(isSelected ? null : t)}
                  className={`relative group rounded-3xl p-5 transition-all duration-300 text-left cursor-pointer border ${
                    isSelected
                      ? `${cfg.bg} border-[#2A1810] shadow-[0_8px_30px_rgba(42,24,16,0.12)] scale-[1.02] ring-2 ring-[#2A1810]`
                      : `bg-[#FFFDF9] hover:bg-[#FAF6F0] border-[#EBE3D7] hover:border-[#A26833]/40 shadow-xs hover:shadow-md hover:-translate-y-1`
                  }`}
                >
                  {/* Status Indicator Beacon */}
                  <div className="absolute top-4 right-4 flex items-center justify-center">
                    {t.table_status !== "free" ? (
                      <span className="relative flex h-3 w-3">
                        <span
                          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                          style={{ backgroundColor: cfg.color }}
                        />
                        <span
                          className="relative inline-flex rounded-full h-3 w-3"
                          style={{ backgroundColor: cfg.color }}
                        />
                      </span>
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cfg.color, opacity: 0.6 }}
                      />
                    )}
                  </div>

                  {/* Icon Emblem */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4 border transition-transform group-hover:scale-105 ${cfg.bg} ${cfg.border} ${cfg.textColor}`}
                  >
                    {cfg.icon}
                  </div>

                  {/* Table ID */}
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-xl font-black text-[#2A1810] tracking-tight">
                      T-{formattedTableNum}
                    </p>
                  </div>

                  {/* Status Pill */}
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${cfg.badgeBg} ${cfg.badgeText}`}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  {/* Occupied / Ordering Details */}
                  {t.customer_name ? (
                    <div className="mt-3 pt-3 border-t border-[#EBE3D7]/70">
                      <p className="text-xs font-extrabold text-[#2A1810] truncate">
                        {t.customer_name}
                      </p>
                      {t.total_price && (
                        <p className="text-xs font-black text-[#A26833] font-mono mt-0.5">
                          ₱{Number(t.total_price).toFixed(2)}
                        </p>
                      )}
                      {t.created_at && (
                        <p className="text-[10px] text-[#2A1810]/40 font-mono mt-0.5">
                          {timeSince(t.created_at)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-[#EBE3D7]/50">
                      <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/40">
                        Ready to seat
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Table Detail Card */}
        {selected && (
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(42,24,16,0.08)] transition-all animate-[fadeUp_0.3s_ease-out]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#EBE3D7]">
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border shadow-2xs ${
                    STATUS_CFG[selected.table_status]?.bg
                  } ${STATUS_CFG[selected.table_status]?.border} ${
                    STATUS_CFG[selected.table_status]?.textColor
                  }`}
                >
                  {STATUS_CFG[selected.table_status]?.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-black text-[#2A1810] uppercase tracking-tight">
                      Table {selected.table_number}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                        STATUS_CFG[selected.table_status]?.badgeBg
                      } ${STATUS_CFG[selected.table_status]?.badgeText}`}
                    >
                      {STATUS_CFG[selected.table_status]?.label}
                    </span>
                  </div>
                  <p className="text-xs text-[#2A1810]/50 font-paragraph mt-0.5">
                    {selected.table_status === "free"
                      ? "Available table — no active orders"
                      : `Active order #${selected.order_id || "N/A"}`}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openQrManager(Number(selected.table_number))}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-[#2A1810] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#FAEADE] transition-all hover:bg-[#2A1810]/90 shadow-2xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/>
                  </svg>
                  <span>Table QR Code</span>
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="cursor-pointer bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810]/60 hover:text-[#2A1810] border border-[#EBE3D7] rounded-full p-2.5 transition-colors"
                  aria-label="Close table details"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            </div>

            {selected.table_status === "free" ? (
              <div className="text-center py-8 bg-[#FAF6F0]/60 rounded-2xl border border-[#EBE3D7]">
                <p className="text-4xl mb-2">🪑</p>
                <p className="text-sm font-extrabold uppercase text-[#2A1810]">Table is available</p>
                <p className="text-xs text-[#2A1810]/50 font-paragraph mt-1">Guests can scan the table QR code to start placing orders</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1">Customer</p>
                  <p className="text-sm font-extrabold text-[#2A1810] truncate">{selected.customer_name || "Guest"}</p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1">Order Status</p>
                  <p className="text-xs font-black uppercase text-[#A26833]">{selected.order_status || "In Cart"}</p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1">Total Bill</p>
                  <p className="text-sm font-black text-[#2A1810] font-mono">
                    ₱{selected.total_price ? Number(selected.total_price).toFixed(2) : "0.00"}
                  </p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1">Placed At</p>
                  <p className="text-xs font-mono font-bold text-[#2A1810]/70">
                    {selected.created_at ? timeSince(selected.created_at) : "—"}
                  </p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1">Order ID</p>
                  <p className="text-xs font-mono font-extrabold text-[#2A1810]">
                    #{selected.order_id || "—"}
                  </p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1">Items</p>
                  <p className="text-xs font-extrabold text-[#2A1810]">
                    {selected.items_count || 0} item{(selected.items_count || 0) !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* QR Code Manager Modal */}
      {showQrManager && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-manager-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowQrManager(false);
          }}
        >
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] w-full max-w-md overflow-hidden rounded-3xl shadow-[0_16px_48px_rgba(42,24,16,0.2)] flex flex-col animate-[fadeUp_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#EBE3D7] px-6 py-4 bg-[#FAF6F0]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#2A1810] text-[#FAEADE] flex items-center justify-center text-lg shadow-2xs">
                  📱
                </div>
                <div>
                  <h2 id="qr-manager-title" className="text-base font-black uppercase text-[#2A1810] tracking-tight">
                    Table QR Code
                  </h2>
                  <p className="font-paragraph text-[10px] font-bold uppercase tracking-wider text-[#2A1810]/50">
                    Instant Dine-In Menu & Order Link
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrManager(false)}
                className="cursor-pointer rounded-full p-2 text-[#2A1810]/40 hover:text-[#2A1810] hover:bg-[#2A1810]/5 transition-colors"
                aria-label="Close QR manager"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="qr-table-number"
                  className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-[#2A1810]/60"
                >
                  Select Table Number
                </label>
                <select
                  id="qr-table-number"
                  value={qrTableNumber}
                  onChange={(event) => setQrTableNumber(Number(event.target.value))}
                  className="w-full cursor-pointer rounded-xl border border-[#EBE3D7] bg-[#FAF6F0] px-4 py-2.5 text-sm font-extrabold text-[#2A1810] outline-none focus:border-[#A26833] shadow-2xs"
                >
                  {Array.from({ length: TOTAL_TABLES }, (_, index) => index + 1).map((tableNumber) => (
                    <option key={tableNumber} value={tableNumber}>
                      Table {tableNumber} (T-{String(tableNumber).padStart(2, "0")})
                    </option>
                  ))}
                </select>
              </div>

              {/* QR Image Box */}
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[#EBE3D7] bg-white p-5 shadow-inner relative">
                {isGeneratingQr ? (
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#E3A458]/30 border-t-[#A26833]" aria-label="Generating QR code" />
                ) : qrDataUrl ? (
                  <Image
                    src={qrDataUrl}
                    alt={`QR code for table ${qrTableNumber}`}
                    width={260}
                    height={260}
                    unoptimized
                    className="h-auto w-full max-w-[220px]"
                  />
                ) : (
                  <p className="text-xs font-bold text-red-700">{qrError}</p>
                )}
              </div>

              {/* URL summary & Copy */}
              <div className="rounded-2xl bg-[#FAF6F0] border border-[#EBE3D7] p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 tracking-wider">
                    Dine-in Order URL
                  </p>
                  <p className="text-xs text-[#2A1810] font-mono truncate mt-0.5">
                    {getTableOrderUrl(qrTableNumber)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyQrLink}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5EFE6] border border-[#EBE3D7] text-xs font-extrabold uppercase text-[#2A1810] transition-colors shadow-2xs flex-shrink-0"
                >
                  {copiedLink ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={downloadQr}
                  disabled={!qrDataUrl || isGeneratingQr}
                  className="cursor-pointer rounded-2xl border border-[#EBE3D7] bg-white px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[#2A1810] transition-colors hover:bg-[#FAF6F0] disabled:opacity-50 shadow-2xs"
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  onClick={printQr}
                  disabled={!qrDataUrl || isGeneratingQr}
                  className="cursor-pointer rounded-2xl bg-[#2A1810] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[#FAEADE] shadow-sm transition-colors hover:bg-[#2A1810]/90 disabled:opacity-50"
                >
                  Print QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
