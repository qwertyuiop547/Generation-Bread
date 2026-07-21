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
import { withWsToken } from "@/lib/authHeaders";
import BrandLogo from "@/components/BrandLogo";
import { useThemeColors, withAlpha } from "@/lib/themeColors";

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
  const { isLoggedIn, isAuthLoading, user, logout } = useAuth();
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
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [deletingOrderIds, setDeletingOrderIds] = useState<string[]>([]);
  const [spendingData, setSpendingData] = useState<{ month: string; total: number; orders: number }[]>([]);
  const [spendingSummary, setSpendingSummary] = useState<{ total_spent: number; avg_monthly: number; top_month: { month: string; total: number; orders: number } | null; months_tracked: number } | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);

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

  useEffect(() => {
    if (!user?.email) return;

    const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
    const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
    const wsUrl = withWsToken(
      `${wsProtocol}${wsHost}/ws/orders/${encodeURIComponent(user.email)}/`
    );

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
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
                  paymentStatus: data.payment_status || o.paymentStatus,
                }
              : o
          );
        });
        return;
      }

      if (data.type === "order_status_update") {
        if (data.status === "completed" && !data.rating) {
          setRateOrderId(orderIdFormatted);
        }

        setOrders((prev) => {
          const exists = prev.some((o) => o.id === orderIdFormatted);
          if (exists) {
            setToastMessage({
              title: "Order Updated",
              desc: `Your order ${orderIdFormatted} is now ${data.status.toUpperCase()}`,
              type: "success",
            });
          }
          return prev.map((o) =>
            o.id === orderIdFormatted ? { ...o, status: data.status, rating: data.rating || o.rating } : o
          );
        });
      }
    };

    return () => {
      // Avoid noisy "closed before established" warnings during React dev remounts.
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close();
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [user?.email]);

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
          const res = await fetch(`${API_BASE_URL}/api/auth/orders/?email=${encodeURIComponent(user.email)}`);
          if (res.ok) {
            const data = await res.json();
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

        // Combine backend orders and local orders, filtering deleted, sorting by date descending
        const allOrders = [...mappedOrders, ...localOrders]
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
          } catch {}
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
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    const fetchSpending = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/spending/?email=${encodeURIComponent(user.email)}`);
        if (res.ok) {
          const data = await res.json();
          setSpendingData(data.spending || []);
          setSpendingSummary(data.summary || null);
        }
      } catch {}
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
    orders.forEach(o => {
      if (o.status !== "cancelled") {
        o.items.forEach(i => itemCounts.set(i.name, (itemCounts.get(i.name) || 0) + i.qty));
      }
    });
    const sorted = Array.from(itemCounts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.map(([name, count]) => ({ name, count }));
  }, [orders]);

  const mostOrderedDrink = topDrinks.length > 0 ? topDrinks[0].name : null;

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
      const res = await fetch(`${API_BASE_URL}/api/auth/orders/${numericId}/cancel/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, cancel_reason: finalReason }),
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
      const res = await fetch(`${API_BASE_URL}/api/auth/orders/${numericId}/rate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, rating: ratingValue, comment: ratingComment.trim() }),
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
      setRatingComment("");
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
        <tr><td style="padding: 0 8px 0 0; font-weight: bold;">Time:</td><td>${new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td></tr>
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
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 10% 0%, rgba(227,164,88,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 95% 15%, rgba(127,59,45,0.08), transparent 50%)",
        }}
      />

      {/* Header */}
      <div className="dashboard-header sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-3.5 md:py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="dashboard-nav-item shrink-0">
              <BrandLogo
                priority
                className="h-7 w-auto sm:h-8 md:h-10 cursor-pointer hover:scale-105 transition-transform drop-shadow-md"
              />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 justify-end relative">
            <button
              onClick={toggleLanguage}
              className="dashboard-nav-item app-chip hover:bg-light-brown/30 text-dark-brown font-bold text-xs md:text-sm rounded-full py-1.5 px-3 md:py-2 md:px-4 transition-all uppercase border shadow-sm"
            >
              {language}
            </button>
            <button
              onClick={() => { void performLogout(signOut); }}
              className="dashboard-nav-item group flex items-center gap-1.5 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-[11px] md:text-sm uppercase rounded-full py-1.5 px-3 md:py-2 md:px-4 transition-all duration-300 shadow-sm border border-red-brown/10"
            >
              <span>{t("Logout") || "Logout"}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
            <h1 className="dashboard-nav-item text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight hidden sm:block md:hidden mr-2">My Dashboard</h1>

            {/* Hamburger Button for Mobile */}
            <button
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              className="md:hidden p-2 text-dark-brown hover:bg-dark-brown/10 rounded-full transition-colors"
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

            {/* Desktop-only extras */}
            <div className="hidden md:flex items-center gap-4">
              {mostOrderedDrink && (
                <button onClick={() => setShowTopDrinksModal(true)} className="dashboard-nav-item hidden lg:flex relative items-center gap-2 bg-gradient-to-r from-[#d4af37]/20 to-[#e9d28c]/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-[#d4af37]/50 shadow-[0_4px_15px_-3px_rgba(212,175,55,0.4)] transition-all duration-500 hover:scale-[1.03] hover:shadow-[0_8px_25px_-4px_rgba(212,175,55,0.6)] group cursor-pointer text-left focus:outline-none" title="View Top Drinks">
                  <span className="text-lg leading-none group-hover:-rotate-12 group-hover:scale-125 transition-transform duration-500 drop-shadow-md pb-0.5" title="Most Ordered Item">👑</span>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#4a3930] drop-shadow-sm">
                    Top Drink: <span className="text-[#7c5a08] group-hover:text-[#5c4205] transition-colors">{mostOrderedDrink}</span>
                  </span>
                  <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/40 group-hover:ring-white/70 transition-colors pointer-events-none" />
                </button>
              )}
              <Link
                href="/profile"
                className="dashboard-nav-item group flex items-center gap-2 app-chip hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 border"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>{t("Profile") || "Profile"}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {showMobileMenu && (
          <div
            ref={mobileMenuRef}
            className="mobile-nav-menu md:hidden absolute top-[100%] right-0 w-full app-header-bar backdrop-blur-md border-b border-dark-brown/10 shadow-[0_16px_40px_-18px_rgba(82,49,34,0.45)] flex flex-col items-center py-5 gap-3 z-50 will-change-transform"
          >
            {mostOrderedDrink && (
              <button onClick={() => { closeMobileMenu(); setShowTopDrinksModal(true); }} className="mobile-nav-item flex items-center gap-3 w-[90%] bg-gradient-to-r from-[#d4af37]/20 to-[#e9d28c]/40 text-[#5c4205] font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]">
                <span className="text-lg leading-none">👑</span>
                Top Drink: {mostOrderedDrink}
              </button>
            )}
            <Link
              href="/profile"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] app-chip hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm border active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              {t("Profile") || "Profile"}
            </Link>
            <button
              onClick={() => { void performLogout(signOut); }}
              className="mobile-nav-item flex items-center justify-between gap-3 w-[90%] bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <span>{t("Logout") || "Logout"}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-5 md:px-10 py-7 md:py-12 relative z-10">
        {/* Welcome */}
        <div className="dashboard-stagger-item mb-7 md:mb-10">
          <p className="mb-2 font-paragraph text-[0.65rem] uppercase tracking-[0.35em] text-dark-brown/45">
            Dashboard
          </p>
          <h2 className="text-[clamp(1.85rem,6vw,2.75rem)] font-bold text-dark-brown uppercase leading-[0.95] tracking-[-0.03em]">
            {t("Welcome,")}{" "}
            <span className="text-mid-brown">{user?.name}</span>
          </h2>
          <p className="font-paragraph text-dark-brown/60 mt-2 text-sm sm:text-base">{t("Here is your activity overview.")}</p>
        </div>

        {/* Stats */}
        <div className={`grid grid-cols-1 ${mostOrderedDrink ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'} gap-3.5 md:gap-5 mb-7 md:mb-10`}>
          <div className="dashboard-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] hover:shadow-[0_12px_32px_-10px_rgba(82,49,34,0.3)] transition-shadow">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase tracking-wider mb-1.5">{t("Total Orders")}</p>
            <p className="text-3xl md:text-4xl font-bold text-dark-brown tracking-tight">{lifetimeTotalOrders}</p>
          </div>
          <div className="dashboard-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] hover:shadow-[0_12px_32px_-10px_rgba(82,49,34,0.3)] transition-shadow">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase tracking-wider mb-1.5">{t("Total Spent")}</p>
            <p className="text-3xl md:text-4xl font-bold text-dark-brown tracking-tight">₱{lifetimeTotalSpent.toFixed(2)}</p>
          </div>
          <div className="dashboard-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] hover:shadow-[0_12px_32px_-10px_rgba(82,49,34,0.3)] transition-shadow">
            <p className="font-paragraph text-dark-brown/50 text-xs uppercase tracking-wider mb-1.5">{t("Completed")}</p>
            <p className="text-3xl md:text-4xl font-bold text-dark-brown tracking-tight">{lifetimeCompleted}</p>
          </div>
          {mostOrderedDrink && (
            <button onClick={() => setShowTopDrinksModal(true)} className="dashboard-stagger-item relative overflow-hidden bg-gradient-to-br from-[#d4af37]/15 to-[#f3e5ab]/40 border border-[#d4af37]/40 rounded-3xl p-5 md:p-6 shadow-[0_8px_30px_-4px_rgba(212,175,55,0.28)] hover:shadow-[0_12px_40px_-4px_rgba(212,175,55,0.45)] transition-all duration-500 group text-left flex flex-col justify-center focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50">
              <div className="absolute -right-6 -top-6 text-[100px] opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-700 pointer-events-none">👑</div>
              <p className="font-paragraph text-[#8b6508] font-semibold text-xs mb-1 uppercase tracking-wider flex items-center gap-2">
                <span className="inline-block animate-pulse" style={{ animationDuration: '2s' }}>✨</span> {t("#1 Favorite")}
              </p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-[#5c4205] leading-tight mt-1.5 drop-shadow-sm pr-6">
                {mostOrderedDrink}
              </p>
              <p className="text-[#8b6508] text-[10px] mt-2 uppercase font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">{t("View Leaderboard")} <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></p>
              <div className="absolute inset-0 ring-1 ring-inset ring-white/50 rounded-3xl pointer-events-none"></div>
            </button>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 md:gap-5 mb-7 md:mb-10">
          <div className="dashboard-stagger-item">
            <Link href="/order" className="group bg-dark-brown hover:bg-dark-brown-hover text-milk rounded-3xl p-5 md:p-6 shadow-[0_10px_28px_-10px_rgba(42,24,16,0.45)] transition-all flex items-center justify-between h-full active:scale-[0.99]">
              <div>
                <p className="font-bold uppercase text-lg tracking-tight">{t("Order Now")}</p>
                <p className="font-paragraph text-milk/60 text-sm mt-1">{t("Browse the menu and place an order")}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform shrink-0">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="dashboard-stagger-item">
            <Link href="/scan" className="group bg-light-brown hover:bg-mid-brown text-dark-brown hover:text-milk rounded-3xl p-5 md:p-6 shadow-[0_10px_28px_-10px_rgba(227,164,88,0.45)] transition-all flex items-center justify-between h-full active:scale-[0.99]">
              <div>
                <p className="font-bold uppercase text-lg tracking-tight">{t("Scan QR")}</p>
                <p className="font-paragraph text-dark-brown/70 group-hover:text-milk/70 text-sm mt-1">{t("Scan table QR to order quickly")}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform shrink-0">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="dashboard-stagger-item">
            <Link href="/track" className="group bg-mid-brown hover:bg-dark-brown text-milk rounded-3xl p-5 md:p-6 shadow-[0_10px_28px_-10px_rgba(162,104,51,0.45)] transition-all flex items-center justify-between h-full active:scale-[0.99]">
              <div>
                <p className="font-bold uppercase text-lg tracking-tight">{t("Track Order")}</p>
                <p className="font-paragraph text-milk/60 text-sm mt-1">{t("Check real-time order status")}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform shrink-0">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Spending Insights */}
        <div className="dashboard-stagger-item mb-7 md:mb-10">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight mb-1.5">{t("Spending Insights") || "Spending Insights"}</h3>
          <p className="font-paragraph text-dark-brown/45 text-sm mb-4">{t("Your monthly trends") || "Your monthly trends"}</p>
          {spendingData.length === 0 ? (
            <div className="app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-8 md:p-12 text-center">
              <p className="text-4xl mb-3">📊</p>
              <p className="font-paragraph text-dark-brown/60 text-lg">{t("No spending data yet") || "No spending data yet"}</p>
              <p className="font-paragraph text-dark-brown/40 text-sm mt-1">{t("Complete an order to see your spending trends") || "Complete an order to see your spending trends"}</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-4 md:p-5">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1 uppercase tracking-wider">{t("Avg Monthly") || "Avg Monthly"}</p>
                  <p className="text-2xl md:text-3xl font-bold text-dark-brown">₱{spendingSummary?.avg_monthly?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}</p>
                </div>
                <div className="app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-4 md:p-5">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1 uppercase tracking-wider">{t("Months Active") || "Months Active"}</p>
                  <p className="text-2xl md:text-3xl font-bold text-dark-brown">{spendingSummary?.months_tracked || 0}</p>
                </div>
                <div className="app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-4 md:p-5">
                  <p className="font-paragraph text-dark-brown/50 text-xs mb-1 uppercase tracking-wider">{t("Top Month") || "Top Month"}</p>
                  <p className="text-2xl md:text-3xl font-bold text-dark-brown">{spendingSummary?.top_month?.month || "—"}</p>
                  {spendingSummary?.top_month && (
                    <p className="font-paragraph text-dark-brown/50 text-xs mt-0.5">₱{spendingSummary.top_month.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  )}
                </div>
              </div>

              {/* Chart */}
              <div className="app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-5 md:p-6">
                <h4 className="text-base font-bold text-dark-brown uppercase tracking-tight mb-4">{t("Monthly Spending") || "Monthly Spending"}</h4>
                <div className="h-64 min-h-[16rem] w-full">
                  {chartReady ? (
                    <ResponsiveContainer width="100%" height={256} minWidth={0}>
                      <BarChart data={spendingData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: chartTick }}
                        tickLine={false}
                        axisLine={false}
                        interval={spendingData.length > 6 ? Math.floor(spendingData.length / 6) : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: chartTick }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `₱${v}`}
                      />
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
                        labelFormatter={(label: any) => `${label}`}
                      />
                      <Bar 
                        dataKey="total" 
                        radius={[8, 8, 0, 0]} 
                        maxBarSize={48}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      >
                        {spendingData.map((entry, index) => {
                          const isTop = spendingSummary?.top_month?.month === entry.month;
                          return (
                            <Cell
                              key={index}
                              fill={isTop ? tc.yellowBrown : tc.midBrown}
                              stroke={isTop ? "#b8960f" : "none"}
                              strokeWidth={isTop ? 2 : 0}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-6 h-6 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-mid-brown"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-dark-brown/50">{t("Monthly") || "Monthly"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-yellow-brown"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-dark-brown/50">{t("Top Month") || "Top Month"}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Recent Orders */}
        <div className="dashboard-stagger-item">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight mb-1.5">{t("Recent Orders")}</h3>
          <p className="font-paragraph text-dark-brown/45 text-sm mb-4">{t("Your latest activity") || "Your latest activity"}</p>
          {orders.length === 0 ? (
            <div className="app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-8 md:p-12 text-center">
              <p className="text-5xl mb-4">🥤</p>
              <p className="font-paragraph text-dark-brown/60 text-lg">{t("No orders yet")}</p>
              <p className="font-paragraph text-dark-brown/40 text-sm mt-1">{t("Place your first order from the menu!")}</p>
              <Link href="/order" className="inline-block mt-6 bg-dark-brown hover:bg-dark-brown-hover text-milk uppercase font-bold text-sm rounded-full py-3 px-8 shadow-lg hover:shadow-xl transition-all">
                {t("Order Now")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {orders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((order) => (
                <div key={order.id} id={`receipt-${order.id}`} className="paginated-order app-panel border rounded-3xl shadow-[0_8px_28px_-12px_rgba(82,49,34,0.25)] p-5 md:p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-dark-brown uppercase tracking-tight text-sm">{order.id}</p>
                        {order.status !== "cancelled" && (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                              order.paymentStatus === "paid"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {order.paymentMethod ? `${order.paymentMethod} · ` : ""}
                            {order.paymentStatus === "paid" ? "paid" : "unpaid"}
                          </span>
                        )}
                      </div>
                      <p className="font-paragraph text-dark-brown/50 text-xs mt-0.5">{new Date(order.date).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 self-start md:self-auto">
                      {order.status === "pending" && (
                        <button
                          onClick={() => setCancelOrderId(order.id)}
                          data-html2canvas-ignore="true"
                          className="inline-flex items-center gap-1 bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-700 font-bold text-xs uppercase rounded-full py-1 px-3 transition-colors"
                          title={t("Cancel Order")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                          {t("Cancel")}
                        </button>
                      )}
                      {order.status === 'completed' && (
                        order.rating ? (
                          <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-200" title={`You rated this ${order.rating} stars`}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <svg key={star} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={star <= order.rating! ? "#eab308" : "none"} stroke={star <= order.rating! ? "#eab308" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => { setRateOrderId(order.id); setRatingValue(0); }}
                            data-html2canvas-ignore="true"
                            className="inline-flex items-center gap-1 bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-700 font-bold text-xs uppercase rounded-full py-1 px-3 transition-colors shadow-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            Rate
                          </button>
                        )
                      )}
                      <button
                        onClick={() => downloadReceipt(order)}
                        data-html2canvas-ignore="true"
                        className="inline-flex items-center gap-1 bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold text-xs uppercase rounded-full py-1 px-3 transition-colors"
                        title={t("Download Receipt")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        {t("Save")}
                      </button>
                      <button
                        onClick={() => deleteOrder(order.id)}
                        disabled={deletingOrderIds.includes(order.id)}
                        data-html2canvas-ignore="true"
                        className="inline-flex items-center gap-1 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk disabled:opacity-60 disabled:cursor-not-allowed font-bold text-xs uppercase rounded-full py-1 px-3 transition-colors"
                        title={t("Delete Order")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        {t("Delete")}
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-dark-brown/10">
                    {order.items.map((item) => (
                      <div key={item.name} className="flex justify-between items-start py-2">
                        <div className="flex items-start gap-3 flex-1 pr-4">
                          <span className="bg-dark-brown/10 text-dark-brown font-bold text-xs w-6 h-6 shrink-0 rounded-full flex items-center justify-center mt-0.5">{item.qty}</span>
                          <span className="font-paragraph text-dark-brown text-sm leading-tight">{item.name}</span>
                        </div>
                        <span className="font-paragraph text-dark-brown/70 text-sm shrink-0">₱{(item.price * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-dark-brown/10">
                    <span className="font-paragraph text-dark-brown/60 text-sm">{t("Total")}</span>
                    <span className="font-bold text-dark-brown text-lg">₱{order.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {Math.ceil(orders.length / ITEMS_PER_PAGE) > 1 && (
                <div className="flex items-center justify-between mt-4 px-2 col-span-full">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="bg-dark-brown/10 disabled:opacity-50 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs uppercase rounded-full py-2.5 px-6 transition-all duration-300 shadow-sm hover:shadow-md"
                  >
                    Prev
                  </button>
                  <span className="text-dark-brown font-bold text-sm">
                    Page {currentPage} of {Math.ceil(orders.length / ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(orders.length / ITEMS_PER_PAGE), p + 1))}
                    disabled={currentPage === Math.ceil(orders.length / ITEMS_PER_PAGE)}
                    className="bg-dark-brown/10 disabled:opacity-50 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs uppercase rounded-full py-2.5 px-6 transition-all duration-300 shadow-sm hover:shadow-md"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className="bg-white border-l-4 border-light-brown shadow-xl rounded-r-xl p-4 pr-10 flex flex-col relative">
            <button onClick={() => setToastMessage(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <span className="font-bold text-dark-brown text-sm">{toastMessage.title}</span>
            <span className="text-gray-600 text-xs mt-1">{toastMessage.desc}</span>
          </div>
        </div>
      )}

      {/* Top Drinks Modal Leaderboard */}
      {showTopDrinksModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-brown/60 backdrop-blur-sm transition-opacity" onClick={() => setShowTopDrinksModal(false)} />
          <div className="relative bg-milk border border-light-brown/20 shadow-2xl rounded-3xl w-full max-w-md overflow-hidden transform transition-all scale-100 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#d4af37]/20 to-[#e9d28c]/40 p-6 flex justify-between items-center border-b border-[#d4af37]/20 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-3xl drop-shadow-sm">👑</span>
                <h3 className="text-xl font-bold text-[#5c4205] uppercase tracking-wider">{t("Your Top Drinks")}</h3>
              </div>
              <button onClick={() => setShowTopDrinksModal(false)} className="bg-white/50 hover:bg-white text-dark-brown rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            {/* List */}
            <div className="p-6 overflow-y-auto w-full custom-scrollbar">
              {topDrinks.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {topDrinks.slice(0, 10).map((drink, index) => (
                    <div key={drink.name} className="flex items-center justify-between p-4 bg-white/60 rounded-2xl border border-light-brown/20 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border-2 shrink-0 ${
                          index === 0 ? 'bg-gradient-to-br from-[#d4af37] to-[#e9d28c] text-white border-[#d4af37]/30 shadow-md transform scale-110' :
                          index === 1 ? 'bg-gradient-to-br from-gray-400 to-gray-500 text-white border-gray-400/30' :
                          index === 2 ? 'bg-gradient-to-br from-[#cd7f32] to-[#b87333] text-white border-[#cd7f32]/30' :
                          'bg-dark-brown/5 text-dark-brown/50 border-transparent text-sm'
                        }`}>
                          #{index + 1}
                        </div>
                        <span className="font-bold text-dark-brown text-base leading-tight">{drink.name}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0 pl-3">
                        <span className="font-bold text-dark-brown text-lg leading-none">{drink.count}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#5c4205] mt-1">{t("Orders")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                 <p className="text-center font-paragraph text-dark-brown/60 py-10">{t("Start ordering your favorites to see them here!")}</p>
              )}
            </div>
            <div className="bg-light-brown/10 p-4 border-t border-light-brown/20 text-center shrink-0">
              <p className="text-xs text-dark-brown/50 font-bold uppercase tracking-widest">{t("Generation Bread Hall of Fame")}</p>
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
            
            <div className="flex justify-center gap-2 mb-6" onMouseLeave={() => {
              const stars = document.querySelectorAll('.star-btn');
              stars.forEach((star, idx) => {
                if (idx < ratingValue) {
                  star.classList.add("text-yellow-400", "fill-yellow-400");
                } else {
                  star.classList.remove("text-yellow-400", "fill-yellow-400");
                }
              });
            }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRatingValue(star)}
                  onMouseEnter={() => {
                    const stars = document.querySelectorAll('.star-btn');
                    stars.forEach((s, idx) => {
                      if (idx < star) {
                        s.classList.add("text-yellow-400", "fill-yellow-400");
                      } else {
                        s.classList.remove("text-yellow-400", "fill-yellow-400");
                      }
                    });
                  }}
                  className={`star-btn transition-all duration-200 hover:scale-110 focus:outline-none ${star <= ratingValue ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill={star <= ratingValue ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                </button>
              ))}
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
    </div>
    ) : null}
    </PageIntro>
  );
}
