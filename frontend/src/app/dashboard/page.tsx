"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { signOut } from "next-auth/react";
import html2canvas from "html2canvas";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import PageIntro from "@/components/PageIntro";
import { performLogout } from "@/lib/logoutTransition";
import { unwrapListResponse } from "@/lib/apiList";
import BrandLogo from "@/components/BrandLogo";
import { useThemeColors, withAlpha } from "@/lib/themeColors";
import QueuePositionCard from "@/components/QueuePositionCard";
import ProductLightbox from "@/components/ProductLightbox";
import { fetchOrderEta, type SmartEta } from "@/lib/smartEta";
import { getMenuItemImage } from "@/constants";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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
  rating?: number;
  paymentMethod?: string;
  paymentStatus?: "unpaid" | "paid" | "";
}

export default function DashboardPage() {
  const { isLoggedIn, isAuthLoading, user, apiFetch } = useAuth();
  const router = useRouter();
  const { language, toggleLanguage, t } = useLanguage();
  const tc = useThemeColors();
  const chartTick = withAlpha(tc.darkBrown, "aa");
  const chartGrid = withAlpha(tc.darkBrown, "15");
  const [orders, setOrders] = useState<Order[]>([]);
  const [lifetimeTotalOrders, setLifetimeTotalOrders] = useState(0);
  const [lifetimeTotalSpent, setLifetimeTotalSpent] = useState(0);
  const [lifetimeCompleted, setLifetimeCompleted] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuTlRef = useRef<gsap.core.Timeline | null>(null);
  const [showTopDrinksModal, setShowTopDrinksModal] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: "success" | "info" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [rateOrderId, setRateOrderId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [deletingOrderIds, setDeletingOrderIds] = useState<string[]>([]);
  const [spendingData, setSpendingData] = useState<{ month: string; total: number; orders: number }[]>([]);
  const [spendingSummary, setSpendingSummary] = useState<{ total_spent: number; avg_monthly: number; top_month: { month: string; total: number; orders: number } | null; months_tracked: number } | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [orderEtas, setOrderEtas] = useState<Record<string, SmartEta>>({});
  const [showSpending, setShowSpending] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      return;
    }
    setShowMobileMenu(true);
    setIsMobileMenuOpen(true);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

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
  }, [currentPage, mounted]);

  // Dashboard also listens to app-wide order events (WS + poll fallback).
  useEffect(() => {
    const onGlobal = (event: Event) => {
      const data = (event as CustomEvent).detail as {
        type?: string;
        order_id?: number;
        status?: string;
        payment_method?: string;
        payment_status?: string;
        rating?: number | null;
      };
      if (!data?.order_id) return;
      const orderIdFormatted = `ORD-${data.order_id.toString().padStart(4, "0")}`;

      if (data.type === "order_payment_update") {
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === orderIdFormatted);
          if (exists && data.payment_status === "paid") {
            setToastMessage({
              title: "Payment Confirmed",
              desc: `Order ${orderIdFormatted} is marked as paid`,
              type: "success",
            });
          }
          return prev.map((o) =>
            o.id === orderIdFormatted
              ? {
                ...o,
                paymentMethod: data.payment_method || o.paymentMethod,
                paymentStatus: (data.payment_status as Order["paymentStatus"]) || o.paymentStatus,
              }
              : o
          );
        });
        return;
      }

      if (data.type === "order_status_update" && data.status) {
        if (data.status === "completed" && !data.rating) {
          setRateOrderId(orderIdFormatted);
        }
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === orderIdFormatted);
          if (exists) {
            setToastMessage({
              title: "Order Updated",
              desc: `Your order ${orderIdFormatted} is now ${String(data.status).toUpperCase()}`,
              type: "success",
            });
          }
          return prev.map((o) =>
            o.id === orderIdFormatted
              ? { ...o, status: data.status as Order["status"], rating: data.rating || o.rating }
              : o
          );
        });
      }
    };

    window.addEventListener("gb:order-status", onGlobal as EventListener);
    return () => window.removeEventListener("gb:order-status", onGlobal as EventListener);
  }, []);

  useEffect(() => {
    if (!mounted || spendingData.length === 0) {
      setChartReady(false);
      return;
    }

    const timer = window.setTimeout(() => setChartReady(true), 150);
    return () => window.clearTimeout(timer);
  }, [mounted, spendingData.length]);

  const statusStyles: Record<Order["status"], { bg: string; text: string }> = {
    completed: { bg: "#dcfce7", text: "#15803d" },
    ready: { bg: "#dbeafe", text: "#1d4ed8" },
    preparing: { bg: "#fef9c3", text: "#a16207" },
    cancelled: { bg: "#fee2e2", text: "#b91c1c" },
    pending: { bg: "#f3f4f6", text: "#374151" },
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthLoading && !isLoggedIn) {
      router.push("/");
    }
  }, [mounted, isAuthLoading, isLoggedIn, router]);

  useEffect(() => {
    if (!user) return;

    // Fetch orders from Django backend
    const fetchOrders = async () => {
      try {
        const localOrdersRaw = localStorage.getItem("spylt_local_orders");
        const localOrders: Order[] = localOrdersRaw ? JSON.parse(localOrdersRaw).filter((o: any) => o.userEmail === user.email) : [];

        let mappedOrders: Order[] = [];
        try {
          const emailParam = user.email ? `&email=${encodeURIComponent(user.email)}` : "";
          const res = await apiFetch(`${API_BASE_URL}/api/auth/orders/?limit=200${emailParam}`);
          if (res.ok) {
            const data = unwrapListResponse<any>(await res.json());
            // Map Django order structure to our frontend structure
            mappedOrders = data.map((d: any) => ({
              id: `ORD-${d.id.toString().padStart(4, '0')}`,
              items: d.items.map((i: any) => ({
                name: i.name,
                price: Number(i.price),
                qty: i.quantity,
              })),
              total: Number(d.total_price),
              totalItems: d.items.reduce((sum: number, i: any) => sum + i.quantity, 0),
              date: d.created_at,
              userEmail: user.email,
              userName: user.name,
              status: d.status,
              rating: d.rating,
              paymentMethod: d.payment_method || "",
              paymentStatus: d.payment_status || "unpaid",
            }));
          }
        } catch (backendErr) {
          // ignore backend failure, we will use localOrders
        }

        // Filter out previously deleted orders
        const deletedKey = `spylt_deleted_orders_${user.email}`;
        const deletedIdsRaw = localStorage.getItem(deletedKey);
        const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];

        // Load claimed/completed orders to ensure status persistence on refresh
        const claimedKey = `spylt_claimed_orders_${user.email}`;
        const claimedIdsRaw = localStorage.getItem(claimedKey);
        const claimedIds: string[] = claimedIdsRaw ? JSON.parse(claimedIdsRaw) : [];

        // Deduplicate orders by id (backend mapped + local orders)
        const orderMap = new Map<string, Order>();
        localOrders.forEach((o) => {
          if (claimedIds.includes(o.id)) o.status = "completed";
          orderMap.set(o.id, o);
        });
        mappedOrders.forEach((o) => {
          if (claimedIds.includes(o.id)) o.status = "completed";
          orderMap.set(o.id, o);
        });

        // Combine deduplicated orders, filtering deleted, sorting by date descending
        const allOrders = Array.from(orderMap.values())
          .filter(o => !deletedIds.includes(o.id))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setOrders(allOrders);

        // Update lifetime stats (only increases, never decreases on delete)
        const statsKey = `spylt_lifetime_stats_${user.email}`;
        const storedStats = localStorage.getItem(statsKey);
        let prevCount = 0;
        let prevSpent = 0;
        if (storedStats) {
          try {
            const parsed = JSON.parse(storedStats);
            prevCount = parsed.totalOrders || 0;
            prevSpent = parsed.totalSpent || 0;
          } catch { }
        }
        const newCount = Math.max(prevCount, allOrders.length);
        const newSpent = Math.max(prevSpent, allOrders.reduce((s, o) => s + o.total, 0));
        const completedCount = allOrders.filter((o: Order) => o.status === "completed").length;
        const prevCompleted = storedStats ? (JSON.parse(storedStats).completed || 0) : 0;
        const newCompleted = Math.max(prevCompleted, completedCount);
        setLifetimeTotalOrders(newCount);
        setLifetimeTotalSpent(newSpent);
        setLifetimeCompleted(newCompleted);
        localStorage.setItem(statsKey, JSON.stringify({ totalOrders: newCount, totalSpent: newSpent, completed: newCompleted }));
      } catch (err) {
        setOrders([]);
      }
    };

    fetchOrders();
  }, [user, apiFetch]);

  // Live queue position for active customer orders (incl. ready-for-pickup)
  useEffect(() => {
    const active = orders.filter(
      (o) => o.status === "pending" || o.status === "preparing" || o.status === "ready"
    );
    if (active.length === 0) {
      setOrderEtas({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        active.map(async (order) => {
          const eta = await fetchOrderEta(order.id);
          return [order.id, eta] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, SmartEta> = {};
      for (const [id, eta] of entries) {
        if (eta) next[id] = eta;
      }
      setOrderEtas(next);
    };

    void load();
    const interval = setInterval(() => void load(), 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orders]);

  useEffect(() => {
    if (!user?.email) return;
    const fetchSpending = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/auth/spending/?email=${encodeURIComponent(user.email)}`);
        if (res.ok) {
          const data = await res.json();
          setSpendingData(data.spending || []);
          setSpendingSummary(data.summary || null);
        }
      } catch { }
    };
    fetchSpending();
  }, [user?.email]);

  useGSAP(() => {
    if (!introDone || !mounted || isAuthLoading || !isLoggedIn) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Ensure header controls stay visible even if a tween is interrupted on refresh.
    gsap.set(".dashboard-nav-item", { opacity: 1, y: 0, clearProps: "transform" });

    if (prefersReduced) {
      gsap.set([".dashboard-header", ".dashboard-stagger-item"], { opacity: 1, y: 0, clearProps: "transform" });
      return;
    }

    gsap.fromTo(
      ".dashboard-header",
      { y: -50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
    );

    gsap.fromTo(
      ".dashboard-nav-item",
      { y: -20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.1,
        ease: "back.out(1.5)",
        delay: 0.3,
        onComplete: () => {
          gsap.set(".dashboard-nav-item", { opacity: 1, y: 0, clearProps: "transform" });
        },
      }
    );

    gsap.fromTo(
      ".dashboard-stagger-item",
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "back.out(1.2)", delay: 0.2 }
    );
  }, { scope: containerRef, dependencies: [introDone, mounted, isAuthLoading, isLoggedIn] });

  const topDrinks = React.useMemo(() => {
    if (orders.length === 0) return [];
    const itemCounts = new Map<string, number>();
    orders.forEach((o) => {
      if (o.status !== "cancelled") {
        o.items.forEach((i) => {
          const cleanName = i.name.split("(")[0].trim() || i.name;
          itemCounts.set(cleanName, (itemCounts.get(cleanName) || 0) + (i.qty || 1));
        });
      }
    });
    const sorted = Array.from(itemCounts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.map(([name, count]) => ({ name, count }));
  }, [orders]);

  const mostOrderedDrink = topDrinks.length > 0 ? topDrinks[0].name : null;

  // The item to display in the dashboard hero image card:
  // If the user has orders, show their #1 most ordered item (or most recent item), along with its count
  const featuredItem = React.useMemo(() => {
    if (orders.length === 0) {
      return {
        name: "Ube Cheese Pandesal",
        count: 0,
        image: "/images/generation-bread-ube-cheese-pandesal.png",
        isDefault: true,
      };
    }
    const top = topDrinks[0];
    if (top && top.count > 0) {
      return {
        name: top.name,
        count: top.count,
        image: getMenuItemImage(top.name),
        isDefault: false,
      };
    }
    const recentOrder = orders[0];
    const recentItem = recentOrder?.items[0];
    const recentName = recentItem ? (recentItem.name.split("(")[0].trim() || recentItem.name) : "Ube Cheese Pandesal";
    return {
      name: recentName,
      count: recentItem?.qty || 1,
      image: getMenuItemImage(recentName),
      isDefault: false,
    };
  }, [orders, topDrinks]);

  const activeOrders = React.useMemo(
    () =>
      orders.filter(
        (o) => o.status === "pending" || o.status === "preparing" || o.status === "ready"
      ),
    [orders]
  );

  const timeGreeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("Good morning") || "Good morning";
    if (hour < 18) return t("Good afternoon") || "Good afternoon";
    return t("Good evening") || "Good evening";
  }, [t]);

  const kitchenLabel = (status: Order["status"]) => {
    switch (status) {
      case "pending":
        return t("Queued") || "Queued";
      case "preparing":
        return t("In the kitchen") || "In the kitchen";
      case "ready":
        return t("Ready for pickup") || "Ready for pickup";
      case "completed":
        return t("Picked up") || "Picked up";
      case "cancelled":
        return t("Cancelled") || "Cancelled";
      default:
        return status;
    }
  };

  useEffect(() => {
    if (orders.length === 0) {
      setSpendingData([]);
      setSpendingSummary(null);
      return;
    }

    // Group orders by month
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const spendingMap = new Map<string, { total: number; orders: number }>();

    // Initialize last 6 months to ensure they show up in the chart
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      spendingMap.set(`${months[d.getMonth()]} ${d.getFullYear()}`, { total: 0, orders: 0 });
    }

    orders.forEach(o => {
      if (o.status !== "cancelled") {
        const d = new Date(o.date);
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
        if (spendingMap.has(key)) {
          const current = spendingMap.get(key)!;
          spendingMap.set(key, { total: current.total + o.total, orders: current.orders + 1 });
        }
      }
    });

    const data = Array.from(spendingMap.entries()).map(([month, stats]) => ({
      month: month,
      total: stats.total,
      orders: stats.orders
    }));

    let totalSpentLast6Months = 0;
    let topMonth = null;
    let maxTotal = -1;
    let activeMonths = 0;

    data.forEach(d => {
      totalSpentLast6Months += d.total;
      if (d.total > 0) activeMonths++;
      if (d.total > maxTotal) {
        maxTotal = d.total;
        topMonth = d;
      }
    });

    setSpendingData(data);
    setSpendingSummary({
      total_spent: totalSpentLast6Months,
      avg_monthly: activeMonths > 0 ? totalSpentLast6Months / activeMonths : 0,
      top_month: maxTotal > 0 ? topMonth : null,
      months_tracked: activeMonths
    });
  }, [orders]);

  if (mounted && !isAuthLoading && !isLoggedIn) {
    return null;
  }

  const dashboardReady = mounted && !isAuthLoading && !!isLoggedIn;

  const deleteOrder = (orderId: string) => {
    if (deletingOrderIds.includes(orderId)) return;
    setDeletingOrderIds(prev => [...prev, orderId]);

    const finalizeDelete = () => {
      // Remove from state
      setOrders(prev => prev.filter(o => o.id !== orderId));
      setDeletingOrderIds(prev => prev.filter(id => id !== orderId));

      // Remove from localStorage (local orders)
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const updated = localOrders.filter((o: any) => o.id !== orderId);
        localStorage.setItem("spylt_local_orders", JSON.stringify(updated));
      }

      // Track deleted order ID so it stays hidden after refresh (covers backend orders)
      if (user?.email) {
        const deletedKey = `spylt_deleted_orders_${user.email}`;
        const deletedIdsRaw = localStorage.getItem(deletedKey);
        const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];
        if (!deletedIds.includes(orderId)) {
          deletedIds.push(orderId);
          localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
        }
      }
    };

    const orderCard = document.getElementById(`receipt-${orderId}`);
    if (!orderCard) {
      finalizeDelete();
      return;
    }

    gsap.set(orderCard, { overflow: "hidden", transformOrigin: "top center" });
    gsap.to(orderCard, {
      opacity: 0,
      y: -10,
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.32,
      ease: "power2.inOut",
      onComplete: finalizeDelete,
    });
  };

  const confirmCancelOrder = async () => {
    if (!cancelOrderId) return;
    const finalReason = cancelReason === "Other" ? customReason : cancelReason;
    if (!finalReason) {
      setToastMessage({ title: "Error", desc: "Please select or enter a cancellation reason.", type: "info" });
      return;
    }

    // Extract numeric order ID from "ORD-0001" format
    const numericId = parseInt(cancelOrderId.replace("ORD-", ""), 10);

    // Call backend to cancel the order (notifies admin via WebSocket)
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/auth/orders/${numericId}/cancel/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel_reason: finalReason }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn("Backend cancel failed:", errData);
      }
    } catch (err) {
      console.warn("Backend unreachable, cancelling locally:", err);
    }

    // Update local state
    setOrders(prev => prev.map(o => o.id === cancelOrderId ? { ...o, status: "cancelled" } : o));

    // Update localStorage
    const localOrdersRaw = localStorage.getItem("spylt_local_orders");
    if (localOrdersRaw) {
      const localOrders = JSON.parse(localOrdersRaw);
      const updated = localOrders.map((o: any) => o.id === cancelOrderId ? { ...o, status: "cancelled", cancel_reason: finalReason } : o);
      localStorage.setItem("spylt_local_orders", JSON.stringify(updated));
    }

    setToastMessage({ title: "Order Cancelled", desc: "Your order has been cancelled.", type: "success" });
    setCancelOrderId(null);
    setCancelReason("");
    setCustomReason("");
  };

  const handleSubmitRating = async () => {
    if (!rateOrderId || ratingValue < 1 || ratingValue > 5) return;
    setIsSubmittingRating(true);
    const numericId = parseInt(rateOrderId.replace("ORD-", ""), 10);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/auth/orders/${numericId}/rate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: ratingValue, rating_comment: ratingComment.trim() }),
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === rateOrderId ? { ...o, rating: ratingValue } : o));
        setToastMessage({ title: "Thank you!", desc: "Your rating has been submitted.", type: "success" });
      } else {
        setToastMessage({ title: "Error", desc: "Failed to submit rating.", type: "info" });
      }
    } catch (err) {
      setToastMessage({ title: "Error", desc: "Network error.", type: "info" });
    } finally {
      setIsSubmittingRating(false);
      setRateOrderId(null);
      setRatingValue(0);
      setHoverRating(0);
      setRatingComment("");
    }
  };

  const handleReorder = (order: Order) => {
    try {
      const cartItems = order.items.map((i) => ({
        name: i.name,
        price: i.price,
        qty: i.qty,
      }));
      localStorage.setItem("spylt_cart", JSON.stringify(cartItems));
      setToastMessage({
        title: "Items Added to Cart",
        desc: "Redirecting to your order...",
        type: "success",
      });
      setTimeout(() => {
        router.push("/order");
      }, 400);
    } catch {
      router.push("/order");
    }
  };

  const handleCompleteOrder = async (order: Order, shouldNavigateToTrack = false) => {
    const numericId = parseInt(order.id.replace("ORD-", ""), 10);

    // Update local state immediately so it moves out of active orders and into history
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: "completed" } : o))
    );

    // Update local storage
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const updated = localOrders.map((o: any) =>
          o.id === order.id ? { ...o, status: "completed" } : o
        );
        localStorage.setItem("spylt_local_orders", JSON.stringify(updated));
      }
    } catch { }

    // Persist claimed order ID so refresh will NEVER resurrect it as ready
    if (user?.email) {
      try {
        const claimedKey = `spylt_claimed_orders_${user.email}`;
        const claimedRaw = localStorage.getItem(claimedKey);
        const claimedIds: string[] = claimedRaw ? JSON.parse(claimedRaw) : [];
        if (!claimedIds.includes(order.id)) {
          claimedIds.push(order.id);
          localStorage.setItem(claimedKey, JSON.stringify(claimedIds));
        }
      } catch { }
    }

    // Call backend completion endpoint
    if (!Number.isNaN(numericId)) {
      try {
        await apiFetch(`${API_BASE_URL}/api/auth/orders/${numericId}/complete/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user?.email || order.userEmail }),
        });
      } catch (err) {
        console.warn("Failed to complete order on backend:", err);
      }
    }

    setToastMessage({
      title: "Order Picked Up",
      desc: `Order ${order.id} is now complete. Enjoy your bakes!`,
      type: "success",
    });

    if (shouldNavigateToTrack) {
      router.push(`/track?orderId=${encodeURIComponent(order.id)}`);
    }
  };

  const downloadReceipt = async (order: Order) => {
    const statusStyles: Record<string, { bg: string; text: string }> = {
      pending: { bg: "#f3f4f6", text: "#374151" },
      preparing: { bg: "#fef3c7", text: "#b45309" },
      ready: { bg: "#dbeafe", text: "#1d4ed8" },
      completed: { bg: "#dcfce7", text: "#15803d" },
      cancelled: { bg: "#fee2e2", text: "#b91c1c" },
    };

    const receiptRoot = document.createElement("div");
    receiptRoot.style.all = "initial";
    receiptRoot.style.width = "400px";
    receiptRoot.style.boxSizing = "border-box";
    receiptRoot.style.padding = "40px 30px";
    receiptRoot.style.background = "#ffffff";
    receiptRoot.style.color = "#2f211b";
    receiptRoot.style.fontFamily = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
    receiptRoot.style.position = "fixed";
    receiptRoot.style.left = "-99999px";
    receiptRoot.style.top = "0";
    receiptRoot.style.zIndex = "-1";
    receiptRoot.style.border = "1px solid #e5e5e5";
    receiptRoot.style.boxShadow = "0 10px 25px rgba(0,0,0,0.05)";

    const brand = document.createElement("div");
    brand.textContent = "GENERATION BREAD";
    brand.style.textAlign = "center";
    brand.style.fontWeight = "900";
    brand.style.fontSize = "32px";
    brand.style.letterSpacing = "0.15em";
    brand.style.marginBottom = "5px";

    const subTitle = document.createElement("div");
    subTitle.textContent = "PREMIUM DRINKS";
    subTitle.style.textAlign = "center";
    subTitle.style.fontWeight = "600";
    subTitle.style.fontSize = "10px";
    subTitle.style.letterSpacing = "0.2em";
    subTitle.style.color = "#8b7355";
    subTitle.style.marginBottom = "30px";

    const infoGrid = document.createElement("div");
    infoGrid.style.display = "flex";
    infoGrid.style.justifyContent = "space-between";
    infoGrid.style.marginBottom = "20px";
    infoGrid.style.fontSize = "12px";
    infoGrid.style.color = "#5a4940";

    const stStyle = statusStyles[order.status] || { bg: '#eee', text: '#333' };

    const leftInfo = document.createElement("div");
    leftInfo.innerHTML = `
      <table style="border-collapse: collapse; font-size: 12px; color: #5a4940; line-height: 1.6; text-align: left;">
        <tr><td style="padding: 0 8px 0 0; font-weight: bold;">Order:</td><td>${order.id}</td></tr>
        <tr><td style="padding: 0 8px 0 0; font-weight: bold;">Status:</td><td style="color: ${stStyle.text}; font-weight: 700;">${order.status.toUpperCase()}</td></tr>
        <tr><td style="padding: 0 8px 0 0; font-weight: bold;">Date:</td><td>${new Date(order.date).toLocaleDateString()}</td></tr>
        <tr><td style="padding: 0 8px 0 0; font-weight: bold;">Time:</td><td>${new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>
      </table>
    `;

    const rightInfo = document.createElement("div");
    rightInfo.style.textAlign = "right";
    rightInfo.style.display = "flex";
    rightInfo.style.flexDirection = "column";
    rightInfo.style.alignItems = "flex-end";
    rightInfo.style.gap = "2px";

    rightInfo.innerHTML = `
      <div style="color: #8b7355; font-size: 10px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Customer</div>
      <div style="word-wrap: break-word; max-width: 150px; font-weight: 700; font-size: 14px;">${order.userName.length > 20 ? order.userName.substring(0, 20) + '...' : order.userName}</div>
    `;

    infoGrid.appendChild(leftInfo);
    infoGrid.appendChild(rightInfo);

    const createDivider = () => {
      const div = document.createElement("div");
      div.style.borderTop = "1.5px dashed #dcd0c6";
      div.style.margin = "20px 0";
      return div;
    };

    const itemsHeader = document.createElement("div");
    itemsHeader.style.display = "flex";
    itemsHeader.style.justifyContent = "space-between";
    itemsHeader.style.fontSize = "10px";
    itemsHeader.style.fontWeight = "bold";
    itemsHeader.style.textTransform = "uppercase";
    itemsHeader.style.letterSpacing = "0.1em";
    itemsHeader.style.color = "#8b7355";
    itemsHeader.style.marginBottom = "10px";

    const hdrLeft = document.createElement("span");
    hdrLeft.textContent = "Qty  Item";
    const hdrRight = document.createElement("span");
    hdrRight.textContent = "Amount";
    itemsHeader.appendChild(hdrLeft);
    itemsHeader.appendChild(hdrRight);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "12px";

    order.items.forEach((item) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "flex-start";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "12px";
      left.style.flex = "1";

      const qty = document.createElement("span");
      qty.textContent = String(item.qty) + "x";
      qty.style.fontWeight = "700";
      qty.style.fontSize = "13px";
      qty.style.color = "#2f211b";

      const name = document.createElement("span");
      name.textContent = item.name;
      name.style.fontSize = "13px";
      name.style.lineHeight = "1.4";
      name.style.fontWeight = "600";
      name.style.color = "#2f211b";
      name.style.paddingRight = "10px";

      left.appendChild(qty);
      left.appendChild(name);

      const price = document.createElement("span");
      price.textContent = `₱${(item.price * item.qty).toFixed(2)}`;
      price.style.fontSize = "13px";
      price.style.fontWeight = "700";
      price.style.color = "#2f211b";
      price.style.whiteSpace = "nowrap";

      row.appendChild(left);
      row.appendChild(price);
      list.appendChild(row);
    });

    const totalContainer = document.createElement("div");
    totalContainer.style.display = "flex";
    totalContainer.style.flexDirection = "column";
    totalContainer.style.gap = "8px";

    const subRow = document.createElement("div");
    subRow.style.display = "flex";
    subRow.style.justifyContent = "space-between";
    subRow.style.fontSize = "12px";
    subRow.style.color = "#5a4940";
    subRow.innerHTML = `<span>Subtotal</span><span>₱${order.total.toFixed(2)}</span>`;

    const taxRow = document.createElement("div");
    taxRow.style.display = "flex";
    taxRow.style.justifyContent = "space-between";
    taxRow.style.fontSize = "12px";
    taxRow.style.color = "#5a4940";
    taxRow.innerHTML = `<span>VAT (Inclusive)</span><span>₱${(order.total * 0.12).toFixed(2)}</span>`;

    const grandRow = document.createElement("div");
    grandRow.style.display = "flex";
    grandRow.style.justifyContent = "space-between";
    grandRow.style.alignItems = "center";
    grandRow.style.marginTop = "8px";

    const totalLabel = document.createElement("span");
    totalLabel.textContent = "TOTAL";
    totalLabel.style.fontSize = "16px";
    totalLabel.style.fontWeight = "900";
    totalLabel.style.letterSpacing = "0.05em";

    const totalValue = document.createElement("span");
    totalValue.textContent = `₱${order.total.toFixed(2)}`;
    totalValue.style.fontWeight = "900";
    totalValue.style.fontSize = "24px";

    grandRow.appendChild(totalLabel);
    grandRow.appendChild(totalValue);

    totalContainer.appendChild(subRow);
    totalContainer.appendChild(taxRow);
    totalContainer.appendChild(grandRow);

    const footer = document.createElement("div");
    footer.style.textAlign = "center";
    footer.style.marginTop = "30px";
    footer.style.fontSize = "11px";
    footer.style.color = "#8b7355";
    footer.style.lineHeight = "1.5";
    footer.innerHTML = "<strong>Thank you for your order!</strong><br/>Fresh from our oven to you.<br/><br/>facebook.com/generationbread";

    receiptRoot.appendChild(brand);
    receiptRoot.appendChild(subTitle);
    receiptRoot.appendChild(infoGrid);
    receiptRoot.appendChild(createDivider());
    receiptRoot.appendChild(itemsHeader);
    receiptRoot.appendChild(list);
    receiptRoot.appendChild(createDivider());
    receiptRoot.appendChild(totalContainer);
    receiptRoot.appendChild(createDivider());
    receiptRoot.appendChild(footer);

    document.body.appendChild(receiptRoot);

    try {
      const canvas = await html2canvas(receiptRoot, {
        scale: 3, // Very high res for crisp text
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `Generation-Bread-Receipt-${order.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Failed to download receipt", err);
    } finally {
      receiptRoot.remove();
    }
  };

  return (
    <PageIntro
      waitForLoad
      isLoaded={dashboardReady}
      onFinish={() => setIntroDone(true)}
    >
      {dashboardReady ? (
        <div ref={containerRef} className="min-h-screen app-canvas relative overflow-x-hidden">
          {/* Soft wash — matches login cream */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 40% at 8% 0%, rgba(227,164,88,0.18), transparent 55%), radial-gradient(ellipse 45% 35% at 100% 5%, rgba(82,49,34,0.05), transparent 50%)",
            }}
          />

          {/* Light header — same family as rest of app */}
          <header className="dashboard-header sticky top-0 z-40 border-b border-dark-brown/10 app-header-bar backdrop-blur-xl pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 md:px-10 md:py-4">
              <Link href="/" className="dashboard-nav-item min-w-0 shrink-0">
                <BrandLogo
                  priority
                  className="h-7 w-auto max-w-[140px] cursor-pointer transition-opacity hover:opacity-80 sm:h-8 sm:max-w-none md:h-9"
                />
              </Link>

              <div className="relative flex shrink-0 items-center justify-end gap-1.5 sm:gap-2.5">
                <button
                  onClick={toggleLanguage}
                  className="dashboard-nav-item rounded-full border border-dark-brown/10 bg-milk/70 px-2.5 py-1.5 text-[11px] font-bold uppercase text-dark-brown transition-colors hover:bg-light-brown/25 sm:px-3 md:px-4 md:py-2 md:text-sm"
                >
                  {language}
                </button>

                <Link
                  href="/order"
                  className="dashboard-nav-item hidden rounded-full bg-dark-brown px-4 py-2 text-sm font-bold uppercase text-milk transition-all hover:bg-dark-brown-hover md:inline-flex"
                >
                  {t("Order") || "Order"}
                </Link>

                <Link
                  href="/track"
                  className="dashboard-nav-item hidden rounded-full border border-dark-brown/10 bg-milk/70 px-4 py-2 text-sm font-bold uppercase text-dark-brown transition-all hover:bg-dark-brown hover:text-milk md:inline-flex"
                >
                  {t("Track") || "Track"}
                </Link>

                <Link
                  href="/profile"
                  className="dashboard-nav-item hidden rounded-full border border-dark-brown/10 bg-milk/70 px-4 py-2 text-sm font-bold uppercase text-dark-brown transition-all hover:bg-dark-brown hover:text-milk md:inline-flex"
                >
                  {t("Profile") || "Profile"}
                </Link>

                <button
                  onClick={() => { void performLogout(signOut); }}
                  className="dashboard-nav-item hidden rounded-full border border-red-brown/15 bg-red-brown/5 px-4 py-2 text-sm font-bold uppercase text-red-brown transition-all hover:bg-red-brown hover:text-milk md:inline-flex"
                >
                  {t("Logout") || "Logout"}
                </button>

                <button
                  type="button"
                  aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={isMobileMenuOpen}
                  className="rounded-full p-2 text-dark-brown transition-colors hover:bg-dark-brown/10 md:hidden"
                  onClick={toggleMobileMenu}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className="overflow-visible">
                    <line className="ham-top" x1="3" y1="6" x2="21" y2="6" />
                    <line className="ham-mid" x1="3" y1="12" x2="21" y2="12" />
                    <line className="ham-bot" x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {showMobileMenu && (
              <div
                ref={mobileMenuRef}
                className="mobile-nav-menu absolute top-full right-0 z-50 flex w-full flex-col items-center gap-2.5 border-b border-dark-brown/10 theme-sheet px-4 py-4 shadow-lg will-change-transform sm:gap-3 sm:py-5 md:hidden"
              >
                {mostOrderedDrink && (
                  <button
                    onClick={() => { closeMobileMenu(); setShowTopDrinksModal(true); }}
                    className="mobile-nav-item w-full max-w-md rounded-2xl border border-dark-brown/10 bg-milk/80 px-4 py-3 text-left text-sm font-bold uppercase leading-snug text-dark-brown sm:px-5"
                  >
                    <span className="block truncate">{t("Usual") || "Usual"}: {mostOrderedDrink}</span>
                  </button>
                )}
                <Link
                  href="/order"
                  onClick={closeMobileMenu}
                  className="mobile-nav-item w-full max-w-md rounded-2xl bg-dark-brown px-4 py-3 text-center text-sm font-bold uppercase text-milk sm:px-5"
                >
                  {t("Order Now") || "Order Now"}
                </Link>
                <Link
                  href="/track"
                  onClick={closeMobileMenu}
                  className="mobile-nav-item w-full max-w-md rounded-2xl border border-dark-brown/10 bg-milk/80 px-4 py-3 text-center text-sm font-bold uppercase text-dark-brown sm:px-5"
                >
                  {t("Track Order") || "Track Order"}
                </Link>
                <Link
                  href="/profile"
                  onClick={closeMobileMenu}
                  className="mobile-nav-item w-full max-w-md rounded-2xl border border-dark-brown/10 bg-milk/80 px-4 py-3 text-center text-sm font-bold uppercase text-dark-brown sm:px-5"
                >
                  {t("Profile") || "Profile"}
                </Link>
                <button
                  onClick={() => { void performLogout(signOut); }}
                  className="mobile-nav-item w-full max-w-md rounded-2xl bg-red-brown/10 px-4 py-3 text-center text-sm font-bold uppercase text-red-brown sm:px-5"
                >
                  {t("Logout") || "Logout"}
                </button>
              </div>
            )}
          </header>

          <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-8 md:px-10 md:py-12">
            {/* Welcome */}
            <section className="dashboard-stagger-item mb-8 md:mb-12">
              <div className="grid items-center gap-6 md:grid-cols-[1fr_minmax(200px,280px)] md:gap-10">
                <div className="min-w-0">
                  <p className="mb-2 font-paragraph text-xs font-bold uppercase tracking-[0.28em] text-dark-brown/40">
                    Generation Bread
                  </p>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-dark-brown leading-tight">
                    {t("Hello") || "Hello"},{" "}
                    <span className="text-brand-gold">
                      {user?.name?.split(" ")[0] || user?.name || "there"}
                    </span>
                  </h1>
                  <p className="mt-3 max-w-md font-paragraph text-sm leading-relaxed text-dark-brown/60 sm:text-[0.95rem]">
                    {activeOrders.length > 0
                      ? (t("Your order is in the kitchen — track it anytime.") ||
                        "Your order is in the kitchen — track it anytime.")
                      : (t("Fresh bakes ready when you are.") ||
                        "Fresh bakes ready when you are.")}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
                    <Link
                      href={activeOrders.length > 0 ? "/track" : "/order"}
                      className="inline-flex items-center gap-2 rounded-full bg-dark-brown px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-milk transition-all hover:bg-dark-brown-hover hover:scale-105 active:scale-95 shadow-sm"
                    >
                      <span>
                        {activeOrders.length > 0
                          ? (t("Track order") || "Track order")
                          : (t("Order now") || "Order now")}
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </Link>
                    <Link
                      href="/scan"
                      className="inline-flex items-center gap-1.5 rounded-full border border-dark-brown/20 bg-milk/90 px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-dark-brown transition-all hover:bg-dark-brown hover:text-milk hover:border-dark-brown shadow-sm active:scale-95"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect width="5" height="5" x="3" y="3" rx="1"/>
                        <rect width="5" height="5" x="16" y="3" rx="1"/>
                        <rect width="5" height="5" x="3" y="16" rx="1"/>
                        <path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
                        <path d="M21 21v.01"/>
                        <path d="M12 7v3a2 2 0 0 1-2 2H7"/>
                        <path d="M3 12h.01"/>
                        <path d="M12 3h.01"/>
                        <path d="M12 16v.01"/>
                        <path d="M16 12h1"/>
                        <path d="M21 12v.01"/>
                        <path d="M12 21v-1"/>
                      </svg>
                      {t("Scan QR")}
                    </Link>
                    {activeOrders.length === 0 && (
                      <Link
                        href="/track"
                        className="inline-flex items-center gap-1.5 rounded-full border border-dark-brown/20 bg-milk/90 px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-dark-brown transition-all hover:bg-dark-brown hover:text-milk hover:border-dark-brown shadow-sm active:scale-95"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="12" cy="12" r="10"/>
                          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                        </svg>
                        {t("Track Order")}
                      </Link>
                    )}
                  </div>

                  {/* Your Usual Chip */}
                  {mostOrderedDrink && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setShowTopDrinksModal(true)}
                        className="group inline-flex items-center gap-2 rounded-full border border-dark-brown/15 bg-milk/90 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-dark-brown transition-all hover:bg-dark-brown hover:text-milk hover:border-dark-brown shadow-sm"
                        title="View your favorite ordered items"
                      >
                        <span className="text-brand-gold text-[12px]">★</span>
                        <span className="font-paragraph text-[11px] font-semibold text-dark-brown/50 group-hover:text-milk/70 uppercase tracking-wider">
                          {t("Your usual") || "Your usual"}:
                        </span>
                        <span className="font-bold">
                          {mostOrderedDrink}
                        </span>
                        <span className="text-dark-brown/40 group-hover:text-milk/70 transition-transform group-hover:translate-x-0.5">
                          →
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative mx-auto w-full max-w-[220px] md:max-w-[260px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPreviewProduct({
                        src: featuredItem.image,
                        alt: featuredItem.name,
                      });
                    }}
                    className="group relative aspect-square w-full overflow-hidden rounded-[2rem] border border-light-brown/30 bg-milk/80 shadow-md cursor-zoom-in transition-all duration-300 hover:scale-[1.03] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-light-brown"
                    aria-label={`View ${featuredItem.name}`}
                  >
                    <Image
                      src={featuredItem.image}
                      alt={featuredItem.name}
                      fill
                      sizes="(max-width: 768px) 220px, 260px"
                      className="object-cover object-center transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                      priority
                    />
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(160deg, rgba(246,235,224,0.1) 0%, transparent 40%, rgba(42,24,16,0.5) 100%)",
                      }}
                    />
                    {/* Top Badge: Shows number of times ordered or tag */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-dark-brown/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-milk backdrop-blur-md shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse" />
                      {featuredItem.count > 1
                        ? `Ordered ${featuredItem.count}×`
                        : orders.length > 0
                          ? (t("Recent Order") || "Recent Order")
                          : (t("Featured") || "Featured")}
                    </div>

                    {/* Bottom Item Name bar */}
                    <div className="absolute bottom-0 inset-x-0 p-3 pt-6 bg-gradient-to-t from-dark-brown/95 via-dark-brown/60 to-transparent text-left">
                      <p className="truncate text-xs font-bold text-milk uppercase tracking-tight">
                        {featuredItem.name}
                      </p>
                    </div>

                    <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-milk backdrop-blur-sm group-hover:bg-dark-brown">
                      View
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* Active order */}
            {activeOrders.length > 0 && (
              <section className="dashboard-stagger-item mb-7 md:mb-10">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 className="min-w-0 text-base font-bold uppercase tracking-tight text-dark-brown sm:text-lg md:text-xl">
                    {t("Current order") || "Current order"}
                  </h2>
                  <Link
                    href="/track"
                    className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-mid-brown transition-colors hover:text-dark-brown sm:text-xs"
                  >
                    {t("Track") || "Track"} →
                  </Link>
                </div>
                <div className="space-y-3">
                  {activeOrders.slice(0, 2).map((order) => {
                    const isReady = order.status === "ready";
                    const status = statusStyles[order.status];
                    return (
                      <div
                        key={order.id}
                        className={`rounded-2xl border p-4 sm:rounded-3xl sm:p-5 md:p-6 ${isReady
                            ? "border-light-brown/40 bg-light-brown/15"
                            : "border-dark-brown/10 bg-milk/70"
                          }`}
                      >
                        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold uppercase tracking-tight text-dark-brown">{order.id}</p>
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                                style={{ background: status.bg, color: status.text }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.text }} />
                                {kitchenLabel(order.status)}
                              </span>
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {order.items.map((i) => {
                                const itemImg = getMenuItemImage(i.name);
                                return (
                                  <div
                                    key={i.name}
                                    className="flex items-center gap-2 rounded-xl border border-dark-brown/10 bg-milk/90 px-2.5 py-1.5 shadow-sm"
                                  >
                                    <div
                                      className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-dark-brown/10 bg-milk cursor-zoom-in"
                                      onClick={() => setPreviewProduct({ src: itemImg, alt: i.name })}
                                      title={`View ${i.name}`}
                                    >
                                      <Image
                                        src={itemImg}
                                        alt={i.name}
                                        fill
                                        sizes="28px"
                                        className="object-cover pointer-events-none"
                                      />
                                    </div>
                                    <span className="font-paragraph text-xs font-semibold text-dark-brown">
                                      {i.qty}× {i.name}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="mt-2.5 text-xl font-bold tabular-nums text-dark-brown">
                              ₱{order.total.toFixed(2)}
                            </p>
                          </div>
                          {order.status === "pending" && (
                            <button
                              onClick={() => setCancelOrderId(order.id)}
                              className="self-start rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-dark-brown/40 transition-colors hover:bg-red-brown/10 hover:text-red-brown"
                            >
                              {t("Cancel") || "Cancel"}
                            </button>
                          )}
                        </div>
                        {isReady ? (
                          <div className="flex flex-col gap-3 rounded-2xl bg-dark-brown px-4 py-3.5 text-milk sm:flex-row sm:flex-wrap sm:items-center sm:justify-between shadow-md">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                              <div>
                                <p className="text-sm font-bold uppercase tracking-wide text-milk">
                                  {t("Ready for pickup") || "Ready for pickup"}
                                </p>
                                <p className="text-[11px] font-paragraph text-milk/60">
                                  Please claim your order at the counter
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleCompleteOrder(order, false)}
                                className="rounded-full bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition-all active:scale-95 shadow-sm"
                                title="Mark this order as picked up"
                              >
                                ✓ {t("Claimed") || "Claimed"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCompleteOrder(order, true)}
                                className="rounded-full bg-milk/15 hover:bg-milk/25 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-light-brown hover:text-milk transition-all active:scale-95"
                                title="View tracking receipt & complete"
                              >
                                {t("View") || "View"} →
                              </button>
                            </div>
                          </div>
                        ) : (
                          <QueuePositionCard eta={orderEtas[order.id]} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Stats Overview */}
            <section className="dashboard-stagger-item mb-8 md:mb-10">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <div className="rounded-2xl border border-dark-brown/10 bg-milk/80 p-4 shadow-xs">
                  <p className="font-paragraph text-[10px] font-bold uppercase tracking-[0.2em] text-dark-brown/45">
                    {t("Orders") || "Orders"}
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-dark-brown sm:text-3xl">
                    {lifetimeTotalOrders}
                  </p>
                  <p className="mt-0.5 font-paragraph text-[11px] text-dark-brown/50">
                    Total placed
                  </p>
                </div>

                <div className="rounded-2xl border border-dark-brown/10 bg-milk/80 p-4 shadow-xs">
                  <p className="font-paragraph text-[10px] font-bold uppercase tracking-[0.2em] text-dark-brown/45">
                    {t("Spent") || "Spent"}
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-dark-brown sm:text-3xl">
                    ₱{lifetimeTotalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="mt-0.5 font-paragraph text-[11px] text-dark-brown/50">
                    Lifetime total
                  </p>
                </div>

                <div className="rounded-2xl border border-dark-brown/10 bg-milk/80 p-4 shadow-xs">
                  <p className="font-paragraph text-[10px] font-bold uppercase tracking-[0.2em] text-dark-brown/45">
                    {t("Completed") || "Completed"}
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-dark-brown sm:text-3xl">
                    {lifetimeCompleted}
                  </p>
                  <p className="mt-0.5 font-paragraph text-[11px] text-dark-brown/50">
                    Orders claimed
                  </p>
                </div>

                {mostOrderedDrink ? (
                  <button
                    type="button"
                    onClick={() => setShowTopDrinksModal(true)}
                    className="group rounded-2xl border border-brand-gold/30 bg-gradient-to-br from-milk/90 to-light-brown/15 p-4 text-left shadow-xs transition-all hover:border-brand-gold/60 hover:shadow-sm active:scale-98"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-paragraph text-[10px] font-bold uppercase tracking-[0.2em] text-mid-brown">
                        ⭐ {t("Your usual") || "Your usual"}
                      </p>
                      <span className="text-xs text-mid-brown group-hover:translate-x-0.5 transition-transform">→</span>
                    </div>
                    <p className="mt-1.5 truncate font-paragraph text-sm font-bold text-dark-brown group-hover:text-mid-brown transition-colors">
                      {mostOrderedDrink}
                    </p>
                    <p className="mt-0.5 font-paragraph text-[11px] text-dark-brown/50">
                      {topDrinks[0]?.count ? `${topDrinks[0].count} orders` : "Your #1 pick"}
                    </p>
                  </button>
                ) : (
                  <div className="rounded-2xl border border-dark-brown/10 bg-milk/80 p-4 shadow-xs">
                    <p className="font-paragraph text-[10px] font-bold uppercase tracking-[0.2em] text-dark-brown/45">
                      Status
                    </p>
                    <p className="mt-1.5 text-xl font-bold text-dark-brown">
                      {activeOrders.length > 0 ? "Active Order" : "Ready to order"}
                    </p>
                    <p className="mt-0.5 font-paragraph text-[11px] text-dark-brown/50">
                      Fresh daily bakes
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Recent orders */}
            <section className="dashboard-stagger-item mb-8 md:mb-10">
              <div className="mb-5 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold uppercase tracking-tight text-dark-brown md:text-2xl">
                    {t("Recent Orders") || "Recent Orders"}
                  </h2>
                  <p className="mt-0.5 font-paragraph text-sm text-dark-brown/50">
                    {t("Your latest activity & purchase history") || "Your latest activity & purchase history"}
                  </p>
                </div>
                <Link
                  href="/order"
                  className="hidden rounded-full bg-dark-brown px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-milk shadow-sm transition-all hover:bg-dark-brown-hover hover:scale-105 active:scale-95 sm:inline-flex sm:items-center sm:gap-1.5"
                >
                  <span>{t("Order Now")}</span>
                  <span>→</span>
                </Link>
              </div>

              {orders.length === 0 ? (
                <div className="rounded-3xl border border-dark-brown/10 bg-milk/70 px-6 py-14 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-light-brown/15">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mid-brown">
                      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                      <path d="M3 6h18" />
                      <path d="M16 10a4 4 0 0 1-8 0" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold uppercase tracking-tight text-dark-brown">
                    {t("No orders yet") || "No orders yet"}
                  </p>
                  <p className="mx-auto mt-2 max-w-sm font-paragraph text-sm text-dark-brown/50">
                    {t("Place your first order from the menu.") || "Place your first order from the menu."}
                  </p>
                  <Link
                    href="/order"
                    className="mt-6 inline-block rounded-full bg-dark-brown px-8 py-3 text-sm font-bold uppercase text-milk transition-colors hover:bg-dark-brown-hover"
                  >
                    {t("Order Now")}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {orders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((order) => {
                    const orderStatus = statusStyles[order.status];
                    const formattedDate = (() => {
                      try {
                        const d = new Date(order.date);
                        return d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });
                      } catch {
                        return order.date;
                      }
                    })();

                    return (
                      <article
                        key={order.id}
                        id={`receipt-${order.id}`}
                        className="paginated-order overflow-hidden rounded-2xl border border-dark-brown/12 bg-milk/80 p-4 shadow-xs transition-all hover:border-dark-brown/25 hover:shadow-sm sm:rounded-3xl sm:p-5 md:p-6"
                      >
                        {/* Order Card Header */}
                        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-dark-brown/10 pb-3.5 md:flex-row md:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-bold uppercase tracking-tight text-dark-brown">
                                {order.id}
                              </p>
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                                style={{ background: orderStatus.bg, color: orderStatus.text }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: orderStatus.text }} />
                                {kitchenLabel(order.status)}
                              </span>
                              {order.status !== "cancelled" && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${order.paymentStatus === "paid"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                    }`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${order.paymentStatus === "paid" ? "bg-emerald-600" : "bg-amber-600"}`} />
                                  {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                                </span>
                              )}
                              {(order.status === "pending" || order.status === "preparing") && orderEtas[order.id] && (
                                <QueuePositionCard eta={orderEtas[order.id]} compact />
                              )}
                            </div>
                            <p className="mt-1 font-paragraph text-xs text-dark-brown/45">
                              {formattedDate}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex max-w-full flex-wrap items-center gap-1.5 self-start md:self-auto" data-html2canvas-ignore="true">
                            {order.status === "pending" && (
                              <button
                                onClick={() => setCancelOrderId(order.id)}
                                className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-dark-brown/50 transition-colors hover:bg-red-brown/10 hover:text-red-brown"
                              >
                                {t("Cancel")}
                              </button>
                            )}
                            {order.status === "completed" && (
                              order.rating ? (
                                <div className="flex items-center gap-0.5 rounded-full bg-light-brown/10 px-2.5 py-1" title={`Rated ${order.rating}`}>
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <svg key={star} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={star <= order.rating! ? "#e3a458" : "none"} stroke={star <= order.rating! ? "#e3a458" : "currentColor"} strokeWidth="2" className="text-dark-brown/20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                  ))}
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setRateOrderId(order.id); setRatingValue(0); }}
                                  className="inline-flex items-center gap-1 rounded-full border border-dark-brown/15 bg-milk/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-mid-brown transition-all hover:bg-dark-brown hover:text-milk hover:border-dark-brown shadow-2xs"
                                >
                                  <span>★</span> Rate
                                </button>
                              )
                            )}
                            <button
                              onClick={() => handleReorder(order)}
                              className="inline-flex items-center gap-1 rounded-full bg-dark-brown px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-milk shadow-2xs transition-all hover:bg-dark-brown-hover hover:scale-105 active:scale-95"
                              title="Add items to cart and reorder"
                            >
                              <span>⟲</span> {t("Reorder") || "Reorder"}
                            </button>
                            <button
                              onClick={() => downloadReceipt(order)}
                              className="inline-flex items-center gap-1 rounded-full border border-dark-brown/15 bg-milk/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-dark-brown/70 shadow-2xs transition-all hover:bg-dark-brown hover:text-milk hover:border-dark-brown"
                              title="Save / Download Receipt"
                            >
                              <span>↓</span> {t("Receipt") || "Receipt"}
                            </button>
                            <button
                              onClick={() => deleteOrder(order.id)}
                              disabled={deletingOrderIds.includes(order.id)}
                              className="rounded-full px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-red-brown/50 transition-colors hover:bg-red-brown/10 hover:text-red-brown disabled:opacity-50"
                              title="Delete this order record"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Order Items List */}
                        <div className="divide-y divide-dark-brown/8">
                          {order.items.map((item) => {
                            const itemImg = getMenuItemImage(item.name);
                            const matchOptions = item.name.match(/^(.*?)\s*\((.*?)\)$/);
                            const baseName = matchOptions ? matchOptions[1] : item.name;
                            const optionsStr = matchOptions ? matchOptions[2] : null;

                            return (
                              <div key={item.name} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div
                                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-dark-brown/15 bg-milk shadow-inner cursor-zoom-in transition-transform hover:scale-105"
                                    onClick={() => setPreviewProduct({ src: itemImg, alt: item.name })}
                                    title={`View ${item.name}`}
                                  >
                                    <Image
                                      src={itemImg}
                                      alt={item.name}
                                      fill
                                      sizes="40px"
                                      className="object-cover pointer-events-none"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-baseline gap-2">
                                      <span className="shrink-0 rounded-md bg-dark-brown/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-dark-brown/70">
                                        {item.qty}×
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate font-paragraph text-sm font-bold leading-snug text-dark-brown">
                                          {baseName}
                                        </p>
                                        {optionsStr && (
                                          <p className="truncate font-paragraph text-[11px] text-dark-brown/55">
                                            {optionsStr}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <span className="shrink-0 font-paragraph text-sm font-bold tabular-nums text-dark-brown">
                                  ₱{(item.price * item.qty).toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Order Card Footer */}
                        <div className="mt-3 flex items-center justify-between border-t border-dark-brown/10 pt-3">
                          <span className="font-paragraph text-xs font-semibold uppercase tracking-wider text-dark-brown/45">
                            {order.items.reduce((acc, i) => acc + i.qty, 0)} {order.items.reduce((acc, i) => acc + i.qty, 0) === 1 ? "Item" : "Items"} · {t("Total") || "Total"}
                          </span>
                          <span className="text-xl font-bold tabular-nums text-dark-brown">
                            ₱{order.total.toFixed(2)}
                          </span>
                        </div>
                      </article>
                    );
                  })}

                  {Math.ceil(orders.length / ITEMS_PER_PAGE) > 1 && (
                    <div className="mt-3 flex items-center justify-between gap-2 px-0.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="rounded-full bg-dark-brown/5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-dark-brown transition-colors hover:bg-dark-brown hover:text-milk disabled:opacity-40 sm:px-5 sm:text-xs"
                      >
                        Prev
                      </button>
                      <span className="font-paragraph text-sm tabular-nums text-dark-brown/45">
                        {currentPage} / {Math.ceil(orders.length / ITEMS_PER_PAGE)}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(Math.ceil(orders.length / ITEMS_PER_PAGE), p + 1))}
                        disabled={currentPage === Math.ceil(orders.length / ITEMS_PER_PAGE)}
                        className="rounded-full bg-dark-brown/5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-dark-brown transition-colors hover:bg-dark-brown hover:text-milk disabled:opacity-40 sm:px-5 sm:text-xs"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Spending — collapsed */}
            <section className="dashboard-stagger-item pb-2">
              <button
                type="button"
                onClick={() => setShowSpending((v) => !v)}
                className="group flex w-full cursor-pointer items-center justify-between gap-3 border-t border-dark-brown/10 pt-6 text-left"
              >
                <div>
                  <h2 className="text-lg font-bold uppercase tracking-tight text-dark-brown transition-colors group-hover:text-mid-brown md:text-xl">
                    {t("Spending Insights") || "Spending Insights"}
                  </h2>
                  <p className="mt-0.5 font-paragraph text-sm text-dark-brown/40">
                    {t("Monthly trends") || "Monthly trends"}
                  </p>
                </div>
                <span className="text-lg font-bold tabular-nums text-dark-brown/35">
                  {showSpending ? "−" : "+"}
                </span>
              </button>

              {showSpending && (
                <div className="mt-5">
                  {spendingData.length === 0 ? (
                    <div className="rounded-3xl border border-dark-brown/10 bg-milk/60 px-6 py-10 text-center">
                      <p className="font-paragraph text-sm text-dark-brown/55">
                        {t("Complete an order to see your spending trends") ||
                          "Complete an order to see your spending trends"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-3">
                        <div>
                          <p className="font-paragraph text-[10px] uppercase tracking-[0.2em] text-dark-brown/40">
                            {t("Avg Monthly") || "Avg Monthly"}
                          </p>
                          <p className="mt-0.5 text-xl font-bold tabular-nums text-dark-brown">
                            ₱{spendingSummary?.avg_monthly?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || "0"}
                          </p>
                        </div>
                        <div>
                          <p className="font-paragraph text-[10px] uppercase tracking-[0.2em] text-dark-brown/40">
                            {t("Top Month") || "Top Month"}
                          </p>
                          <p className="mt-0.5 text-xl font-bold text-dark-brown">{spendingSummary?.top_month?.month || "—"}</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-dark-brown/10 bg-milk/70 p-3 sm:rounded-3xl sm:p-4 md:p-5">
                        <div className="h-48 w-full min-w-0 sm:h-56">
                          {chartReady ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                              <BarChart data={spendingData} margin={{ top: 5, right: 4, left: -18, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: chartTick }} tickLine={false} axisLine={false} interval={spendingData.length > 6 ? Math.floor(spendingData.length / 6) : 0} />
                                <YAxis width={42} tick={{ fontSize: 10, fill: chartTick }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₱${v}`} />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: 16,
                                    border: `1px solid ${withAlpha(tc.lightBrown, "55")}`,
                                    background: tc.milk,
                                    fontSize: 13,
                                  }}
                                  formatter={(v: any, name: any) => {
                                    if (name === "total") return [`₱${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Spent"];
                                    return [v, name];
                                  }}
                                />
                                <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={40} animationDuration={700}>
                                  {spendingData.map((entry, index) => (
                                    <Cell key={index} fill={spendingSummary?.top_month?.month === entry.month ? tc.yellowBrown : tc.midBrown} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <div className="h-6 w-6 animate-spin rounded-full border-4 border-light-brown/30 border-t-light-brown" />
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </main>
          {/* Toast Notification */}
          {toastMessage && (
            <div className="fixed bottom-6 right-6 z-50 transition-all duration-300">
              <div className="flex items-start gap-3 rounded-2xl border border-light-brown/30 bg-milk/95 px-5 py-4 shadow-2xl backdrop-blur-md">
                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${toastMessage.type === "success" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                  {toastMessage.type === "success" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  )}
                </div>
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-bold text-dark-brown">{toastMessage.title}</p>
                  <p className="mt-0.5 text-xs text-dark-brown/60 font-paragraph">{toastMessage.desc}</p>
                </div>
                <button onClick={() => setToastMessage(null)} className="ml-2 text-dark-brown/40 hover:text-dark-brown">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Favorites modal */}
          {showTopDrinksModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-dark-brown/50 backdrop-blur-sm" onClick={() => setShowTopDrinksModal(false)} />
              <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-dark-brown/10 bg-milk shadow-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-dark-brown/10 px-6 py-5">
                  <div>
                    <p className="mb-1 font-paragraph text-[0.65rem] uppercase tracking-[0.3em] text-dark-brown/40">
                      {t("Favorites") || "Favorites"}
                    </p>
                    <h3 className="text-lg font-bold uppercase tracking-tight text-dark-brown">
                      {t("Your usuals") || "Your usuals"}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowTopDrinksModal(false)}
                    className="rounded-full p-2 text-dark-brown/50 transition-colors hover:bg-dark-brown/5 hover:text-dark-brown"
                    aria-label="Close"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="w-full overflow-y-auto p-5">
                  {topDrinks.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      {topDrinks.slice(0, 10).map((drink, index) => {
                        const img = getMenuItemImage(drink.name);
                        return (
                          <div key={drink.name} className="flex items-center justify-between rounded-2xl border border-dark-brown/10 bg-[#fffaf4] p-3 transition-colors hover:bg-milk">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-5 text-xs font-bold tabular-nums text-dark-brown/40 shrink-0">#{index + 1}</span>
                              <div
                                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-dark-brown/15 bg-milk cursor-zoom-in"
                                onClick={() => setPreviewProduct({ src: img, alt: drink.name })}
                                title={`View ${drink.name}`}
                              >
                                <Image
                                  src={img}
                                  alt={drink.name}
                                  fill
                                  sizes="48px"
                                  className="object-cover pointer-events-none"
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-bold leading-tight text-dark-brown">{drink.name}</span>
                                <span className="font-paragraph text-[11px] text-dark-brown/45">Favorite #{index + 1}</span>
                              </div>
                            </div>
                            <div className="shrink-0 pl-3 text-right">
                              <span className="text-sm font-bold tabular-nums text-dark-brown">{drink.count}×</span>
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-dark-brown/40">{t("Orders")}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-10 text-center font-paragraph text-sm text-dark-brown/55">
                      {t("Start ordering your favorites to see them here!")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Cancellation Modal */}
          {cancelOrderId && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-dark-brown/60 backdrop-blur-sm transition-opacity" onClick={() => { setCancelOrderId(null); setCancelReason(""); setCustomReason(""); }} />
              <div className="relative bg-milk border border-light-brown/20 shadow-2xl rounded-3xl w-full max-w-md p-6 overflow-hidden">

                {/* Step 1: Reason Selection */}
                {cancelReason !== "Other" ? (
                  <>
                    <h3 className="text-xl font-bold text-dark-brown uppercase tracking-wider mb-2">{t("Cancel Order")}</h3>
                    <p className="font-paragraph text-dark-brown/70 text-sm mb-6">Please tell us why you are cancelling this order. This helps us improve our service.</p>

                    <div className="flex flex-col gap-3 mb-6">
                      {["Changed my mind", "Ordered by mistake", "Taking too long", "Other"].map((reason) => (
                        <label key={reason} className={`flex items-center gap-3 p-3 border rounded-2xl cursor-pointer transition-all ${cancelReason === reason ? 'border-dark-brown bg-dark-brown/5 shadow-sm' : 'border-dark-brown/10 hover:bg-white/50'}`}>
                          <input
                            type="radio"
                            name="cancelReason"
                            value={reason}
                            checked={cancelReason === reason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="w-4 h-4 text-dark-brown focus:ring-dark-brown border-gray-300"
                          />
                          <span className="font-paragraph text-dark-brown text-sm">{reason}</span>
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => { setCancelOrderId(null); setCancelReason(""); setCustomReason(""); }}
                        className="px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-dark-brown bg-dark-brown/10 hover:bg-dark-brown/20 transition-colors focus:outline-none"
                      >
                        Keep Order
                      </button>
                      <button
                        onClick={confirmCancelOrder}
                        disabled={!cancelReason}
                        className={`px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-milk shadow-md focus:outline-none transition-colors ${cancelReason ? 'bg-[#b91c1c] hover:bg-[#991b1b]' : 'bg-gray-300 cursor-not-allowed'}`}
                      >
                        Confirm Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  /* Step 2: Custom Reason (when "Other" is selected) */
                  <>
                    <button
                      onClick={() => setCancelReason("")}
                      className="flex items-center gap-2 text-dark-brown/60 hover:text-dark-brown font-bold text-xs uppercase tracking-wider mb-4 transition-colors focus:outline-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
                      Back
                    </button>
                    <h3 className="text-xl font-bold text-dark-brown uppercase tracking-wider mb-2">Your Reason</h3>
                    <p className="font-paragraph text-dark-brown/70 text-sm mb-4">Please share some details on why you&apos;re cancelling so we can do better next time.</p>

                    <textarea
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="e.g. I found a better option, changed my plans..."
                      autoFocus
                      className="w-full p-4 bg-white/60 border border-dark-brown/20 rounded-2xl outline-none focus:border-dark-brown focus:ring-2 focus:ring-dark-brown/10 font-paragraph text-sm text-dark-brown min-h-[120px] mb-6 resize-none transition-all"
                    />

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setCancelReason("")}
                        className="px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-dark-brown bg-dark-brown/10 hover:bg-dark-brown/20 transition-colors focus:outline-none"
                      >
                        Back
                      </button>
                      <button
                        onClick={confirmCancelOrder}
                        disabled={!customReason.trim()}
                        className={`px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-milk shadow-md focus:outline-none transition-colors ${customReason.trim() ? 'bg-[#b91c1c] hover:bg-[#991b1b]' : 'bg-gray-300 cursor-not-allowed'}`}
                      >
                        Confirm Cancel
                      </button>
                    </div>
                  </>
                )}

              </div>
            </div>
          )}

          {/* Rating Modal */}
          {rateOrderId && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-dark-brown/60 backdrop-blur-sm transition-opacity" onClick={() => { setRateOrderId(null); setRatingValue(0); setRatingComment(""); }} />
              <div className="relative bg-milk border border-light-brown/20 shadow-2xl rounded-3xl w-full max-w-md p-6 overflow-hidden text-center">
                <h3 className="text-xl font-bold text-dark-brown uppercase tracking-wider mb-2">Rate Your Experience</h3>
                <p className="font-paragraph text-dark-brown/70 text-sm mb-6">How was your order <strong>{rateOrderId}</strong>?</p>

                <div className="flex justify-center gap-2 mb-6" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= (hoverRating || ratingValue);
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingValue(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        className={`transition-all duration-150 hover:scale-110 focus:outline-none ${active ? "text-amber-400 fill-amber-400" : "text-dark-brown/20"
                          }`}
                        aria-label={`Rate ${star} star`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  rows={3}
                  placeholder="Optional feedback about your experience..."
                  className="w-full mb-5 bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown font-paragraph resize-none"
                />

                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => { setRateOrderId(null); setRatingValue(0); setRatingComment(""); }}
                    className="px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-dark-brown bg-dark-brown/10 hover:bg-dark-brown/20 transition-colors focus:outline-none"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleSubmitRating}
                    disabled={ratingValue === 0 || isSubmittingRating}
                    className={`px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-milk shadow-md focus:outline-none transition-colors ${ratingValue > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
                  >
                    {isSubmittingRating ? "Submitting..." : "Submit Rating"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ProductLightbox
            src={previewProduct?.src || ""}
            alt={previewProduct?.alt || ""}
            open={!!previewProduct}
            onClose={() => setPreviewProduct(null)}
          />
        </div>
      ) : null}
    </PageIntro>
  );
}
