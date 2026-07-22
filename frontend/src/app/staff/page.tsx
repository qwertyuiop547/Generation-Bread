"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authHeaders, getAccessToken } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import { useLanguage } from "@/context/LanguageContext";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
import { useStaffOrdersRealtime } from "@/hooks/useStaffOrdersRealtime";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface OrderItem {
  name: string;
  price: number;
  qty: number;
  notes?: string;
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
  orderType?: "Dine-In" | "Takeout" | "Scheduled";
  tableNumber?: string | null;
  pickupTime?: string | null;
  voidReason?: string;
  paymentMethod?: string;
  paymentStatus?: "unpaid" | "paid" | "";
}

interface TableInfo {
  table_number: string;
  table_status: "free" | "ordering" | "occupied";
  order_status: string | null;
  customer_name: string | null;
  total_price: string | null;
}

const STATUS_FLOW: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  preparing: "bg-orange-100 text-orange-800 border-orange-200",
  ready: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_DOTS: Record<string, string> = {
  pending: "bg-yellow-500",
  preparing: "bg-orange-500",
  ready: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

export default function StaffDashboardPage() {
  const { isLoggedIn, isAuthLoading, isStaff, user, accessToken } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [filter, setFilter] = useState<"all" | Order["status"]>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"orders" | "tables" | "contacts">("orders");
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [canClockIn, setCanClockIn] = useState(false);
  const [shiftStatusLoaded, setShiftStatusLoaded] = useState(false);
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [shiftEnd, setShiftEnd] = useState<string | null>(null);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [shiftElapsed, setShiftElapsed] = useState("");
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [absenceFormDate, setAbsenceFormDate] = useState("");
  const [absenceFormReason, setAbsenceFormReason] = useState("");
  const [absenceFormLoading, setAbsenceFormLoading] = useState(false);
  const [myAbsenceRequests, setMyAbsenceRequests] = useState<any[]>([]);
  const [voidModalOrderId, setVoidModalOrderId] = useState<string | null>(null);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
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

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { setMounted(true); }, []);

  // Auth guard: redirect non-staff users, but only after auth is fully resolved
  // Check localStorage as fallback to prevent redirect during auth rehydration
  const storedUserRaw = typeof window !== "undefined" ? localStorage.getItem("spylt_user") : null;
  const storedRole = storedUserRaw ? (() => { try { return JSON.parse(storedUserRaw).role; } catch { return null; } })() : null;
  const isStoredStaff = storedRole === "staff" || storedRole === "admin";

  useEffect(() => {
    if (!mounted || isAuthLoading) return;
    if (!isLoggedIn && !storedUserRaw) { router.push("/"); return; }
    if (!isStaff && !isStoredStaff) { router.push("/dashboard"); return; }
  }, [mounted, isAuthLoading, isLoggedIn, isStaff, router]);

  // Fetch orders (realtime via WebSocket + fallback poll)
  const fetchOrders = useCallback(async () => {
    if (!user?.email) return;
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      const localOrders: Order[] = localOrdersRaw ? JSON.parse(localOrdersRaw) : [];
      let mapped: Order[] = [];
      try {
        if (!getAccessToken()) {
          setOrders(localOrders);
          return;
        }
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}&limit=500`, { headers: authHeaders() });
        if (res.ok) {
          const data = unwrapListResponse<any>(await res.json());
          mapped = data.map((d: any) => ({
            id: `ORD-${d.id.toString().padStart(4, "0")}`,
            items: d.items.map((i: any) => ({ name: i.name, price: Number(i.price), qty: i.quantity, notes: i.notes })),
            total: Number(d.total_price),
            totalItems: d.items.reduce((sum: number, i: any) => sum + i.quantity, 0),
            date: d.created_at,
            userEmail: d.user_email,
            userName: d.customer_name || d.user_name || d.user_email,
            status: d.status,
            orderType: d.order_type === "dine_in" ? "Dine-In" : d.order_type === "scheduled" ? "Scheduled" : "Takeout",
            tableNumber: d.table_number || null,
            pickupTime: d.pickup_time || null,
            voidReason: d.void_reason || undefined,
            paymentMethod: d.payment_method || "",
            paymentStatus: d.payment_status || "unpaid",
          }));
        } else if (res.status === 401 || res.status === 403) {
          setToast({
            message: "Session expired — sign in again to see kitchen orders.",
            type: "error",
          });
          setTimeout(() => setToast(null), 4000);
        }
      } catch { }
      setOrders([...mapped, ...localOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch { setOrders([]); }
  }, [user?.email]);

  useStaffOrdersRealtime(
    mounted && isLoggedIn && isStaff && !!user?.email && !!accessToken,
    fetchOrders
  );

  // Fetch staff contacts
  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff || !user?.email) return;
    const fetchStaff = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/staff/?admin_email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setStaffUsers(data);
        }
      } catch {}
    };
    fetchStaff();
    const interval = setInterval(fetchStaff, 30000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isStaff, user?.email]);

  const fetchMyAbsenceRequests = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/absence-requests/?email=${encodeURIComponent(user.email)}&status=approved`, { headers: authHeaders() });
      if (res.ok) setMyAbsenceRequests(await res.json());
    } catch {
      setMyAbsenceRequests([]);
    }
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff || !user?.email) return;
    fetchMyAbsenceRequests();
  }, [mounted, isLoggedIn, isStaff, user?.email]);

  const submitAbsenceRequest = async () => {
    if (!user?.email || !absenceFormDate || !absenceFormReason.trim()) {
      showToast("Please enter date and reason.", "error");
      return;
    }
    setAbsenceFormLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/absence-requests/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          email: user.email,
          absence_date: absenceFormDate,
          reason: absenceFormReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      showToast("Planned absence logged", "success");
      setAbsenceFormDate("");
      setAbsenceFormReason("");
      fetchMyAbsenceRequests();
    } catch (err: any) {
      showToast(err.message || "Failed to submit", "error");
    } finally {
      setAbsenceFormLoading(false);
    }
  };

  const cancelMyAbsenceRequest = async (id: number) => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/absence-requests/${id}/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      showToast("Planned absence cancelled", "success");
      fetchMyAbsenceRequests();
    } catch (err: any) {
      showToast(err.message || "Failed to cancel", "error");
    }
  };

  // Fetch shift status
  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff || !user?.email) return;
    if (!accessToken && !getAccessToken()) {
      setShiftStatusLoaded(true);
      setCanClockIn(false);
      return;
    }
    const fetchShiftStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/shift/status/?email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setIsClockedIn(!!data.is_clocked_in);
          setIsPending(data.is_pending || false);
          setIsLate(data.current_shift?.attendance_mark === 'late' || false);
          setIsOnBreak(data.is_on_break || false);
          setCanClockIn(data.can_clock_in === true);
          setShiftStart(data.shift_start || null);
          setShiftEnd(data.shift_end || null);
          setCurrentShift(data.current_shift);
          setRecentShifts(data.recent_shifts || []);
        } else if (res.status === 401 || res.status === 403) {
          setCanClockIn(false);
        }
      } catch {
        /* ignore */
      } finally {
        setShiftStatusLoaded(true);
      }
    };
    fetchShiftStatus();
    const interval = setInterval(fetchShiftStatus, 30000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isStaff, user?.email, accessToken]);

  // Elapsed time ticker when clocked in
  useEffect(() => {
    if (!isClockedIn || !currentShift?.clock_in) { setShiftElapsed(""); return; }
    const updateElapsed = () => {
      const start = new Date(currentShift.clock_in).getTime();
      const diff = Date.now() - start;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setShiftElapsed(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, currentShift]);

  const handleClockIn = async () => {
    if (!user?.email) return;
    if (!getAccessToken()) {
      showToast("Session expired — please sign in again to clock in.", "error");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/shift/clock-in/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: user.email }),
      });
      let data: { error?: string; detail?: string; retry_after?: number; id?: number } = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      const message =
        (typeof data.error === "string" && data.error) ||
        (typeof data.detail === "string" && data.detail) ||
        "Failed to clock in";
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          showToast("Session expired — please sign in again to clock in.", "error");
          return;
        }
        if (res.status === 429) {
          showToast(message.includes("Too many") ? message : "Too many requests — wait a moment, then clock in again.", "error");
          return;
        }
        if (/already clocked in/i.test(message)) {
          // Sync UI: staff is already on shift / pending approval.
          try {
            const st = await fetch(`${API_BASE_URL}/api/auth/shift/status/?email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
            if (st.ok) {
              const statusData = await st.json();
              setIsClockedIn(!!statusData.is_clocked_in);
              setIsPending(statusData.is_pending || false);
              setIsLate(statusData.current_shift?.attendance_mark === "late" || false);
              setIsOnBreak(statusData.is_on_break || false);
              setCanClockIn(statusData.can_clock_in === true);
              setCurrentShift(statusData.current_shift);
              setRecentShifts(statusData.recent_shifts || []);
            }
          } catch {
            /* ignore */
          }
          showToast("You're already clocked in. Waiting for admin approval if still pending.", "success");
          return;
        }
        showToast(message, "error");
        return;
      }
      setIsClockedIn(true);
      setIsPending(true);
      setCanClockIn(false);
      setCurrentShift(data);
      setRecentShifts(prev => [data, ...prev.filter(s => s.id !== data.id)].slice(0, 5));
      showToast("Clock-in submitted! Waiting for admin approval.", "success");
    } catch {
      showToast("Unable to reach the server. Check connection and try again.", "error");
    }
  };

  const handleClockOut = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/shift/clock-out/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to clock out", "error"); return; }
      setIsClockedIn(false);
      setCurrentShift(null);
      setShiftElapsed("");
      setRecentShifts(prev => [data, ...prev.filter(s => s.id !== data.id)].slice(0, 5));
      showToast("Clocked out successfully!", "success");
    } catch { showToast("Failed to clock out", "error"); }
  };

  const handleBreakStart = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/shift/break-start/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to start break", "error"); return; }
      setIsOnBreak(true);
      setCurrentShift(data);
      showToast("Break started", "success");
    } catch { showToast("Failed to start break", "error"); }
  };

  const handleBreakEnd = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/shift/break-end/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to end break", "error"); return; }
      setIsOnBreak(false);
      setCurrentShift(data);
      showToast("Break ended — back on shift", "success");
    } catch { showToast("Failed to end break", "error"); }
  };

  // Fetch tables
  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff || !user?.email) return;

    const fetchTables = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/tables/?admin_email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setTables(data.tables || []);
        }
      } catch { /* ignore */ }
    };

    fetchTables();
    const interval = setInterval(fetchTables, 8000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isStaff, user?.email]);

  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => {
      const targets = document.querySelectorAll(".paginated-order");
      if (targets.length > 0) {
        gsap.fromTo(targets,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: "power2.out", overwrite: true }
        );
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [currentPage, filter, activeTab, mounted]);

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

  useGSAP(() => {
    if (!mounted || isAuthLoading || !isLoggedIn || !isStaff) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    gsap.set(".staff-nav-item", { opacity: 1, y: 0, clearProps: "transform" });

    if (prefersReduced) {
      gsap.set([".staff-header", ".staff-stagger-item"], { opacity: 1, y: 0, clearProps: "transform" });
      return;
    }

    gsap.fromTo(
      ".staff-header",
      { y: -50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
    );

    gsap.fromTo(
      ".staff-nav-item",
      { y: -20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.1,
        ease: "back.out(1.5)",
        delay: 0.3,
        onComplete: () => {
          gsap.set(".staff-nav-item", { opacity: 1, y: 0, clearProps: "transform" });
        },
      }
    );

    gsap.fromTo(
      ".staff-stagger-item",
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "back.out(1.2)", delay: 0.2 }
    );
  }, { scope: containerRef, dependencies: [mounted, isAuthLoading, isLoggedIn, isStaff] });

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === orderId);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].status = newStatus;
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order["status"] } : o));
          return;
        }
      }

      const numericId = orderId.replace('ORD-', '').replace(/^0+/, '');
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/status/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: newStatus, admin_email: user?.email }),
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order["status"] } : o));
      }
    } catch (err) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order["status"] } : o));
    }
  };

  const markOrderPaid = async (orderId: string) => {
    const shortId = orderId.replace("ORD-", "");
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === orderId);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].paymentStatus = "paid";
          if (!localOrders[localOrderIndex].paymentMethod) {
            localOrders[localOrderIndex].paymentMethod = "cash";
          }
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? { ...o, paymentStatus: "paid", paymentMethod: o.paymentMethod || "cash" }
                : o
            )
          );
          showToast(`Order #${shortId} marked as paid`, "success");
          return;
        }
      }

      const numericId = orderId.replace("ORD-", "").replace(/^0+/, "");
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/payment/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user?.email, payment_status: "paid" }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  paymentStatus: (data.payment_status as Order["paymentStatus"]) || "paid",
                  paymentMethod: data.payment_method || o.paymentMethod || "cash",
                }
              : o
          )
        );
        showToast(`Order #${shortId} marked as paid`, "success");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to mark order as paid", "error");
      }
    } catch {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, paymentStatus: "paid", paymentMethod: o.paymentMethod || "cash" }
            : o
        )
      );
      showToast(`Order #${shortId} marked as paid`, "success");
    }
  };

  const voidOrder = async () => {
    if (!voidModalOrderId || !voidReason.trim()) return;

    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === voidModalOrderId);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].status = "cancelled";
          localOrders[localOrderIndex].voidReason = voidReason.trim();
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders(prev => prev.map(o => o.id === voidModalOrderId ? { ...o, status: "cancelled" as Order["status"], voidReason: voidReason.trim() } : o));
          setVoidModalOrderId(null);
          setVoidReason("");
          return;
        }
      }

      const numericId = voidModalOrderId.replace('ORD-', '').replace(/^0+/, '');
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/void/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ void_reason: voidReason, admin_email: user?.email }),
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === voidModalOrderId ? { ...o, status: "cancelled" as Order["status"], voidReason: voidReason } : o));
      }
    } catch {
      setOrders(prev => prev.map(o => o.id === voidModalOrderId ? { ...o, status: "cancelled" as Order["status"], voidReason: voidReason } : o));
    }
    setVoidModalOrderId(null);
    setVoidReason("");
  };

  const filteredOrders = filter === "all" ? orders : orders.filter(o => o.status === filter);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const displayedOrders = filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.date).toDateString() === today && o.status !== "cancelled");
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter(o => o.status === "pending").length;
  const readyCount = orders.filter(o => o.status === "ready").length;

  const formatShiftClock = (isoOrTime: string | null) => {
    if (!isoOrTime) return "";
    // "07:30:00" from API
    if (/^\d{2}:\d{2}/.test(isoOrTime)) {
      const [hh, mm] = isoOrTime.split(":");
      const h = Number(hh);
      const suffix = h >= 12 ? "PM" : "AM";
      const h12 = ((h + 11) % 12) + 1;
      return `${h12}:${mm} ${suffix}`;
    }
    return isoOrTime;
  };

  const shiftStatusLabel = (() => {
    if (isPending) return "Pending Approval";
    if (isLate) return "Late";
    if (isOnBreak) return "On Break";
    if (isClockedIn) return "On Shift";
    if (!shiftStatusLoaded) return "Checking shift…";
    if (!accessToken && !getAccessToken()) return "Sign in required";
    if (!canClockIn && shiftStart && shiftEnd) {
      return `Outside hours (${formatShiftClock(shiftStart)} – ${formatShiftClock(shiftEnd)})`;
    }
    if (!canClockIn) return "Clock-in unavailable";
    return "Off Shift";
  })();

  const occupiedTables = tables.filter(t => t.table_status === "occupied").length;

  // Show spinner only while auth is loading AND we don't have a confirmed staff user from localStorage
  const isConfirmedStaff = isStaff || isStoredStaff;
  if (!mounted || (isAuthLoading && !isConfirmedStaff) || (!isLoggedIn && !isStoredStaff)) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen app-canvas relative overflow-hidden">
      {/* Header */}
      <div className="staff-header sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight hidden sm:block staff-nav-item">{t("Staff Panel")}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 justify-end relative">
            <div className="staff-nav-item"><NotificationBell userEmail={user?.email} /></div>
            <button
              onClick={toggleLanguage}
              className="staff-nav-item bg-light-brown/20 hover:bg-light-brown/40 text-dark-brown font-bold text-xs md:text-sm rounded-full py-1.5 px-3 md:py-2 md:px-4 transition-all uppercase"
            >
              {language}
            </button>
            <button
              onClick={() => { void performLogout(signOut); }}
              className="staff-nav-item md:hidden group flex items-center gap-1.5 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-[11px] uppercase rounded-full py-1.5 px-3 transition-all duration-300 shadow-sm"
            >
              <span>{t("Logout")}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
            <h1 className="staff-nav-item text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight hidden sm:block md:hidden mr-2">{t("Staff Panel")}</h1>

            {/* Hamburger Button for Mobile */}
            <button
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              className="staff-nav-item md:hidden p-2 text-dark-brown hover:bg-dark-brown/10 rounded-full transition-colors"
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

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/profile"
                className="staff-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>{t("Profile") || "Profile"}</span>
              </Link>
              <Link href="/admin-sales" className="staff-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                <span>{t("Sales")}</span>
              </Link>
              <button onClick={() => { void performLogout(signOut); }} className="staff-nav-item group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <span>{t("Logout")}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {showMobileMenu && (
          <div
            ref={mobileMenuRef}
            className="mobile-nav-menu md:hidden absolute top-[100%] right-0 w-full app-header-bar backdrop-blur-md border-b border-dark-brown/10 shadow-lg flex flex-col items-center py-4 gap-3 z-50 will-change-transform"
          >
            <Link
              href="/profile"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              {t("Profile") || "Profile"}
            </Link>
            <Link
              href="/admin-sales"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
              {t("Sales")}
            </Link>
            <button
              onClick={() => { void performLogout(signOut); }}
              className="mobile-nav-item flex items-center justify-between gap-3 w-[90%] bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <span>{t("Logout")}</span>
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
        {/* Welcome + Stats */}
        <div className="staff-stagger-item mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-dark-brown uppercase tracking-tighter">{t("Staff Dashboard")}</h2>
            <p className="font-paragraph text-dark-brown/60 mt-1">{t("Manage orders and tables for today's shift.")}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAbsenceModal(true)}
            className="inline-flex items-center gap-2 self-start sm:self-auto bg-white/70 hover:bg-white border border-indigo-200/60 text-indigo-800 font-bold text-xs uppercase rounded-full py-2.5 px-4 shadow-sm hover:shadow-md transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Absence Request
            {myAbsenceRequests.filter((r) => r.status === "approved").length > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {myAbsenceRequests.filter((r) => r.status === "approved").length}
              </span>
            )}
          </button>
        </div>

        {!accessToken && !getAccessToken() && (
          <div className="mb-6 rounded-2xl border border-red-brown/30 bg-red-brown/10 px-4 py-3 text-sm text-red-brown font-paragraph">
            Session expired for kitchen actions.{" "}
            <Link href="/login?redirect=/staff" className="font-bold underline underline-offset-2">
              Sign in again
            </Link>{" "}
            to clock in and manage orders.
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="staff-stagger-item app-panel border rounded-3xl p-5 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase mb-1">{t("Today's Orders")}</p>
            <p className="text-2xl md:text-3xl font-bold text-dark-brown">{todayOrders.length}</p>
          </div>
          <div className="staff-stagger-item app-panel border rounded-3xl p-5 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase mb-1">{t("Today's Revenue")}</p>
            <p className="text-2xl md:text-3xl font-bold text-dark-brown">₱{todayRevenue.toLocaleString()}</p>
          </div>
          <div className="staff-stagger-item app-panel border rounded-3xl p-5 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase mb-1">{t("Pending")}</p>
            <p className="text-2xl md:text-3xl font-bold text-yellow-700">{pendingCount}</p>
          </div>
          <div className="staff-stagger-item app-panel border rounded-3xl p-5 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase mb-1">{t("Occupied Tables")}</p>
            <p className="text-2xl md:text-3xl font-bold text-dark-brown">{occupiedTables}<span className="text-sm text-dark-brown/40">/10</span></p>
          </div>
        </div>

        {/* Clock In / Clock Out Card */}
        <div className="staff-stagger-item mb-8">
          <div className={`rounded-3xl p-6 shadow-lg border transition-all ${
            isPending
              ? "bg-blue-50/80 backdrop-blur-sm border-blue-200/60"
              : isLate
              ? "bg-orange-50/80 backdrop-blur-sm border-orange-200/60"
              : isOnBreak
              ? "bg-amber-50/80 backdrop-blur-sm border-amber-200/60"
              : isClockedIn
              ? "bg-emerald-50/80 backdrop-blur-sm border-emerald-200/60"
              : !canClockIn
              ? "bg-red-50/50 backdrop-blur-sm border-red-200/40"
              : "app-panel border"
          }`}>
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              {/* Left: Status + Button */}
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  isPending ? "bg-blue-100" : isLate ? "bg-orange-100" : isOnBreak ? "bg-amber-100" : isClockedIn ? "bg-emerald-100" : "bg-dark-brown/5"
                }`}>
                  {isPending ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(37,99,235)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/></svg>
                  ) : isLate ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(194,65,12)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ) : isOnBreak ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(217,119,6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                  ) : isClockedIn ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(5,150,105)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(120,113,108)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold uppercase ${isPending ? "text-blue-600" : isLate ? "text-orange-700" : isOnBreak ? "text-amber-600" : isClockedIn ? "text-emerald-700" : !canClockIn ? "text-dark-brown/50" : "text-dark-brown/50"}`}>
                      {shiftStatusLabel}
                    </p>
                    {isPending && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold uppercase animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                        Waiting
                      </span>
                    )}
                    {isLate && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        Late
                      </span>
                    )}
                    {isClockedIn && !isOnBreak && !isPending && !isLate && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        Live
                      </span>
                    )}
                    {isOnBreak && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        Break
                      </span>
                    )}
                  </div>
                  {isClockedIn && currentShift ? (
                    <div className="flex items-center gap-3 mt-1">
                      <p className={`text-2xl font-mono font-bold tracking-wider ${isPending ? "text-blue-600" : isLate ? "text-orange-600" : isOnBreak ? "text-amber-600" : "text-emerald-700"}`}>{shiftElapsed}</p>
                      <p className={`text-xs font-paragraph ${isPending ? "text-blue-500/70" : isLate ? "text-orange-500/70" : isOnBreak ? "text-amber-500/70" : "text-emerald-600/70"}`}>
                        Started {new Date(currentShift.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {currentShift?.minutes_late != null && currentShift.minutes_late > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[10px] font-bold">
                          +{currentShift.minutes_late}m late
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1">
                      {!shiftStatusLoaded ? (
                        <p className="text-xs text-dark-brown/40 font-paragraph">Loading shift status…</p>
                      ) : !accessToken && !getAccessToken() ? (
                        <p className="text-xs text-red-brown/80 font-paragraph">Sign in again to load your shift status.</p>
                      ) : !canClockIn && shiftStart && shiftEnd ? (
                        <div className="flex flex-col gap-0.5 mt-1.5">
                          <p className="text-xs text-red-600/80 font-bold uppercase tracking-wide">Outside Shift Hours</p>
                          <p className="text-[11px] text-dark-brown/60 font-paragraph bg-red-100/50 inline-block px-2 py-0.5 rounded-md border border-red-200/50 w-fit">
                            Shift window: <span className="font-bold text-red-700/80">{formatShiftClock(shiftStart)} – {formatShiftClock(shiftEnd)}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-dark-brown/40 font-paragraph">Clock in to start your shift</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isClockedIn && !isOnBreak && !isPending && (
                    <button
                      onClick={handleBreakStart}
                      className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold uppercase transition-all shadow-md hover:shadow-lg active:scale-95 bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                      Break
                    </button>
                  )}
                  {isOnBreak && (
                    <button
                      onClick={handleBreakEnd}
                      className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold uppercase transition-all shadow-md hover:shadow-lg active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      End Break
                    </button>
                  )}
                  <button
                    onClick={isClockedIn ? handleClockOut : handleClockIn}
                    disabled={!isClockedIn && !canClockIn}
                    className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold uppercase transition-all shadow-md active:scale-95 ${
                      isClockedIn
                      ? "bg-red-500 hover:bg-red-600 text-white hover:shadow-lg"
                      : !canClockIn
                      ? "bg-dark-brown/10 text-dark-brown/40 cursor-not-allowed shadow-none"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-lg"
                  }`}
                >
                  {isClockedIn ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="6" height="6" x="4" y="4" /><rect width="6" height="6" x="14" y="4" /><rect width="6" height="6" x="4" y="14" /><rect width="6" height="6" x="14" y="14" /></svg>
                      Clock Out
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      Clock In
                    </>
                  )}
                </button>
                </div>
              </div>
              {/* Right: Recent Shifts */}
              {recentShifts.length > 0 && (
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase text-dark-brown/40 mb-2">Recent Shifts</p>
                  <div className="space-y-1.5">
                    {recentShifts.slice(0, 3).map((shift: any) => (
                      <div key={shift.id} className="flex items-center gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${shift.clock_out ? "bg-dark-brown/20" : "bg-emerald-500"}`}></span>
                        <span className="text-dark-brown/60 font-paragraph">
                          {new Date(shift.clock_in).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                        <span className="text-dark-brown/40 font-paragraph">
                          {new Date(shift.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {shift.clock_out ? ` → ${new Date(shift.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " → ..."}
                        </span>
                        {shift.duration && (
                          <span className="ml-auto text-dark-brown/50 font-bold font-mono text-[10px]">{shift.duration}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="staff-stagger-item flex flex-wrap gap-2 mb-6">
          {(["orders", "tables", "contacts"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold uppercase transition-all ${activeTab === tab ? "bg-dark-brown text-milk shadow-md" : "bg-white/60 text-dark-brown/70 hover:bg-white border border-white/60"}`}>
              {tab === "orders" && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
              {tab === "tables" && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>}
              {tab === "contacts" && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>}
              {tab === "orders" ? t("Orders") : tab === "tables" ? t("Tables") : "Contacts"}
            </button>
          ))}
        </div>

        {activeTab === "orders" && (
          <>
            {/* Filters */}
            <div className="staff-stagger-item flex flex-wrap gap-2 mb-4">
              {(["all", "pending", "preparing", "ready", "completed"] as const).map(s => (
                <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition-all ${filter === s ? "bg-dark-brown text-milk" : "bg-white/50 text-dark-brown/60 hover:bg-white border border-white/40"}`}>
                  {STATUS_LABELS[s]} ({s === "all" ? orders.length : orders.filter(o => o.status === s).length})
                </button>
              ))}
            </div>

            {/* Orders List */}
            <div className="staff-stagger-item space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="font-paragraph text-dark-brown/50">No orders yet</p>
                </div>
              ) : (
                displayedOrders.map(order => (
                  <div key={order.id} className="paginated-order app-panel border rounded-3xl p-5 shadow-lg hover:shadow-xl transition-all">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${STATUS_DOTS[order.status]}`}></span>
                        <p className="font-bold text-dark-brown uppercase text-sm">{order.id}</p>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STATUS_COLORS[order.status]}`}>{order.status}</span>
                        {order.orderType && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${order.orderType === "Dine-In" ? "bg-light-brown/20 text-dark-brown"
                              : order.orderType === "Scheduled" ? "bg-blue-100 text-blue-800"
                                : "bg-dark-brown/10 text-dark-brown/70"
                            }`}>
                            {order.orderType === "Scheduled" && order.pickupTime
                              ? `Pre-Order @ ${(() => { try { const d = new Date(order.pickupTime); return isNaN(d.getTime()) ? order.pickupTime : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return order.pickupTime; } })()}`
                              : order.orderType === "Dine-In" && order.tableNumber
                                ? `Dine-In (T-${order.tableNumber})`
                                : order.orderType}
                          </span>
                        )}
                        {order.paymentMethod && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            order.paymentStatus === "paid"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}>
                            {order.paymentMethod}
                            {order.paymentStatus === "paid" ? " · paid" : " · unpaid"}
                          </span>
                        )}

                      </div>
                      <p className="font-paragraph text-dark-brown/40 text-xs">{new Date(order.date).toLocaleString()}</p>
                    </div>

                    <div className="mb-3">
                      <p className="font-paragraph text-dark-brown/70 text-sm mb-1"><span className="font-bold">Customer:</span> {order.userName}</p>
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="font-paragraph text-dark-brown">{item.qty}x {item.name}</span>
                            <span className="font-bold text-dark-brown">₱{(item.price * item.qty).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="font-bold text-dark-brown text-right mt-2">Total: ₱{order.total.toFixed(2)}</p>
                    </div>

                    {order.voidReason && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
                        <p className="text-red-700 text-xs font-bold uppercase">Void Reason:</p>
                        <p className="text-red-600 text-sm font-paragraph">{order.voidReason}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {order.status !== "cancelled" && order.paymentStatus !== "paid" && (
                        <button
                          onClick={() => markOrderPaid(order.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase rounded-full py-2 px-5 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
                        >
                          Mark Paid
                        </button>
                      )}
                      {order.status !== "completed" && order.status !== "cancelled" && STATUS_FLOW[order.status] && (
                        <button onClick={() => updateStatus(order.id, STATUS_FLOW[order.status])} className="bg-dark-brown hover:bg-dark-brown-hover text-milk font-bold text-xs uppercase rounded-full py-2 px-5 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
                          Mark {STATUS_LABELS[STATUS_FLOW[order.status]]}
                        </button>
                      )}
                      {(order.status === "pending" || order.status === "preparing") && (
                        <button onClick={() => setVoidModalOrderId(order.id)} className="bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-xs uppercase rounded-full py-2 px-5 transition-all">
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pb-4 px-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="bg-dark-brown/10 disabled:opacity-50 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs uppercase rounded-full py-2.5 px-6 transition-all duration-300 shadow-sm hover:shadow-md"
                  >
                    Prev
                  </button>
                  <span className="text-dark-brown font-bold text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="bg-dark-brown/10 disabled:opacity-50 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs uppercase rounded-full py-2.5 px-6 transition-all duration-300 shadow-sm hover:shadow-md"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "tables" && (
          <div className="staff-stagger-item grid grid-cols-2 md:grid-cols-5 gap-3">
            {tables.map(table => {
              const cfg = {
                free: { color: "#22c55e", bg: "bg-green-50", label: "Free", glow: "0 0 15px #22c55e40" },
                ordering: { color: "#eab308", bg: "bg-yellow-50", label: "Ordering", glow: "0 0 15px #eab30840" },
                occupied: { color: "#ef4444", bg: "bg-red-50", label: "Occupied", glow: "0 0 15px #ef444440" },
              }[table.table_status];
              return (
                <div key={table.table_number} className={`${cfg.bg} border border-white/60 rounded-3xl p-4 shadow-lg transition-all hover:shadow-xl hover:-translate-y-1`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-dark-brown text-lg">T{table.table_number}</span>
                    <span className="w-3 h-3 rounded-full" style={{ background: cfg.color, boxShadow: cfg.glow }}></span>
                  </div>
                  <p className="text-xs font-bold uppercase text-dark-brown/60">{cfg.label}</p>
                  {table.customer_name && (
                    <p className="text-xs font-paragraph text-dark-brown/80 mt-1">{table.customer_name}</p>
                  )}
                  {table.total_price && (
                    <p className="text-xs font-bold text-dark-brown mt-1">₱{table.total_price}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "contacts" && (
          <div className="staff-stagger-item">
            <div className="mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Staff Contact Directory</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-1">All staff phone numbers and emails — tap to call or copy</p>
            </div>

            {staffUsers.length === 0 ? (
              <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
                <p className="text-4xl mb-3">📞</p>
                <p className="font-paragraph text-dark-brown/50">No staff contacts to display</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {staffUsers.map((s: any) => (
                  <div
                    key={s.id}
                    className="app-panel border rounded-2xl p-5 shadow-md hover:shadow-lg transition-all group"
                  >
                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3 mb-4">
                      {s.avatar ? (
                        <Image src={s.avatar} alt={s.name || s.email} width={44} height={44} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold uppercase ${
                          s.role === "admin" ? "bg-dark-brown text-milk" : "bg-light-brown/20 text-dark-brown"
                        }`}>
                          {(s.name || s.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-dark-brown text-sm uppercase truncate">{s.name || s.email.split("@")[0]}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {s.employee_id && (
                            <span className="px-1.5 py-0.5 rounded bg-dark-brown/8 text-dark-brown/40 text-[9px] font-mono font-bold tracking-wider flex-shrink-0">{s.employee_id}</span>
                          )}
                          <span className={`flex items-center gap-0.5 text-[9px] font-bold uppercase ${s.is_active ? "text-green-600" : "text-red-400"}`}>
                            <span className={`w-1 h-1 rounded-full ${s.is_active ? "bg-green-500" : "bg-red-400"}`}></span>
                            {s.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contact Actions */}
                    <div className="space-y-2">
                      {/* Email */}
                      <div className="flex items-center gap-2 bg-dark-brown/[0.03] rounded-xl px-3 py-2.5 group/email">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(37,99,235)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        </div>
                        <span className="flex-1 text-dark-brown/70 text-xs font-paragraph truncate">{s.email}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(s.email); showToast("Email copied!", "success"); }}
                          className="opacity-0 group-hover/email:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all flex-shrink-0"
                          title="Copy email"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                      </div>

                      {/* Phone */}
                      {s.phone ? (
                        <div className="flex items-center gap-2 bg-dark-brown/[0.03] rounded-xl px-3 py-2.5 group/phone">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(5,150,105)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </div>
                          <span className="flex-1 text-dark-brown/70 text-xs font-paragraph truncate">{s.phone}</span>
                          <a
                            href={`tel:${s.phone}`}
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all flex-shrink-0"
                            title="Call"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(s.phone); showToast("Phone number copied!", "success"); }}
                            className="opacity-0 group-hover/phone:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all flex-shrink-0"
                            title="Copy phone"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-dark-brown/[0.02] rounded-xl px-3 py-2.5">
                          <div className="w-8 h-8 rounded-lg bg-dark-brown/5 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(120,113,108)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </div>
                          <span className="text-dark-brown/30 text-xs font-paragraph italic">No phone number</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Void Modal */}
      {voidModalOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="app-panel border rounded-3xl shadow-2xl p-6 md:p-8 w-[90%] max-w-md">
            <h3 className="text-xl font-bold text-red-800 uppercase tracking-tight mb-2">Void Order</h3>
            <p className="font-paragraph text-red-700 text-sm mb-4">Provide a reason for voiding this order. This action will restore inventory.</p>
            <textarea
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder="Reason for voiding..."
              className="w-full bg-red-50 border border-red-200 text-red-900 font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-red-400 mb-4 resize-none h-24"
            />
            <div className="flex gap-3">
              <button onClick={() => { setVoidModalOrderId(null); setVoidReason(""); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold uppercase py-3 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={voidOrder} disabled={!voidReason.trim()} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold uppercase py-3 rounded-xl transition-colors">
                Void Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Absence Request Modal */}
      {showAbsenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-milk w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-7 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(79,70,229)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-dark-brown uppercase tracking-tight">Absence Request</h3>
                  <p className="text-xs text-dark-brown/50 font-paragraph mt-0.5">
                    Log a planned absence in advance — shown separately from unexpected absences
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAbsenceModal(false)}
                className="text-dark-brown/40 hover:text-dark-brown p-1"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1">Date</label>
                <input
                  type="date"
                  value={absenceFormDate}
                  onChange={(e) => setAbsenceFormDate(e.target.value)}
                  className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1">Reason</label>
                <textarea
                  value={absenceFormReason}
                  onChange={(e) => setAbsenceFormReason(e.target.value)}
                  rows={3}
                  placeholder="Reason for planned absence..."
                  className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown font-paragraph resize-none"
                />
              </div>
              <button
                type="button"
                onClick={submitAbsenceRequest}
                disabled={absenceFormLoading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase disabled:opacity-50"
              >
                {absenceFormLoading ? "Submitting…" : "Submit Absence Request"}
              </button>
            </div>

            <div className="border-t border-dark-brown/10 pt-4">
              <p className="text-[10px] font-bold uppercase text-dark-brown/50 mb-2">My Planned Absences</p>
              {myAbsenceRequests.filter((r) => r.status === "approved").length === 0 ? (
                <p className="text-xs text-dark-brown/45 font-paragraph">No planned absences logged</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {myAbsenceRequests.filter((r) => r.status === "approved").slice(0, 10).map((r) => (
                    <div key={r.id} className="rounded-xl bg-indigo-50/70 border border-indigo-200/50 px-3 py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-indigo-900">
                          {new Date(`${r.absence_date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <p className="text-[10px] text-indigo-800/70 font-paragraph truncate">{r.reason}</p>
                      </div>
                      {r.absence_date >= new Date().toISOString().slice(0, 10) && (
                        <button type="button" onClick={() => cancelMyAbsenceRequest(r.id)} className="text-[9px] font-bold uppercase text-red-600 flex-shrink-0">
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast — above theme toggle; full-width on mobile so message isn't clipped */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[110] flex items-center gap-2 px-5 py-3 rounded-2xl shadow-lg font-bold text-xs uppercase tracking-wider transition-all ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            {toast.type === "success" ? <polyline points="20 6 9 17 4 12" /> : <><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></>}
          </svg>
          <span className="break-words normal-case tracking-normal sm:uppercase sm:tracking-wider">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
