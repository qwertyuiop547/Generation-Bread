"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import { STAFF_POSITIONS } from "@/constants";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
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
  clocked_in: { label: "On Shift", color: "text-emerald-800", bg: "bg-emerald-50 border border-emerald-200", dot: "bg-emerald-500" },
  on_break: { label: "On Break", color: "text-amber-800", bg: "bg-amber-50 border border-amber-200", dot: "bg-amber-500 animate-pulse" },
  pending: { label: "Pending", color: "text-blue-800", bg: "bg-blue-50 border border-blue-200", dot: "bg-blue-500" },
  late: { label: "Late", color: "text-orange-800", bg: "bg-orange-50 border border-orange-200", dot: "bg-orange-500" },
  clocked_out: { label: "Done", color: "text-[#2A1810]/60", bg: "bg-[#2A1810]/5 border border-[#EBE3D7]", dot: "bg-[#2A1810]/30" },
  not_clocked_in: { label: "Not Yet In", color: "text-gray-700", bg: "bg-gray-50 border border-gray-200", dot: "bg-gray-400" },
  within_grace: { label: "Grace Period", color: "text-yellow-800", bg: "bg-yellow-50 border border-yellow-200", dot: "bg-yellow-500" },
  absent_today: { label: "Absent", color: "text-red-800", bg: "bg-red-50 border border-red-200", dot: "bg-red-500" },
  planned_absent: { label: "Planned Off", color: "text-indigo-800", bg: "bg-indigo-50 border border-indigo-200", dot: "bg-indigo-500" },
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

interface OrderItem {
  name: string;
  price: number;
  qty: number;
}

interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  totalItems: number;
  date: string;
  userEmail: string;
  userName: string;
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
    () => ["#E3A458", "#A26833", "#2A1810", "#7F3B2D", "#D97706", "#059669"],
    []
  );
  const chartTick = withAlpha("#2A1810", "88");
  const chartTickStrong = withAlpha("#2A1810", "cc");
  const chartGrid = withAlpha("#2A1810", "12");
  const chartTooltip = {
    borderRadius: 16,
    border: "1px solid #EBE3D7",
    background: "#FFFDF9",
    color: "#2A1810",
    boxShadow: "0 10px 25px rgba(42,24,16,0.1)",
    fontSize: 12,
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (mounted && !isLoggedIn) {
      router.push("/");
      return;
    }
    if (mounted && isLoggedIn && !isAdmin) {
      router.push(isStaff ? "/staff" : "/dashboard");
      return;
    }
  }, [mounted, isLoggedIn, isAdmin, router, isStaff]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email) return;
    const fetchOrders = async () => {
      try {
        const localRaw = localStorage.getItem("spylt_local_orders");
        const localOrders: Order[] = localRaw ? JSON.parse(localRaw) : [];
        let mapped: Order[] = [];
        try {
          const res = await authFetch(
            `${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}&limit=500`
          );
          if (res.ok) {
            const data = unwrapListResponse<any>(await res.json());
            mapped = data.map((d: any) => ({
              id: `ORD-${d.id.toString().padStart(4, "0")}`,
              items: Array.isArray(d.items) ? d.items.map((i: any) => ({ name: i.name, price: Number(i.price), qty: i.quantity })) : [],
              total: Number(d.total_price),
              totalItems: Array.isArray(d.items) ? d.items.reduce((s: number, i: any) => s + i.quantity, 0) : 0,
              date: d.created_at,
              userEmail: d.user_email,
              userName: d.user_name || d.user_email,
              status: d.status,
              orderType: d.order_type || "takeout",
            }));
          }
        } catch {}
        setOrders([...mapped, ...localOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch {
        setOrders([]);
      }
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
        const res = await authFetch(
          `${API_BASE_URL}/api/auth/admin/today-shift-lineup/?admin_email=${encodeURIComponent(user.email)}`
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
        const res = await authFetch(`${API_BASE_URL}/api/auth/admin/drink-prep-times/?${params}`);
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
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/drink-prep-times/export/?${params}`);
      if (!res.ok) throw new Error("Failed to export prep times");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `generation-bread-prep-times-${prepDays}d.csv`;
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
    () =>
      (prepData?.staff || []).map((s) => ({
        name: s.name.length > 12 ? `${s.name.slice(0, 10)}…` : s.name,
        fullName: s.name,
        avgMinutes: Math.round((s.avg_prep_seconds / 60) * 10) / 10,
        orders: s.orders_prepared,
      })),
    [prepData]
  );

  const filteredOrders = useMemo(() => {
    if (timeRange === "all") return orders;
    const days = timeRange === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return orders.filter((o) => new Date(o.date) >= cutoff);
  }, [orders, timeRange]);

  const dailyData = useMemo(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 60;
    const map: Record<string, { orders: number; revenue: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      map[key] = { orders: 0, revenue: 0 };
    }
    filteredOrders
      .filter((o) => o.status !== "cancelled")
      .forEach((o) => {
        const key = new Date(o.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (map[key]) {
          map[key].orders++;
          map[key].revenue += o.total;
        }
      });
    return Object.entries(map).map(([date, v]) => ({ date, ...v }));
  }, [filteredOrders, timeRange]);

  const popularDrinks = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) =>
      o.items.forEach((i) => {
        const base = menuDrinks.find((d) => i.name.startsWith(d)) || i.name;
        map[base] = (map[base] || 0) + i.qty;
      })
    );
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({
        name: name.length > 14 ? name.slice(0, 12) + "…" : name,
        value,
        fullName: name,
      }));
  }, [filteredOrders]);

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      map[o.status] = (map[o.status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const orderTypeRevenue = useMemo(() => {
    const active = filteredOrders.filter((o) => o.status !== "cancelled");
    const dineIn = active.filter((o) => o.orderType === "dine_in" || o.orderType === "Dine-In");
    const takeout = active.filter((o) => o.orderType !== "dine_in" && o.orderType !== "Dine-In");
    const dineInRevenue = dineIn.reduce((s, o) => s + o.total, 0);
    const takeoutRevenue = takeout.reduce((s, o) => s + o.total, 0);
    const total = dineInRevenue + takeoutRevenue;
    return {
      dineIn: { revenue: dineInRevenue, orders: dineIn.length, pct: total > 0 ? Math.round((dineInRevenue / total) * 100) : 0 },
      takeout: { revenue: takeoutRevenue, orders: takeout.length, pct: total > 0 ? Math.round((takeoutRevenue / total) * 100) : 0 },
      total,
      chartData: [
        { type: "Dine-In", revenue: dineInRevenue, orders: dineIn.length, fill: "#2A1810" },
        { type: "Takeout", revenue: takeoutRevenue, orders: takeout.length, fill: "#E3A458" },
      ],
    };
  }, [filteredOrders]);

  const stats = useMemo(() => {
    const active = filteredOrders.filter((o) => o.status !== "cancelled");
    return {
      totalOrders: filteredOrders.length,
      totalRevenue: active.reduce((s, o) => s + o.total, 0),
      avgOrderValue: active.length > 0 ? active.reduce((s, o) => s + o.total, 0) / active.length : 0,
      pending: filteredOrders.filter((o) => o.status === "pending").length,
      completed: filteredOrders.filter((o) => o.status === "completed").length,
    };
  }, [filteredOrders]);

  const recentOrders = filteredOrders.slice(0, 6);

  if (!mounted || !isLoggedIn || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
        <div className="w-9 h-9 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin" />
      </div>
    );
  }

  const statusColorMap: Record<string, string> = {
    pending: "#9CA3AF",
    preparing: "#D97706",
    ready: "#2563EB",
    completed: "#059669",
    cancelled: "#DC2626",
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-[#FAF6F0] text-[#2A1810] pb-24 relative selection:bg-[#E3A458]/30">
      {/* Background Ambience Glows */}
      <div className="fixed top-0 right-1/4 w-96 h-96 bg-[#E3A458]/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 left-10 w-96 h-96 bg-[#7F3B2D]/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Sticky Glass Navbar */}
      <header className="sticky top-0 z-40 bg-[#FFFDF9]/85 backdrop-blur-xl border-b border-[#EBE3D7] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            {/* Brand Logo & Section */}
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/admin" className="flex items-center gap-3 group">
                <div className="w-11 h-11 rounded-2xl bg-[#2A1810] border border-[#E3A458]/40 flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
                  <CroissantLogoIcon className="w-6 h-6 text-[#FAEADE] transition-transform duration-300 group-hover:rotate-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold tracking-tight text-[#2A1810] text-sm uppercase">GENERATION</span>
                    <span className="font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#E3A458] to-[#A26833] text-sm uppercase">
                      BREAD
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A26833] truncate">
                      Executive Analytics & Operations
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Desktop & Mobile Actions */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <NotificationBell userEmail={user?.email} />

              <button
                type="button"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
                className="xl:hidden p-2 text-[#2A1810] hover:bg-[#2A1810]/5 rounded-2xl transition-colors"
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

              <div className="hidden xl:flex items-center gap-2">
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>Orders & Shifts</span>
                </Link>

                <Link
                  href="/admin-menu"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                  <span>Menu & Items</span>
                </Link>

                <Link
                  href="/admin-sales"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span>Sales Ledger</span>
                </Link>

                <Link
                  href="/admin-tables"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  <span>Tables</span>
                </Link>

                <Link
                  href="/staff"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                  title="Switch to Kitchen Station Live Order Display"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>
                  <span>Kitchen View</span>
                </Link>

                <button
                  onClick={() => {
                    void performLogout(signOut);
                  }}
                  className="flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#7F3B2D] hover:text-white bg-red-50 hover:bg-[#7F3B2D] border border-red-200 hover:border-transparent transition-all shadow-xs"
                >
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {showMobileMenu && (
          <div
            ref={mobileMenuRef}
            className="mobile-nav-menu xl:hidden absolute top-[100%] right-0 w-full bg-[#FFFDF9] border-b border-[#EBE3D7] shadow-2xl flex flex-col items-center py-5 gap-3 z-50 will-change-transform"
          >
            <Link
              href="/admin"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold text-xs uppercase rounded-2xl py-3.5 px-5 transition-all border border-[#EBE3D7]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>Orders & Shifts</span>
            </Link>
            <Link
              href="/admin-menu"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold text-xs uppercase rounded-2xl py-3.5 px-5 transition-all border border-[#EBE3D7]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              <span>Menu & Items</span>
            </Link>
            <Link
              href="/admin-sales"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold text-xs uppercase rounded-2xl py-3.5 px-5 transition-all border border-[#EBE3D7]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Sales Ledger</span>
            </Link>
            <Link
              href="/admin-tables"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold text-xs uppercase rounded-2xl py-3.5 px-5 transition-all border border-[#EBE3D7]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              <span>Tables</span>
            </Link>
            <Link
              href="/staff"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold text-xs uppercase rounded-2xl py-3.5 px-5 transition-all border border-[#EBE3D7]"
            >
              <span>👨‍🍳 Staff Portal</span>
            </Link>
            <button
              onClick={() => {
                void performLogout(signOut);
              }}
              className="mobile-nav-item flex items-center justify-between gap-3 w-[90%] bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs uppercase rounded-2xl py-3.5 px-5 transition-all border border-red-200"
            >
              <span>Sign Out</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Welcome Header + Range Pills */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBE3D7]/70 text-[#A26833] text-[11px] font-extrabold uppercase tracking-widest mb-2 border border-[#EBE3D7]">
              <span>📊 Real-Time Operations Intelligence</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#2A1810] tracking-tight uppercase">
              Operations & Analytics
            </h1>
            <p className="font-paragraph text-[#2A1810]/60 text-sm sm:text-base mt-1">
              Sales performance, peak customer traffic, barista prep time benchmarks, and active kitchen shift lineup.
            </p>
          </div>

          <div className="flex items-center gap-2 p-1 rounded-full bg-[#EBE3D7]/60 border border-[#EBE3D7] w-fit shadow-inner self-start sm:self-auto">
            {(["7d", "30d", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-5 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all duration-200 ${
                  timeRange === r
                    ? "bg-[#2A1810] text-[#FAEADE] shadow-md -translate-y-0.5"
                    : "text-[#2A1810]/70 hover:text-[#2A1810] hover:bg-white/60"
                }`}
              >
                {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "All Time"}
              </button>
            ))}
          </div>
        </div>

        {/* 5 KPI Summary Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {/* Total Orders */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Total Orders
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#2A1810]/5 text-[#2A1810] flex items-center justify-center text-sm font-bold border border-[#EBE3D7]">
                📦
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              {stats.totalOrders}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">In selected range</p>
          </div>

          {/* Gross Revenue */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Gross Revenue
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-extrabold text-sm border border-emerald-200">
                ₱
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              ₱{stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Fulfilled sales</p>
          </div>

          {/* Average Order Value */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Avg. Ticket (AOV)
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold text-sm border border-amber-200">
                📊
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              ₱{stats.avgOrderValue.toFixed(0)}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Per transaction</p>
          </div>

          {/* Pending Queue */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Pending Queue
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200">
                ⏳
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
                {stats.pending}
              </p>
              {stats.pending > 0 && (
                <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Orders awaiting prep</p>
          </div>

          {/* Registered Customers */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Customers
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#2A1810]/5 text-[#A26833] flex items-center justify-center font-bold text-sm border border-[#EBE3D7]">
                👥
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              {totalUsers}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Registered patron accounts</p>
          </div>
        </div>

        {/* Today's Shift Lineup & Planned Absences Card */}
        <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 sm:p-7 shadow-[0_4px_24px_rgba(42,24,16,0.06)] mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 pb-4 border-b border-[#EBE3D7]/70">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">👨‍🍳</span>
                <h3 className="text-xl font-black text-[#2A1810] uppercase tracking-tight">
                  Today&apos;s Shift Lineup
                </h3>
              </div>
              <p className="font-paragraph text-[#2A1810]/60 text-xs sm:text-sm mt-0.5">
                {shiftLineup?.date_label || "Active roster schedule, station assignments, and live time clock attendance"}
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5EFE6] hover:bg-[#EBE3D7] text-[#2A1810] font-extrabold text-xs uppercase tracking-wider transition-all border border-[#EBE3D7] shadow-xs self-start sm:self-auto"
            >
              <span>Manage Shifts & Attendance</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>

          {lineupLoading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin mb-2" />
              <p className="text-xs font-bold uppercase text-[#2A1810]/50 tracking-wider">Loading shift roster…</p>
            </div>
          ) : !shiftLineup || shiftLineup.lineup.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-[#EBE3D7] bg-[#FAF6F0]/60">
              <p className="text-4xl mb-2">📋</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">No shifts scheduled for today</p>
              <p className="font-paragraph text-xs text-[#2A1810]/50 mt-1 max-w-sm mx-auto">
                Assign staff members to stations in the Attendance tab of the Admin portal.
              </p>
              <Link
                href="/admin"
                className="inline-block mt-4 text-xs font-extrabold uppercase px-5 py-2.5 rounded-full bg-[#2A1810] text-[#FAEADE] shadow-sm hover:shadow-md transition-all"
              >
                Assign Today&apos;s Shifts
              </Link>
            </div>
          ) : (
            <>
              {/* Summary Counter Pills */}
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#2A1810]/5 border border-[#EBE3D7] text-[11px] font-extrabold uppercase text-[#2A1810]/70">
                  {shiftLineup.summary.scheduled} Scheduled
                </span>
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold uppercase text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {shiftLineup.summary.clocked_in} On Shift
                </span>
                {shiftLineup.summary.not_yet_in > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-yellow-50 border border-yellow-200 text-[11px] font-extrabold uppercase text-yellow-800">
                    {shiftLineup.summary.not_yet_in} Not Yet In
                  </span>
                )}
                {shiftLineup.summary.absent_today > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-extrabold uppercase text-red-800">
                    {shiftLineup.summary.absent_today} Absent
                  </span>
                )}
                {shiftLineup.summary.planned_absent > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] font-extrabold uppercase text-indigo-800">
                    {shiftLineup.summary.planned_absent} Planned Off
                  </span>
                )}
              </div>

              {/* Grid of Shift Lineup Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {shiftLineup.lineup.map((entry) => {
                  const statusCfg = LINEUP_STATUS[entry.display_status] || LINEUP_STATUS.not_clocked_in;
                  const pos = STAFF_POSITIONS.find((p) => p.key === entry.station);
                  const isOff = entry.display_status === "planned_absent";
                  return (
                    <div
                      key={`${entry.user_id}-${entry.start_time}`}
                      className={`flex items-center gap-3.5 p-4 rounded-2xl border transition-all hover:shadow-md ${
                        isOff
                          ? "bg-indigo-50/40 border-indigo-200/60 opacity-85"
                          : entry.display_status === "absent_today"
                          ? "bg-red-50/40 border-red-200/60"
                          : "bg-white/80 border-[#EBE3D7] hover:border-[#A26833]/40"
                      }`}
                    >
                      {entry.avatar ? (
                        <Image
                          src={entry.avatar}
                          alt={entry.name}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-[#EBE3D7]"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#F5EFE6] text-[#2A1810] flex items-center justify-center text-sm font-extrabold uppercase flex-shrink-0 border border-[#EBE3D7]">
                          {entry.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-extrabold text-[#2A1810] truncate ${
                                isOff ? "line-through decoration-indigo-400/70" : ""
                              }`}
                            >
                              {entry.name}
                            </p>
                            <p className="text-[11px] text-[#2A1810]/55 font-mono font-medium">
                              {formatLineupTime(entry.start_time)} – {formatLineupTime(entry.end_time)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase flex-shrink-0 shadow-xs ${statusCfg.color} ${statusCfg.bg}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${
                                entry.display_status === "pending" || entry.display_status === "absent_today"
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                            {statusCfg.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${
                              pos?.badge || "bg-gray-100"
                            } ${pos?.badgeText || "text-gray-700"}`}
                          >
                            {pos?.icon || "📍"} {entry.station_display}
                          </span>
                          {entry.source === "assigned" ? (
                            <span className="text-[9px] font-extrabold uppercase text-[#2A1810]/40">
                              Assigned
                            </span>
                          ) : (
                            <span className="text-[9px] font-extrabold uppercase text-[#2A1810]/40">
                              Default
                            </span>
                          )}
                          {entry.clock_in && !isOff && (
                            <span className="text-[10px] text-emerald-800 font-mono font-bold">
                              In {new Date(entry.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>

                        {entry.planned_absence && (
                          <div className="mt-1.5 bg-indigo-50/80 border border-indigo-200/60 rounded-lg px-2 py-0.5">
                            <p
                              className="text-[10px] text-indigo-900 font-paragraph truncate"
                              title={entry.planned_absence.reason}
                            >
                              🗓️ {entry.planned_absence.reason}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Average Drink Prep Time Benchmarking Card */}
        <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 sm:p-7 shadow-[0_4px_24px_rgba(42,24,16,0.06)] mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6 pb-4 border-b border-[#EBE3D7]/70">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">⏱️</span>
                <h3 className="text-xl font-black text-[#2A1810] uppercase tracking-tight">
                  Barista Beverage Prep Benchmarks
                </h3>
              </div>
              <p className="font-paragraph text-[#2A1810]/60 text-xs sm:text-sm mt-0.5">
                Time elapsed from <strong>Preparing → Ready</strong> per order, averaged per barista.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPrepDays(d)}
                  className={`px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                    prepDays === d
                      ? "bg-[#2A1810] text-[#FAEADE] shadow-sm"
                      : "bg-[#F5EFE6] text-[#2A1810]/70 hover:bg-[#EBE3D7] hover:text-[#2A1810]"
                  }`}
                >
                  {d} Days
                </button>
              ))}
              <button
                type="button"
                onClick={exportPrepTimesCsv}
                disabled={prepExportLoading || !prepData?.orders?.length}
                className="px-4 py-2 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold uppercase transition-all disabled:opacity-40 shadow-xs active:scale-95"
              >
                {prepExportLoading ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>

          {prepLoading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin mb-2" />
              <p className="text-xs font-bold uppercase text-[#2A1810]/50 tracking-wider">Measuring order speeds…</p>
            </div>
          ) : !prepData || prepData.summary.total_orders_measured === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-[#EBE3D7] bg-[#FAF6F0]/60">
              <p className="text-4xl mb-2">☕</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">
                No prep time data yet for the last {prepDays} days
              </p>
              <p className="text-xs text-[#2A1810]/50 font-paragraph mt-1 max-w-md mx-auto">
                Data is logged when kitchen staff transition orders from <strong>Preparing</strong> to <strong>Ready</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* Prep Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl bg-amber-50/80 border border-amber-200/60 p-4 text-center">
                  <p className="text-2xl font-black text-amber-900 font-mono">{prepData.summary.overall_avg_label}</p>
                  <p className="text-[10px] font-extrabold uppercase text-amber-800/70 mt-1">Overall Speed Avg</p>
                </div>
                <div className="rounded-2xl bg-[#F5EFE6] border border-[#EBE3D7] p-4 text-center">
                  <p className="text-2xl font-black text-[#2A1810] font-mono">{prepData.summary.total_orders_measured}</p>
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/60 mt-1">Orders Measured</p>
                </div>
                <div className="rounded-2xl bg-[#F5EFE6] border border-[#EBE3D7] p-4 text-center">
                  <p className="text-2xl font-black text-[#2A1810] font-mono">{prepData.summary.baristas_with_data}</p>
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/60 mt-1">Active Baristas</p>
                </div>
                <div className="rounded-2xl bg-[#F5EFE6] border border-[#EBE3D7] p-4 text-center">
                  <p className="text-2xl font-black text-[#2A1810] font-mono">{prepDays} Days</p>
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/60 mt-1">Sampling Window</p>
                </div>
              </div>

              {/* Chart + Barista Table */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/70 mb-3">
                    Average Prep Time by Staff (Minutes)
                  </h4>
                  <div className="h-64 min-h-[16rem] w-full min-w-0 bg-white/60 rounded-2xl border border-[#EBE3D7] p-3">
                    {chartReady ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={prepChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 11, fill: chartTick }}
                            tickLine={false}
                            axisLine={false}
                            unit="m"
                          />
                          <YAxis
                            dataKey="name"
                            type="category"
                            tick={{ fontSize: 11, fill: chartTickStrong, fontWeight: "bold" }}
                            tickLine={false}
                            axisLine={false}
                            width={88}
                          />
                          <Tooltip
                            contentStyle={chartTooltip}
                            formatter={(v: any, _: any, p: any) => [
                              `${v} min average`,
                              `${p?.payload?.fullName ?? "Barista"} (${p?.payload?.orders ?? 0} orders)`,
                            ]}
                          />
                          <Bar dataKey="avgMinutes" fill="#A26833" radius={[0, 8, 8, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/70 mb-3">
                    Barista Benchmarking Breakdown
                  </h4>
                  <div className="overflow-x-auto rounded-2xl border border-[#EBE3D7] bg-white/60">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-[#FAF6F0] border-b border-[#EBE3D7]">
                          <th className="px-4 py-3 text-[10px] font-extrabold uppercase text-[#2A1810]/60">Barista</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold uppercase text-[#2A1810]/60">Orders</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold uppercase text-[#2A1810]/60">Avg Time</th>
                          <th className="px-4 py-3 text-[10px] font-extrabold uppercase text-[#2A1810]/60 hidden sm:table-cell">Range (Min–Max)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EBE3D7]/60">
                        {prepData.staff.map((s) => (
                          <tr key={s.user_id} className="hover:bg-[#FAF6F0] transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-[#2A1810]">{s.name}</p>
                              <p className="text-[10px] text-[#2A1810]/40 font-mono">{s.employee_id || s.email}</p>
                            </td>
                            <td className="px-4 py-3 font-bold text-[#2A1810] font-mono">{s.orders_prepared}</td>
                            <td className="px-4 py-3 font-extrabold text-[#A26833] font-mono">{s.avg_prep_label}</td>
                            <td className="px-4 py-3 text-xs text-[#2A1810]/60 font-mono hidden sm:table-cell">
                              {s.min_prep_label} – {s.max_prep_label}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Charts Row: Revenue Trend & Daily Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue Trend Chart */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] min-w-0">
            <h3 className="text-lg font-black text-[#2A1810] uppercase tracking-tight mb-4">
              Revenue Trajectory
            </h3>
            <div className="h-64 min-h-[16rem] w-full min-w-0">
              {chartReady ? (
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E3A458" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#E3A458" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: chartTick }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.floor(dailyData.length / 7) - 1)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTick }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `₱${v}`}
                    />
                    <Tooltip
                      contentStyle={chartTooltip}
                      formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "Revenue"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#E3A458"
                      strokeWidth={3}
                      fill="url(#revGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {/* Daily Orders Chart */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] min-w-0">
            <h3 className="text-lg font-black text-[#2A1810] uppercase tracking-tight mb-4">
              Daily Order Volume
            </h3>
            <div className="h-64 min-h-[16rem] w-full min-w-0">
              {chartReady ? (
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: chartTick }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.floor(dailyData.length / 7) - 1)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTick }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={chartTooltip} />
                    <Bar dataKey="orders" fill="#A26833" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        </div>

        {/* Revenue by Order Type & Popular Items */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Order Type Split */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-[#2A1810] uppercase tracking-tight mb-4">
                Revenue by Dining Type
              </h3>
              <div className="space-y-4">
                {/* Dine-In */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#2A1810] text-[#FAEADE] flex items-center justify-center flex-shrink-0 shadow-xs">
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-extrabold text-[#2A1810]/60 uppercase tracking-wider">Dine-In</p>
                      <span className="text-xs font-black text-[#2A1810]">{orderTypeRevenue.dineIn.pct}%</span>
                    </div>
                    <p className="text-xl font-black text-[#2A1810] font-mono">
                      ₱{orderTypeRevenue.dineIn.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-[#2A1810]/40 font-bold uppercase">
                      {orderTypeRevenue.dineIn.orders} order{orderTypeRevenue.dineIn.orders !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Takeout */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#E3A458] text-[#2A1810] flex items-center justify-center flex-shrink-0 shadow-xs">
                    🛍️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-extrabold text-[#2A1810]/60 uppercase tracking-wider">Takeout</p>
                      <span className="text-xs font-black text-[#2A1810]">{orderTypeRevenue.takeout.pct}%</span>
                    </div>
                    <p className="text-xl font-black text-[#2A1810] font-mono">
                      ₱{orderTypeRevenue.takeout.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-[#2A1810]/40 font-bold uppercase">
                      {orderTypeRevenue.takeout.orders} order{orderTypeRevenue.takeout.orders !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Split Progress Bar */}
            <div className="mt-6">
              <div className="flex h-3.5 rounded-full overflow-hidden bg-[#2A1810]/10 p-0.5 border border-[#EBE3D7]">
                <div
                  className="bg-[#2A1810] rounded-l-full transition-all duration-700"
                  style={{ width: `${orderTypeRevenue.dineIn.pct}%` }}
                />
                <div
                  className="bg-[#E3A458] rounded-r-full transition-all duration-700"
                  style={{ width: `${orderTypeRevenue.takeout.pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 font-mono text-[10px] font-extrabold uppercase">
                <span className="text-[#2A1810]">Dine-In ({orderTypeRevenue.dineIn.pct}%)</span>
                <span className="text-[#A26833]">Takeout ({orderTypeRevenue.takeout.pct}%)</span>
              </div>
            </div>
          </div>

          {/* Popular Items & Drinks Bar Chart */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)] lg:col-span-2">
            <h3 className="text-lg font-black text-[#2A1810] uppercase tracking-tight mb-4">
              Top Selling Bakes & Beverages
            </h3>
            {popularDrinks.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <p className="font-paragraph text-[#2A1810]/40">No order data yet</p>
              </div>
            ) : (
              <div className="h-64 min-h-[16rem] w-full min-w-0">
                {chartReady ? (
                  <ResponsiveContainer width="100%" height={256} minWidth={0}>
                    <BarChart data={popularDrinks} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: chartTick }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 11, fill: chartTickStrong, fontWeight: "bold" }}
                        tickLine={false}
                        axisLine={false}
                        width={110}
                      />
                      <Tooltip
                        contentStyle={chartTooltip}
                        formatter={(v: any, _: any, p: any) => [`${v} sold`, p?.payload?.fullName ?? ""]}
                      />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                        {popularDrinks.map((_, i) => (
                          <Cell key={i} fill={chartColors[i % chartColors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders Ledger Card */}
        <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_4px_24px_rgba(42,24,16,0.06)] overflow-hidden">
          <div className="p-6 border-b border-[#EBE3D7]/70 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-[#2A1810] uppercase tracking-tight">
                Recent Orders Activity
              </h3>
              <p className="text-xs text-[#2A1810]/50 font-paragraph mt-0.5">
                Latest customer submissions and order statuses
              </p>
            </div>
            <Link
              href="/admin"
              className="text-xs font-extrabold uppercase text-[#A26833] hover:text-[#2A1810] transition-colors flex items-center gap-1"
            >
              <span>View All in Orders</span>
              <span>→</span>
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-4xl mb-2">📋</p>
              <p className="font-extrabold uppercase text-[#2A1810]/50 text-sm">No orders yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF6F0] text-[11px] font-extrabold uppercase text-[#2A1810]/60 border-b border-[#EBE3D7]">
                    <th className="px-6 py-4">Order ID & Date</th>
                    <th className="px-6 py-4 hidden md:table-cell">Customer</th>
                    <th className="px-6 py-4">Quantity</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE3D7]/60 text-sm">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#FAF6F0] transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-extrabold font-mono text-[#2A1810] text-sm uppercase">{order.id}</p>
                        <p className="font-paragraph text-[#2A1810]/40 text-xs mt-0.5">
                          {new Date(order.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <p className="font-bold text-[#2A1810] text-sm">{order.userName}</p>
                        <p className="font-paragraph text-[#2A1810]/40 text-xs truncate max-w-xs">{order.userEmail}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-xs text-[#2A1810] bg-[#2A1810]/5 px-2 py-1 rounded-md">
                          {order.totalItems} item{order.totalItems !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-black text-[#2A1810] font-mono text-base">₱{order.total.toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-[10px] font-extrabold uppercase border shadow-xs ${
                            order.status === "completed"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : order.status === "ready"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : order.status === "preparing"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : order.status === "cancelled"
                              ? "bg-red-50 text-red-800 border-red-200"
                              : "bg-gray-50 text-gray-800 border-gray-200"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
