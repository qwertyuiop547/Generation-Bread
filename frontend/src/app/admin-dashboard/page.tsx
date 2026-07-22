"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authHeaders } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
import { STAFF_POSITIONS } from "@/constants";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
} from "recharts";
import { useThemeColors, withAlpha } from "@/lib/themeColors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface ShiftLineupEntry {
  user_id: number;
  assignment_id: number | null;
  name: string;
  email: string;
  avatar: string | null;
  employee_id: string | null;
  start_time: string;
  end_time: string;
  station: string;
  station_display: string;
  source: "assigned" | "default";
  display_status: string;
  clock_in: string | null;
  planned_absence: { id: number; reason: string } | null;
}

interface ShiftLineupData {
  date: string;
  date_label: string;
  lineup: ShiftLineupEntry[];
  summary: {
    scheduled: number;
    on_shift: number;
    clocked_in: number;
    not_yet_in: number;
    absent_today: number;
    planned_absent: number;
  };
}

const LINEUP_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  clocked_in: { label: "On Shift", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  on_break: { label: "On Break", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
  pending: { label: "Pending", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
  late: { label: "Late", color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-500" },
  clocked_out: { label: "Done", color: "text-dark-brown/60", bg: "bg-dark-brown/5", dot: "bg-dark-brown/30" },
  not_clocked_in: { label: "Not Yet In", color: "text-gray-600", bg: "bg-gray-50", dot: "bg-gray-400" },
  within_grace: { label: "Grace Period", color: "text-yellow-700", bg: "bg-yellow-50", dot: "bg-yellow-500" },
  absent_today: { label: "Absent", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
  planned_absent: { label: "Planned Off", color: "text-indigo-700", bg: "bg-indigo-50", dot: "bg-indigo-500" },
};

function formatLineupTime(t: string): string {
  return new Date(`1970-01-01T${t}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface DrinkPrepStaffRow {
  user_id: number;
  name: string;
  email: string;
  employee_id: string | null;
  position: string;
  position_display: string;
  orders_prepared: number;
  avg_prep_seconds: number;
  avg_prep_label: string;
  min_prep_label: string;
  max_prep_label: string;
  median_prep_label: string;
}

interface DrinkPrepOrderRow {
  order_label: string;
  barista_name: string;
  position_display: string;
  preparing_at: string;
  ready_at: string;
  prep_label: string;
  item_count: number;
}

interface DrinkPrepData {
  period_days: number;
  summary: {
    total_orders_measured: number;
    baristas_with_data: number;
    overall_avg_seconds: number;
    overall_avg_label: string;
  };
  staff: DrinkPrepStaffRow[];
  orders: DrinkPrepOrderRow[];
}

interface OrderItem { name: string; price: number; qty: number; }
interface Order {
  id: string; items: OrderItem[]; total: number; totalItems: number;
  date: string; userEmail: string; userName: string;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  orderType: string;
}

const menuDrinks = [
  "Ube Cheese Pandesal",
  "Pork Floss Ensaymada",
  "Matcha Latte",
  "Sausage Croissant",
  "Ham & Cheese Croissant",
  "Pistachio Pain au Chocolat",
];

export default function AdminDashboardPage() {
  const { isLoggedIn, isAdmin, isStaff, user } = useAuth();
  const router = useRouter();
  const tc = useThemeColors();
  const chartColors = useMemo(
    () => [tc.lightBrown, tc.midBrown, tc.darkBrown, tc.redBrown, tc.red, tc.milkYellow],
    [tc]
  );
  const chartTick = withAlpha(tc.darkBrown, "aa");
  const chartTickStrong = withAlpha(tc.darkBrown, "cc");
  const chartGrid = withAlpha(tc.darkBrown, "15");
  const chartTooltip = {
    borderRadius: 16,
    border: `1px solid ${withAlpha(tc.lightBrown, "40")}`,
    background: tc.milk,
    fontSize: 13,
  } as const;
  const [orders, setOrders] = useState<Order[]>([]);
  const [mounted, setMounted] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("30d");
  const [shiftLineup, setShiftLineup] = useState<ShiftLineupData | null>(null);
  const [lineupLoading, setLineupLoading] = useState(true);
  const [prepDays, setPrepDays] = useState<7 | 30 | 90>(30);
  const [prepData, setPrepData] = useState<DrinkPrepData | null>(null);
  const [prepLoading, setPrepLoading] = useState(true);
  const [prepExportLoading, setPrepExportLoading] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuTlRef = useRef<gsap.core.Timeline | null>(null);

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      return;
    }
    setShowMobileMenu(true);
    setIsMobileMenuOpen(true);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) {
      setChartReady(false);
      return;
    }
    setChartReady(false);
    const timer = window.setTimeout(() => setChartReady(true), 150);
    return () => window.clearTimeout(timer);
  }, [mounted, timeRange, prepDays]);

  useGSAP(
    () => {
      const top = containerRef.current?.querySelector(".ham-top");
      const mid = containerRef.current?.querySelector(".ham-mid");
      const bot = containerRef.current?.querySelector(".ham-bot");
      if (!top || !mid || !bot) return;

      if (isMobileMenuOpen) {
        gsap.to(top, { y: 6, rotation: 45, transformOrigin: "50% 50%", duration: 0.35, ease: "power3.out" });
        gsap.to(mid, { autoAlpha: 0, scaleX: 0.35, duration: 0.18, ease: "power2.in" });
        gsap.to(bot, { y: -6, rotation: -45, transformOrigin: "50% 50%", duration: 0.35, ease: "power3.out" });
      } else {
        gsap.to(top, { y: 0, rotation: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "power3.out" });
        gsap.to(mid, { autoAlpha: 1, scaleX: 1, duration: 0.25, ease: "power2.out", delay: 0.04 });
        gsap.to(bot, { y: 0, rotation: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "power3.out" });
      }
    },
    { dependencies: [isMobileMenuOpen], scope: containerRef }
  );

  useGSAP(
    () => {
      if (!showMobileMenu || !mobileMenuRef.current) return;

      const menu = mobileMenuRef.current;
      const items = gsap.utils.toArray<HTMLElement>(".mobile-nav-item", menu);
      menuTlRef.current?.kill();

      if (isMobileMenuOpen) {
        gsap.set(menu, {
          display: "flex",
          autoAlpha: 0,
          y: -18,
          clipPath: "inset(0% 0% 100% 0%)",
        });
        gsap.set(items, { autoAlpha: 0, y: -14, scale: 0.96 });

        menuTlRef.current = gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .to(menu, {
            autoAlpha: 1,
            y: 0,
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 0.42,
          })
          .to(
            items,
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.38,
              stagger: { each: 0.07, from: "start" },
              ease: "power2.out",
            },
            "-=0.22"
          );
      } else {
        menuTlRef.current = gsap
          .timeline({
            defaults: { ease: "power2.in" },
            onComplete: () => setShowMobileMenu(false),
          })
          .to(items, {
            autoAlpha: 0,
            y: -10,
            scale: 0.97,
            duration: 0.18,
            stagger: { each: 0.04, from: "end" },
          })
          .to(
            menu,
            {
              autoAlpha: 0,
              y: -14,
              clipPath: "inset(0% 0% 100% 0%)",
              duration: 0.28,
            },
            "-=0.06"
          );
      }
    },
    { dependencies: [isMobileMenuOpen, showMobileMenu], scope: containerRef }
  );

  useEffect(() => {
    if (mounted && !isLoggedIn) { router.push("/"); return; }
    if (mounted && isLoggedIn && !isAdmin) { router.push(isStaff ? "/staff" : "/dashboard"); return; }
  }, [mounted, isLoggedIn, isAdmin, router]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email) return;
    const fetchOrders = async () => {
      try {
        const localRaw = localStorage.getItem("spylt_local_orders");
        const localOrders: Order[] = localRaw ? JSON.parse(localRaw) : [];
        let mapped: Order[] = [];
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}&limit=500`, {
            headers: authHeaders(),
          });
          if (res.ok) {
            const data = unwrapListResponse<any>(await res.json());
            mapped = data.map((d: any) => ({
              id: `ORD-${d.id.toString().padStart(4, "0")}`,
              items: d.items.map((i: any) => ({ name: i.name, price: Number(i.price), qty: i.quantity })),
              total: Number(d.total_price),
              totalItems: d.items.reduce((s: number, i: any) => s + i.quantity, 0),
              date: d.created_at, userEmail: d.user_email,
              userName: d.user_name || d.user_email, status: d.status,
              orderType: d.order_type || "takeout",
            }));
          }
        } catch {}
        setOrders([...mapped, ...localOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch { setOrders([]); }
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isAdmin, user?.email]);

  useEffect(() => {
    const raw = localStorage.getItem("spylt_users") || "[]";
    setTotalUsers(JSON.parse(raw).filter((u: any) => u.role !== "admin").length);
  }, []);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email) return;
    const fetchLineup = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/auth/admin/today-shift-lineup/?admin_email=${encodeURIComponent(user.email)}`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          setShiftLineup(await res.json());
        } else {
          setShiftLineup(null);
        }
      } catch {
        setShiftLineup(null);
      } finally {
        setLineupLoading(false);
      }
    };
    fetchLineup();
    const interval = setInterval(fetchLineup, 30000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isAdmin, user?.email]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email) return;
    const fetchPrepTimes = async () => {
      setPrepLoading(true);
      try {
        const params = new URLSearchParams({
          admin_email: user.email,
          days: String(prepDays),
        });
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/drink-prep-times/?${params}`);
        if (res.ok) {
          setPrepData(await res.json());
        } else {
          setPrepData(null);
        }
      } catch {
        setPrepData(null);
      } finally {
        setPrepLoading(false);
      }
    };
    fetchPrepTimes();
  }, [mounted, isLoggedIn, isAdmin, user?.email, prepDays]);

  const exportPrepTimesCsv = async () => {
    if (!user?.email) return;
    setPrepExportLoading(true);
    try {
      const params = new URLSearchParams({
        admin_email: user.email,
        days: String(prepDays),
      });
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/drink-prep-times/export/?${params}`);
      if (!res.ok) throw new Error("Failed to export prep times");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `drink-prep-times-${prepDays}d.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent fail on dashboard
    } finally {
      setPrepExportLoading(false);
    }
  };

  const prepChartData = useMemo(
    () => (prepData?.staff || []).map((s) => ({
      name: s.name.length > 12 ? `${s.name.slice(0, 10)}…` : s.name,
      fullName: s.name,
      avgMinutes: Math.round((s.avg_prep_seconds / 60) * 10) / 10,
      orders: s.orders_prepared,
    })),
    [prepData],
  );

  const filteredOrders = useMemo(() => {
    if (timeRange === "all") return orders;
    const days = timeRange === "7d" ? 7 : 30;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return orders.filter(o => new Date(o.date) >= cutoff);
  }, [orders, timeRange]);

  const dailyData = useMemo(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 60;
    const map: Record<string, { orders: number; revenue: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      map[key] = { orders: 0, revenue: 0 };
    }
    filteredOrders.filter(o => o.status !== "cancelled").forEach(o => {
      const key = new Date(o.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (map[key]) { map[key].orders++; map[key].revenue += o.total; }
    });
    return Object.entries(map).map(([date, v]) => ({ date, ...v }));
  }, [filteredOrders, timeRange]);

  const popularDrinks = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => o.items.forEach(i => {
      const base = menuDrinks.find(d => i.name.startsWith(d)) || i.name;
      map[base] = (map[base] || 0) + i.qty;
    }));
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, value, fullName: name }));
  }, [filteredOrders]);

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const orderTypeRevenue = useMemo(() => {
    const active = filteredOrders.filter(o => o.status !== "cancelled");
    const dineIn = active.filter(o => o.orderType === "dine_in");
    const takeout = active.filter(o => o.orderType !== "dine_in");
    const dineInRevenue = dineIn.reduce((s, o) => s + o.total, 0);
    const takeoutRevenue = takeout.reduce((s, o) => s + o.total, 0);
    const total = dineInRevenue + takeoutRevenue;
    return {
      dineIn: { revenue: dineInRevenue, orders: dineIn.length, pct: total > 0 ? Math.round((dineInRevenue / total) * 100) : 0 },
      takeout: { revenue: takeoutRevenue, orders: takeout.length, pct: total > 0 ? Math.round((takeoutRevenue / total) * 100) : 0 },
      total,
      chartData: [
        { type: "Dine-In", revenue: dineInRevenue, orders: dineIn.length, fill: tc.darkBrown },
        { type: "Takeout", revenue: takeoutRevenue, orders: takeout.length, fill: tc.lightBrown },
      ],
    };
  }, [filteredOrders, tc]);

  const stats = useMemo(() => {
    const active = filteredOrders.filter(o => o.status !== "cancelled");
    return {
      totalOrders: filteredOrders.length,
      totalRevenue: active.reduce((s, o) => s + o.total, 0),
      avgOrderValue: active.length > 0 ? active.reduce((s, o) => s + o.total, 0) / active.length : 0,
      pending: filteredOrders.filter(o => o.status === "pending").length,
      completed: filteredOrders.filter(o => o.status === "completed").length,
    };
  }, [filteredOrders]);

  const recentOrders = filteredOrders.slice(0, 5);

  if (!mounted || !isLoggedIn || !isAdmin) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  const StatCard = ({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: string }) => (
    <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {accent && <span className="text-xs font-bold uppercase bg-light-brown/20 text-dark-brown rounded-full px-2.5 py-1">{accent}</span>}
      </div>
      <p className="font-paragraph text-dark-brown/50 text-sm mb-1">{label}</p>
      <p className="text-2xl md:text-3xl font-bold text-dark-brown tracking-tight">{value}</p>
    </div>
  );

  const statusColorMap: Record<string, string> = {
    pending: "#9ca3af", preparing: "#eab308", ready: "#3b82f6", completed: "#22c55e", cancelled: "#ef4444",
  };

  return (
    <div ref={containerRef} className="min-h-screen app-canvas relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-15%] w-[45vw] h-[45vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-15"></div>
      <div className="absolute bottom-[-15%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

      {/* Header */}
      <div className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4 gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight truncate">Analytics</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <NotificationBell userEmail={user?.email} />

            <button
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              className="xl:hidden p-2 text-dark-brown hover:bg-dark-brown/10 rounded-full transition-colors"
              onClick={toggleMobileMenu}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                className="overflow-visible"
              >
                <line className="ham-top" x1="3" y1="6" x2="21" y2="6" />
                <line className="ham-mid" x1="3" y1="12" x2="21" y2="12" />
                <line className="ham-bot" x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="hidden xl:flex items-center gap-3">
              <Link href="/admin" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
                Orders
              </Link>
              <Link href="/admin-menu" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                Menu
              </Link>
              <Link href="/admin-sales" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Sales
              </Link>
              <Link href="/admin-tables" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                Tables
              </Link>
              <button onClick={() => { void performLogout(signOut); }} className="group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                Logout
              </button>
            </div>
          </div>
        </div>

        {showMobileMenu && (
          <div
            ref={mobileMenuRef}
            className="mobile-nav-menu xl:hidden absolute top-[100%] right-0 w-full app-header-bar backdrop-blur-md border-b border-dark-brown/10 shadow-lg flex flex-col items-center py-4 gap-3 z-50 will-change-transform"
          >
            <Link href="/admin" onClick={closeMobileMenu} className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
              Orders
            </Link>
            <Link href="/admin-menu" onClick={closeMobileMenu} className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              Menu
            </Link>
            <Link href="/admin-sales" onClick={closeMobileMenu} className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Sales
            </Link>
            <Link href="/admin-tables" onClick={closeMobileMenu} className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              Tables
            </Link>
            <button onClick={() => { void performLogout(signOut); }} className="mobile-nav-item flex items-center justify-between gap-3 w-[90%] bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]">
              <span>Logout</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-10 py-8 md:py-12 relative z-10">
        {/* Welcome + Range */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-dark-brown uppercase tracking-tighter">Dashboard</h2>
            <p className="font-paragraph text-dark-brown/60 mt-1">Business insights at a glance.</p>
          </div>
          <div className="flex gap-2">
            {(["7d", "30d", "all"] as const).map(r => (
              <button key={r} onClick={() => setTimeRange(r)} className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${timeRange === r ? "bg-dark-brown text-milk shadow-md" : "bg-white/60 text-dark-brown/70 hover:bg-white border border-white/60"}`}>
                {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "All Time"}
              </button>
            ))}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-5 mb-8">
          <StatCard label="Total Orders" value={stats.totalOrders.toString()} icon="📦" />
          <StatCard label="Revenue" value={`₱${stats.totalRevenue.toLocaleString()}`} icon="💰" />
          <StatCard label="Avg. Order" value={`₱${stats.avgOrderValue.toFixed(0)}`} icon="📊" />
          <StatCard label="Pending" value={stats.pending.toString()} icon="⏳" accent={stats.pending > 0 ? "Active" : undefined} />
          <StatCard label="Customers" value={totalUsers.toString()} icon="👥" />
        </div>

        {/* Today's Shift Lineup */}
        <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight">Today&apos;s Shift Lineup</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-0.5">
                {shiftLineup?.date_label || "Who is scheduled today — time, station, and live status"}
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 self-start sm:self-auto text-xs font-bold uppercase text-dark-brown/60 hover:text-dark-brown transition-colors"
            >
              Manage Shifts & Attendance →
            </Link>
          </div>

          {lineupLoading ? (
            <div className="py-10 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
            </div>
          ) : !shiftLineup || shiftLineup.lineup.length === 0 ? (
            <div className="py-10 text-center rounded-2xl border border-dashed border-dark-brown/15 bg-dark-brown/[0.02]">
              <p className="text-3xl mb-2">📋</p>
              <p className="font-paragraph text-dark-brown/50 text-sm">No shifts scheduled for today</p>
              <Link href="/admin" className="inline-block mt-3 text-xs font-bold uppercase text-dark-brown/70 hover:text-dark-brown underline-offset-2 hover:underline">
                Assign shifts in Attendance
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark-brown/5 text-[10px] font-bold uppercase text-dark-brown/70">
                  {shiftLineup.summary.scheduled} scheduled
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-[10px] font-bold uppercase text-emerald-700">
                  {shiftLineup.summary.clocked_in} on shift
                </span>
                {shiftLineup.summary.not_yet_in > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 text-[10px] font-bold uppercase text-yellow-700">
                    {shiftLineup.summary.not_yet_in} not yet in
                  </span>
                )}
                {shiftLineup.summary.absent_today > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-[10px] font-bold uppercase text-red-700">
                    {shiftLineup.summary.absent_today} absent
                  </span>
                )}
                {shiftLineup.summary.planned_absent > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-[10px] font-bold uppercase text-indigo-700">
                    {shiftLineup.summary.planned_absent} planned off
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {shiftLineup.lineup.map((entry) => {
                  const statusCfg = LINEUP_STATUS[entry.display_status] || LINEUP_STATUS.not_clocked_in;
                  const pos = STAFF_POSITIONS.find((p) => p.key === entry.station);
                  const isOff = entry.display_status === "planned_absent";
                  return (
                    <div
                      key={`${entry.user_id}-${entry.start_time}`}
                      className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:shadow-md ${
                        isOff
                          ? "bg-indigo-50/40 border-indigo-200/50 opacity-80"
                          : entry.display_status === "absent_today"
                            ? "bg-red-50/40 border-red-200/50"
                            : "bg-white/60 border-dark-brown/8 hover:border-dark-brown/15"
                      }`}
                    >
                      {entry.avatar ? (
                        <Image
                          src={entry.avatar}
                          alt={entry.name}
                          width={44}
                          height={44}
                          className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-light-brown/20 flex items-center justify-center text-sm font-bold uppercase text-dark-brown flex-shrink-0">
                          {entry.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-sm font-bold text-dark-brown truncate ${isOff ? "line-through decoration-indigo-400/60" : ""}`}>
                              {entry.name}
                            </p>
                            <p className="text-[11px] text-dark-brown/50 font-paragraph tabular-nums">
                              {formatLineupTime(entry.start_time)} – {formatLineupTime(entry.end_time)}
                            </p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0 ${statusCfg.color} ${statusCfg.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${entry.display_status === "pending" || entry.display_status === "absent_today" ? "animate-pulse" : ""}`} />
                            {statusCfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${pos?.badge || "bg-gray-100"} ${pos?.badgeText || "text-gray-700"}`}>
                            {pos?.icon || "📍"} {entry.station_display}
                          </span>
                          {entry.source === "assigned" ? (
                            <span className="text-[9px] font-bold uppercase text-dark-brown/35">Assigned</span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase text-dark-brown/35">Default schedule</span>
                          )}
                          {entry.clock_in && !isOff && (
                            <span className="text-[9px] text-dark-brown/40 font-paragraph">
                              In {new Date(entry.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {entry.planned_absence && (
                          <p className="text-[10px] text-indigo-700/70 font-paragraph mt-1 truncate" title={entry.planned_absence.reason}>
                            {entry.planned_absence.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Average Drink Prep Time per Staff */}
        <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight">Average Drink Prep Time</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-0.5">
                Preparing → Ready per order, averaged per barista — useful for thesis data
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPrepDays(d)}
                  className={`px-3 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                    prepDays === d ? "bg-dark-brown text-milk shadow-md" : "bg-white/60 text-dark-brown/70 hover:bg-white border border-white/60"
                  }`}
                >
                  {d} Days
                </button>
              ))}
              <button
                type="button"
                onClick={exportPrepTimesCsv}
                disabled={prepExportLoading || !prepData?.orders?.length}
                className="px-3 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase transition-all disabled:opacity-50"
              >
                {prepExportLoading ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>

          {prepLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
            </div>
          ) : !prepData || prepData.summary.total_orders_measured === 0 ? (
            <div className="py-10 text-center rounded-2xl border border-dashed border-dark-brown/15 bg-dark-brown/[0.02]">
              <p className="text-3xl mb-2">☕</p>
              <p className="font-paragraph text-dark-brown/50 text-sm">No prep time data yet for the last {prepDays} days</p>
              <p className="text-xs text-dark-brown/40 font-paragraph mt-2 max-w-md mx-auto">
                Data is recorded when staff move orders from <strong>Preparing</strong> to <strong>Ready</strong> in Admin or Staff Orders.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl bg-amber-50/80 border border-amber-200/60 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-800 tabular-nums">{prepData.summary.overall_avg_label}</p>
                  <p className="text-[10px] font-bold uppercase text-amber-700/70 mt-0.5">Overall Avg</p>
                </div>
                <div className="rounded-2xl bg-dark-brown/5 border border-dark-brown/10 p-4 text-center">
                  <p className="text-2xl font-bold text-dark-brown tabular-nums">{prepData.summary.total_orders_measured}</p>
                  <p className="text-[10px] font-bold uppercase text-dark-brown/50 mt-0.5">Orders Measured</p>
                </div>
                <div className="rounded-2xl bg-dark-brown/5 border border-dark-brown/10 p-4 text-center">
                  <p className="text-2xl font-bold text-dark-brown tabular-nums">{prepData.summary.baristas_with_data}</p>
                  <p className="text-[10px] font-bold uppercase text-dark-brown/50 mt-0.5">Baristas</p>
                </div>
                <div className="rounded-2xl bg-dark-brown/5 border border-dark-brown/10 p-4 text-center">
                  <p className="text-2xl font-bold text-dark-brown tabular-nums">{prepDays}d</p>
                  <p className="text-[10px] font-bold uppercase text-dark-brown/50 mt-0.5">Period</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold text-dark-brown uppercase tracking-tight mb-3">Avg Prep Time by Barista (minutes)</h4>
                  <div className="h-64 min-h-[16rem] w-full min-w-0">
                    {chartReady ? (
                    <ResponsiveContainer width="100%" height={256} minWidth={0}>
                      <BarChart data={prepChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} unit="m" />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: chartTickStrong }} tickLine={false} axisLine={false} width={88} />
                        <Tooltip
                          contentStyle={chartTooltip}
                          formatter={(v: any, _: any, p: any) => [`${v} min avg`, `${p?.payload?.fullName ?? "Barista"} (${p?.payload?.orders ?? 0} orders)`]}
                        />
                        <Bar dataKey="avgMinutes" fill={tc.midBrown} radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-dark-brown uppercase tracking-tight mb-3">Barista Summary</h4>
                  <div className="overflow-x-auto rounded-2xl border border-dark-brown/10">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-dark-brown/5">
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55">Barista</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55">Orders</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55">Avg</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55 hidden sm:table-cell">Min–Max</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prepData.staff.map((s) => (
                          <tr key={s.user_id} className="border-t border-dark-brown/8">
                            <td className="px-4 py-3">
                              <p className="font-bold text-dark-brown">{s.name}</p>
                              <p className="text-[10px] text-dark-brown/40 font-mono">{s.employee_id || s.email}</p>
                            </td>
                            <td className="px-4 py-3 font-bold text-dark-brown tabular-nums">{s.orders_prepared}</td>
                            <td className="px-4 py-3 font-bold text-amber-800 tabular-nums">{s.avg_prep_label}</td>
                            <td className="px-4 py-3 text-xs text-dark-brown/55 hidden sm:table-cell">{s.min_prep_label} – {s.max_prep_label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {prepData.orders.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-bold text-dark-brown uppercase tracking-tight mb-3">Recent Measured Orders</h4>
                  <div className="overflow-x-auto rounded-2xl border border-dark-brown/10 max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 app-header-bar backdrop-blur-sm">
                        <tr className="bg-dark-brown/5">
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55">Order</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55">Barista</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55">Prep Time</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-dark-brown/55 hidden md:table-cell">Ready At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prepData.orders.slice(0, 20).map((o) => (
                          <tr key={`${o.order_label}-${o.ready_at}`} className="border-t border-dark-brown/8">
                            <td className="px-4 py-2.5 font-bold text-dark-brown uppercase text-xs">{o.order_label}</td>
                            <td className="px-4 py-2.5 text-dark-brown/70">{o.barista_name}</td>
                            <td className="px-4 py-2.5 font-bold text-amber-800">{o.prep_label}</td>
                            <td className="px-4 py-2.5 text-xs text-dark-brown/50 hidden md:table-cell">
                              {new Date(o.ready_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Charts Row 1: Revenue + Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 min-w-0">
          {/* Revenue Chart */}
          <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg min-w-0">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight mb-4">Revenue Trend</h3>
            <div className="h-64 min-h-[16rem] w-full min-w-0">
              {chartReady ? (
              <ResponsiveContainer width="100%" height={256} minWidth={0}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={tc.lightBrown} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={tc.lightBrown} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(dailyData.length / 7) - 1)} />
                  <YAxis tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} tickFormatter={v => `₱${v}`} />
                  <Tooltip contentStyle={chartTooltip} formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke={tc.lightBrown} strokeWidth={2.5} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* Daily Orders Chart */}
          <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg min-w-0">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight mb-4">Daily Orders</h3>
            <div className="h-64 min-h-[16rem] w-full min-w-0">
              {chartReady ? (
              <ResponsiveContainer width="100%" height={256} minWidth={0}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(dailyData.length / 7) - 1)} />
                  <YAxis tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltip} />
                  <Bar dataKey="orders" fill={tc.midBrown} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        </div>

        {/* Revenue by Order Type */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Summary Cards */}
          <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight mb-4">Revenue by Order Type</h3>
              <div className="space-y-4">
                {/* Dine-In */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-dark-brown flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-milk" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-dark-brown/50 uppercase tracking-wider">Dine-In</p>
                      <span className="text-xs font-bold text-dark-brown/40">{orderTypeRevenue.dineIn.pct}%</span>
                    </div>
                    <p className="text-xl font-bold text-dark-brown">₱{orderTypeRevenue.dineIn.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-dark-brown/40 font-bold uppercase">{orderTypeRevenue.dineIn.orders} order{orderTypeRevenue.dineIn.orders !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                {/* Takeout */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-light-brown flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-dark-brown" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v5H3z"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-dark-brown/50 uppercase tracking-wider">Takeout</p>
                      <span className="text-xs font-bold text-dark-brown/40">{orderTypeRevenue.takeout.pct}%</span>
                    </div>
                    <p className="text-xl font-bold text-dark-brown">₱{orderTypeRevenue.takeout.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-dark-brown/40 font-bold uppercase">{orderTypeRevenue.takeout.orders} order{orderTypeRevenue.takeout.orders !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-5">
              <div className="flex h-3 rounded-full overflow-hidden bg-dark-brown/5">
                <div className="bg-dark-brown rounded-l-full transition-all duration-700" style={{ width: `${orderTypeRevenue.dineIn.pct}%` }}></div>
                <div className="bg-light-brown rounded-r-full transition-all duration-700" style={{ width: `${orderTypeRevenue.takeout.pct}%` }}></div>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-bold text-dark-brown uppercase">Dine-In</span>
                <span className="text-[10px] font-bold text-light-brown uppercase">Takeout</span>
              </div>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg lg:col-span-2">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight mb-4">Revenue Comparison</h3>
            {orderTypeRevenue.total === 0 ? (
              <div className="h-64 flex items-center justify-center"><p className="font-paragraph text-dark-brown/40">No revenue data yet</p></div>
            ) : (
              <div className="h-64 min-h-[16rem] w-full min-w-0">
                {chartReady ? (
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={orderTypeRevenue.chartData} barSize={64}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="type" tick={{ fontSize: 13, fill: chartTickStrong, fontWeight: "bold" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₱${v}`} />
                    <Tooltip
                      contentStyle={chartTooltip}
                      formatter={(v: any, name: any) => {
                        if (name === "revenue") return [`₱${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Revenue"];
                        return [v, name];
                      }}
                    />
                    <Bar dataKey="revenue" radius={[12, 12, 0, 0]} animationDuration={1200} animationEasing="ease-out">
                      {orderTypeRevenue.chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Charts Row 2: Popular Drinks + Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Popular Drinks */}
          <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight mb-4">Popular Drinks</h3>
            {popularDrinks.length === 0 ? (
              <div className="h-64 flex items-center justify-center"><p className="font-paragraph text-dark-brown/40">No data yet</p></div>
            ) : (
              <div className="h-64 min-h-[16rem] w-full min-w-0">
                {chartReady ? (
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={popularDrinks} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: chartTick }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: chartTickStrong }} tickLine={false} axisLine={false} width={100} />
                    <Tooltip contentStyle={chartTooltip} formatter={(v: any, _: any, p: any) => [v, p?.payload?.fullName ?? ""]} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {popularDrinks.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </div>

          {/* Order Status Breakdown */}
          <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight mb-4">Order Status</h3>
            {statusBreakdown.length === 0 ? (
              <div className="h-64 flex items-center justify-center"><p className="font-paragraph text-dark-brown/40">No data yet</p></div>
            ) : (
              <div className="h-64 min-h-[16rem] w-full min-w-0 flex items-center">
                {chartReady ? (
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <PieChart>
                    <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {statusBreakdown.map((entry) => <Cell key={entry.name} fill={statusColorMap[entry.name] || "#ccc"} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders Table */}
        <div className="app-panel border rounded-3xl shadow-lg overflow-hidden">
          <div className="p-5 md:p-6 border-b border-dark-brown/10 flex items-center justify-between">
            <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight">Recent Orders</h3>
            <Link href="/admin" className="text-dark-brown/60 hover:text-dark-brown font-bold text-xs uppercase transition-colors">View All →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-paragraph text-dark-brown/50">No orders yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-dark-brown/5">
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">Order</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60 hidden md:table-cell">Customer</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">Items</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">Total</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(order => (
                    <tr key={order.id} className="border-t border-dark-brown/10 hover:bg-dark-brown/5 transition-colors">
                      <td className="px-5 py-4"><p className="font-bold text-dark-brown text-sm uppercase">{order.id}</p><p className="font-paragraph text-dark-brown/40 text-xs">{new Date(order.date).toLocaleDateString()}</p></td>
                      <td className="px-5 py-4 hidden md:table-cell"><p className="font-paragraph text-dark-brown text-sm">{order.userName}</p></td>
                      <td className="px-5 py-4"><p className="font-paragraph text-dark-brown text-sm">{order.totalItems} item{order.totalItems > 1 ? "s" : ""}</p></td>
                      <td className="px-5 py-4"><p className="font-bold text-dark-brown text-sm">₱{order.total.toFixed(2)}</p></td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${
                          order.status === "completed" ? "bg-green-100 text-green-700"
                          : order.status === "ready" ? "bg-blue-100 text-blue-700"
                          : order.status === "preparing" ? "bg-yellow-100 text-yellow-700"
                          : order.status === "cancelled" ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                        }`}>{order.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
