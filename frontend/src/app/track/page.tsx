"use client";

import React, { Suspense, useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  fetchOrderEta,
  localFallbackEta,
  type SmartEta,
} from "@/lib/smartEta";
import { GB_EASE } from "@/lib/motion";
import OrderProgress from "@/components/OrderProgress";
import QueuePositionCard from "@/components/QueuePositionCard";
import { authFetch, getAccessToken, withWsToken } from "@/lib/authHeaders";
import BrandLogo from "@/components/BrandLogo";
import { notifyOrderReady } from "@/lib/orderReadyAlerts";
import { getMenuItemImage } from "@/constants";
import ProductLightbox from "@/components/ProductLightbox";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import { unwrapListResponse } from "@/lib/apiList";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface OrderItem {
  name: string;
  price: number;
  qty: number;
}

interface TrackedOrder {
  id: string;
  items: OrderItem[];
  total: number;
  totalItems: number;
  date: string;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  userName: string;
  orderType?: string;
  tableNumber?: string | null;
  paymentMethod?: string;
  paymentStatus?: "unpaid" | "paid" | "";
}

function TrackPageContent() {
  const { isLoggedIn, isAuthLoading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [orderIdInput, setOrderIdInput] = useState("");
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ title: string; desc: string } | null>(null);
  const [orderEta, setOrderEta] = useState<SmartEta | null>(null);
  const [recentOrdersList, setRecentOrdersList] = useState<TrackedOrder[]>([]);
  const [previewProduct, setPreviewProduct] = useState<{ src: string; alt: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const trackedOrderRef = useRef<TrackedOrder | null>(null);
  trackedOrderRef.current = trackedOrder;

  const refreshOrderEta = useCallback(async (
    orderLabel: string,
    status: TrackedOrder["status"],
    totalItems: number
  ) => {
    if (status === "cancelled") {
      setOrderEta(null);
      return;
    }

    const numericPart = orderLabel.replace("ORD-", "");
    const numericId = parseInt(numericPart, 10);
    if (Number.isNaN(numericId)) {
      setOrderEta(localFallbackEta(totalItems));
      return;
    }

    const eta = await fetchOrderEta(numericId);
    setOrderEta(eta || localFallbackEta(totalItems));
  }, []);

  const fetchOrder = useCallback(async (rawId: string) => {
    setLoading(true);
    setError("");
    setTrackedOrder(null);
    setOrderEta(null);

    const cleanId = rawId.trim().toUpperCase();

    try {
      const numericPart = cleanId.replace("ORD-", "");
      const numericId = parseInt(numericPart, 10);
      if (!Number.isNaN(numericId)) {
        const res = await authFetch(`${API_BASE_URL}/api/auth/orders/${numericId}/`);
        if (res.ok) {
          const d = await res.json();
          const order: TrackedOrder = {
            id: `ORD-${d.id.toString().padStart(4, "0")}`,
            items: d.items.map((i: { name: string; price: string | number; quantity: number }) => ({
              name: i.name,
              price: Number(i.price),
              qty: i.quantity,
            })),
            total: Number(d.total_price),
            totalItems: d.items.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0),
            date: d.created_at,
            status: d.status,
            userName: d.user_name || "Customer",
            orderType: d.order_type || "takeout",
            tableNumber: d.table_number || null,
            paymentMethod: d.payment_method || "",
            paymentStatus: d.payment_status || "unpaid",
          };
          // Check if order was claimed locally
          const userEmail = (typeof window !== "undefined" && localStorage.getItem("spylt_user"))
            ? JSON.parse(localStorage.getItem("spylt_user") || "{}").email
            : "";
          if (userEmail) {
            const claimedKey = `spylt_claimed_orders_${userEmail}`;
            const claimedRaw = localStorage.getItem(claimedKey);
            const claimedIds: string[] = claimedRaw ? JSON.parse(claimedRaw) : [];
            if (claimedIds.includes(order.id)) {
              order.status = "completed";
            }
          }

          setTrackedOrder(order);
          if (d.eta) {
            setOrderEta(d.eta as SmartEta);
          } else {
            void refreshOrderEta(order.id, order.status, order.totalItems);
          }
          setLoading(false);
          return;
        }
      }
    } catch {
      // fallback to local
    }

    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const found = localOrders.find(
          (o: { id: string }) => o.id === cleanId || o.id === rawId
        );
        if (found) {
          const tracked = found as TrackedOrder;
          const userEmail = (typeof window !== "undefined" && localStorage.getItem("spylt_user"))
            ? JSON.parse(localStorage.getItem("spylt_user") || "{}").email
            : "";
          if (userEmail) {
            const claimedKey = `spylt_claimed_orders_${userEmail}`;
            const claimedRaw = localStorage.getItem(claimedKey);
            const claimedIds: string[] = claimedRaw ? JSON.parse(claimedRaw) : [];
            if (claimedIds.includes(tracked.id)) {
              tracked.status = "completed";
            }
          }
          setTrackedOrder(tracked);
          setOrderEta(localFallbackEta(tracked.totalItems));
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }

    setError(`Order "${cleanId}" not found. Please check the order ID and try again.`);
    setLoading(false);
  }, [refreshOrderEta]);

  // Set mounted
  useEffect(() => { setMounted(true); }, []);

  // Read order ID from URL params or load recent orders
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setOrderIdInput(id);
      void fetchOrder(id);
    }
  }, [searchParams, fetchOrder]);

  // Load user's recent orders for quick selection
  useEffect(() => {
    if (!user?.email) return;
    const loadRecentOrders = async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/auth/orders/`);
        if (res.ok) {
          const raw = await res.json();
          const list = unwrapListResponse<any>(raw);
          if (Array.isArray(list)) {
            const mapped: TrackedOrder[] = list.map((d: any) => ({
              id: `ORD-${d.id.toString().padStart(4, "0")}`,
              items: (d.items || []).map((i: any) => ({
                name: i.name,
                price: Number(i.price),
                qty: i.quantity,
              })),
              total: Number(d.total_price),
              totalItems: (d.items || []).reduce((sum: number, i: any) => sum + (i.quantity || 1), 0),
              date: d.created_at,
              status: d.status,
              userName: d.user_name || "Customer",
              orderType: d.order_type || "takeout",
              tableNumber: d.table_number || null,
              paymentMethod: d.payment_method || "",
              paymentStatus: d.payment_status || "unpaid",
            }));
            setRecentOrdersList(mapped);
            return;
          }
        }
      } catch {}

      try {
        const local = localStorage.getItem("spylt_local_orders");
        if (local) {
          setRecentOrdersList(JSON.parse(local));
        }
      } catch {}
    };

    void loadRecentOrders();
  }, [user?.email]);

  // Redirect if not logged in
  useEffect(() => {
    if (mounted && !isAuthLoading && !isLoggedIn) {
      router.push("/login");
    }
  }, [mounted, isAuthLoading, isLoggedIn, router]);

  // Realtime updates: global order events + local WS + HTTP poll (mobile-safe)
  useEffect(() => {
    if (!user?.email) return;

    const applyStatus = (
      orderId: number,
      newStatus: TrackedOrder["status"],
      extras?: Partial<TrackedOrder>
    ) => {
      const current = trackedOrderRef.current;
      if (!current) return;
      const orderIdFormatted = `ORD-${orderId.toString().padStart(4, "0")}`;
      if (orderIdFormatted !== current.id) return;

      const prevStatus = current.status;
      setTrackedOrder((prev) => (prev ? { ...prev, status: newStatus, ...extras } : prev));
      void refreshOrderEta(orderIdFormatted, newStatus, current.totalItems);
      void notifyOrderReady(orderId, newStatus);
      if (newStatus === "completed" && prevStatus !== "completed") {
        window.dispatchEvent(
          new CustomEvent("gb:order-completed", {
            detail: { orderId, orderLabel: orderIdFormatted },
          })
        );
      }
      setToast({
        title: "Order Updated",
        desc: `Your order is now ${newStatus.toUpperCase()}`,
      });
    };

    const onGlobal = (event: Event) => {
      const data = (event as CustomEvent).detail as {
        type?: string;
        order_id?: number;
        status?: string;
        payment_method?: string;
        payment_status?: string;
      };
      if (!data?.order_id) return;
      if (data.type === "order_payment_update") {
        const current = trackedOrderRef.current;
        if (!current) return;
        const orderIdFormatted = `ORD-${data.order_id.toString().padStart(4, "0")}`;
        if (orderIdFormatted !== current.id) return;
        setTrackedOrder((prev) =>
          prev
            ? {
                ...prev,
                paymentMethod: data.payment_method || prev.paymentMethod,
                paymentStatus: (data.payment_status as TrackedOrder["paymentStatus"]) || prev.paymentStatus,
              }
            : prev
        );
        if (data.payment_status === "paid") {
          setToast({
            title: "Payment Confirmed",
            desc: "Your payment is marked as paid",
          });
        }
        return;
      }
      if (data.type === "order_status_update" && data.status) {
        applyStatus(data.order_id, data.status as TrackedOrder["status"]);
      }
    };

    window.addEventListener("gb:order-status", onGlobal as EventListener);

    let ws: WebSocket | null = null;
    if (getAccessToken()) {
      const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
      const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
      const wsUrl = withWsToken(
        `${wsProtocol}${wsHost}/ws/orders/${encodeURIComponent(user.email)}/`
      );
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "order_payment_update") {
            onGlobal(new CustomEvent("gb:order-status", { detail: data }));
            return;
          }
          if (data.type === "order_status_update") {
            applyStatus(data.order_id, data.status);
          }
        } catch {
          /* ignore */
        }
      };
    }

    const pollId = window.setInterval(() => {
      const current = trackedOrderRef.current;
      if (!current) return;
      if (["cancelled", "completed"].includes(current.status)) return;
      void fetchOrder(current.id);
    }, 8000);

    return () => {
      window.removeEventListener("gb:order-status", onGlobal as EventListener);
      window.clearInterval(pollId);
      if (!ws) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws?.close();
        return;
      }
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [user?.email, refreshOrderEta, fetchOrder]);

  const handleCompletePickup = async () => {
    if (!trackedOrder || trackedOrder.status !== "ready") return;
    const numericPart = trackedOrder.id.replace("ORD-", "");
    const numericId = parseInt(numericPart, 10);

    setTrackedOrder((prev) => (prev ? { ...prev, status: "completed" } : null));

    // Update local storage
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const updated = localOrders.map((o: any) =>
          o.id === trackedOrder.id ? { ...o, status: "completed" } : o
        );
        localStorage.setItem("spylt_local_orders", JSON.stringify(updated));
      }
    } catch {}

    // Persist claimed order ID so refresh will NEVER resurrect it as ready
    const userEmail = (typeof window !== "undefined" && localStorage.getItem("spylt_user"))
      ? JSON.parse(localStorage.getItem("spylt_user") || "{}").email
      : (user?.email || "");
    if (userEmail) {
      try {
        const claimedKey = `spylt_claimed_orders_${userEmail}`;
        const claimedRaw = localStorage.getItem(claimedKey);
        const claimedIds: string[] = claimedRaw ? JSON.parse(claimedRaw) : [];
        if (!claimedIds.includes(trackedOrder.id)) {
          claimedIds.push(trackedOrder.id);
          localStorage.setItem(claimedKey, JSON.stringify(claimedIds));
        }
      } catch {}
    }

    if (!Number.isNaN(numericId)) {
      try {
        await authFetch(`${API_BASE_URL}/api/auth/orders/${numericId}/complete/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail }),
        });
      } catch {}
    }

    setToast({
      title: "Order Completed! 🎉",
      desc: "Thank you for picking up your order. Enjoy your fresh bakes!",
    });
  };

  // Refresh smart ETA while order is still in progress
  useEffect(() => {
    if (!trackedOrder) return;
    if (["cancelled", "completed", "ready"].includes(trackedOrder.status)) return;

    const interval = setInterval(() => {
      void refreshOrderEta(trackedOrder.id, trackedOrder.status, trackedOrder.totalItems);
    }, 15000);

    return () => clearInterval(interval);
  }, [trackedOrder, refreshOrderEta]);

  // Toast slide-in when status updates
  useGSAP(
    () => {
      if (!toast || !toastRef.current) return;
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.fromTo(
        toastRef.current,
        { autoAlpha: 0, y: 24, scale: 0.96 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: prefersReduced ? 0.01 : 0.45,
          ease: GB_EASE.out,
        }
      );
    },
    { dependencies: [toast] }
  );

  // GSAP entrance animation for the whole page
  useGSAP(
    () => {
      if (!mounted || isAuthLoading || !isLoggedIn) return;
      const hero = containerRef.current?.querySelector(".track-hero");
      const search = containerRef.current?.querySelector(".track-search");
      if (hero) {
        gsap.fromTo(
          hero,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.6, ease: GB_EASE.out }
        );
      }
      if (search) {
        gsap.fromTo(
          search,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.5, ease: GB_EASE.out, delay: 0.1 }
        );
      }
    },
    { dependencies: [mounted, isAuthLoading, isLoggedIn], scope: containerRef }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderIdInput.trim()) {
      fetchOrder(orderIdInput);
    }
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!mounted || isAuthLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  const isCancelled = trackedOrder?.status === "cancelled";

  return (
    <div ref={containerRef} className="min-h-screen app-canvas relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20" />

      {/* Header */}
      <div className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="shrink-0">
              <BrandLogo
                className="h-7 w-auto sm:h-8 md:h-10 cursor-pointer hover:scale-105 transition-transform drop-shadow-lg"
              />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight hidden sm:block">Track Order</h1>
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 md:px-10 py-6 sm:py-8 md:py-12 relative z-10">
        {/* Hero */}
        <div className="track-hero text-center mb-6 sm:mb-8">
          <div className="mb-3 inline-flex max-w-full items-center gap-1.5 sm:gap-2 rounded-full border border-dark-brown/15 bg-milk/90 px-3 py-1 sm:px-3.5 sm:py-1.5 shadow-2xs">
            <span className="text-xs shrink-0">🥐</span>
            <span className="truncate font-paragraph text-[0.62rem] sm:text-[0.7rem] font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-dark-brown/70">
              Generation Bread · Live Kitchen Tracker
            </span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-dark-brown uppercase tracking-tight leading-tight">
            Track Your Order
          </h2>
          <p className="font-paragraph text-dark-brown/60 mt-1.5 sm:mt-2 text-xs sm:text-sm md:text-base max-w-md mx-auto">
            Check kitchen queue, live preparation progress, and pickup ready alerts.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="track-search mb-4">
          <div className="flex gap-2 sm:gap-3 items-center">
            <div className="flex-1 relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-dark-brown/40"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                placeholder="Order ID (e.g. ORD-0042)"
                className="w-full bg-milk/90 backdrop-blur-md border border-dark-brown/20 rounded-full py-3 sm:py-3.5 pl-9 sm:pl-11 pr-8 sm:pr-10 text-dark-brown font-paragraph text-xs sm:text-sm uppercase placeholder:normal-case placeholder:text-dark-brown/40 focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30 shadow-2xs transition-all"
              />
              {orderIdInput && (
                <button
                  type="button"
                  onClick={() => { setOrderIdInput(""); setTrackedOrder(null); setError(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-dark-brown/10 text-dark-brown/60 hover:bg-dark-brown hover:text-milk flex items-center justify-center text-[10px] sm:text-xs transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !orderIdInput.trim()}
              className="bg-dark-brown hover:bg-dark-brown-hover text-milk uppercase font-bold text-xs sm:text-sm rounded-full py-3 sm:py-3.5 px-5 sm:px-7 md:px-8 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shrink-0"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-milk/30 border-t-milk rounded-full animate-spin" />
              ) : (
                <>
                  <span>Track</span>
                  <span className="hidden xs:inline sm:inline">→</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Select Recent Orders Pills */}
        {recentOrdersList.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <span className="font-paragraph text-[11px] font-bold uppercase tracking-wider text-dark-brown/45 mr-1">
              Your Orders:
            </span>
            {recentOrdersList.slice(0, 4).map((o) => {
              const isSelected = trackedOrder?.id === o.id;
              const statusColor = o.status === "ready"
                ? "text-emerald-700 bg-emerald-100"
                : o.status === "completed"
                ? "text-dark-brown/60 bg-dark-brown/10"
                : "text-amber-800 bg-amber-100";
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOrderIdInput(o.id);
                    void fetchOrder(o.id);
                  }}
                  className={`group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-all shadow-2xs ${
                    isSelected
                      ? "bg-dark-brown text-milk shadow-sm scale-[1.02]"
                      : "border border-dark-brown/15 bg-milk/90 text-dark-brown hover:bg-dark-brown hover:text-milk hover:border-dark-brown"
                  }`}
                >
                  <span>{o.id}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${statusColor}`}>
                    {o.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-brown/10 border border-red-brown/20 rounded-2xl p-4 mb-6 text-center">
            <p className="text-red-brown font-paragraph text-sm">{error}</p>
          </div>
        )}

        {/* Order found */}
        {trackedOrder && (
          <div className="space-y-6">
            {/* 1 — Order progress */}
            <OrderProgress
              status={trackedOrder.status}
              orderType={trackedOrder.orderType}
              tableNumber={trackedOrder.tableNumber}
            />

            {/* Ready for Pickup Action Banner */}
            {trackedOrder.status === "ready" && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-light-brown/40 bg-dark-brown p-5 text-milk shadow-xl animate-fade-in">
                <div className="flex items-center gap-3">
                  <span className="flex h-3.5 w-3.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <p className="font-bold text-base uppercase tracking-tight text-milk">
                      Order is Ready for Pickup!
                    </p>
                    <p className="font-paragraph text-xs text-milk/70 mt-0.5">
                      Please proceed to the counter to collect your fresh bakes.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCompletePickup}
                  className="shrink-0 w-full sm:w-auto rounded-full bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 font-bold text-xs uppercase tracking-wider text-white transition-all active:scale-95 shadow-md"
                >
                  ✓ I&apos;ve Picked This Up
                </button>
              </div>
            )}

            {/* 2 — Queue position + Smart ETA */}
            {!isCancelled && orderEta && (
              <QueuePositionCard eta={orderEta} />
            )}

            {/* 3 — Order summary */}
            <div className="rounded-3xl border border-dark-brown/12 bg-milk/80 p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-dark-brown/10">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-dark-brown uppercase tracking-tight text-base">{trackedOrder.id}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        isCancelled
                          ? "bg-red-100 text-red-700"
                          : trackedOrder.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : trackedOrder.status === "ready"
                              ? "bg-emerald-500 text-white animate-pulse"
                              : trackedOrder.status === "preparing"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-dark-brown/10 text-dark-brown"
                      }`}
                    >
                      {trackedOrder.status}
                    </span>
                  </div>
                  <p className="font-paragraph text-dark-brown/50 text-xs mt-1">
                    {new Date(trackedOrder.date).toLocaleString()} · {trackedOrder.orderType?.toUpperCase()}
                    {trackedOrder.tableNumber ? ` · Table ${trackedOrder.tableNumber}` : ""}
                  </p>
                </div>

                {trackedOrder.paymentMethod && (
                  <span className={`self-start sm:self-auto rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    trackedOrder.paymentStatus === "paid"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-amber-300 bg-amber-50 text-amber-800"
                  }`}>
                    {trackedOrder.paymentMethod} {trackedOrder.paymentStatus === "paid" ? "· Paid" : "· Unpaid"}
                  </span>
                )}
              </div>

              {/* Items List */}
              <div className="divide-y divide-dark-brown/8">
                {trackedOrder.items.map((item) => {
                  const itemImg = getMenuItemImage(item.name);
                  const matchOptions = item.name.match(/^(.*?)\s*\((.*?)\)$/);
                  const baseName = matchOptions ? matchOptions[1] : item.name;
                  const optionsStr = matchOptions ? matchOptions[2] : null;

                  return (
                    <div key={item.name} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-dark-brown/15 bg-milk cursor-zoom-in transition-transform hover:scale-105 shadow-inner"
                          onClick={() => setPreviewProduct({ src: itemImg, alt: item.name })}
                          title={`View ${item.name}`}
                        >
                          <Image
                            src={itemImg}
                            alt={item.name}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="shrink-0 rounded-md bg-dark-brown/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-dark-brown/70">
                              {item.qty}×
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-paragraph text-sm font-bold text-dark-brown">
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

              <div className="mt-4 flex items-center justify-between border-t border-dark-brown/10 pt-3.5">
                <span className="font-paragraph text-xs font-semibold uppercase tracking-wider text-dark-brown/50">
                  {trackedOrder.items.reduce((acc, i) => acc + i.qty, 0)} {trackedOrder.items.reduce((acc, i) => acc + i.qty, 0) === 1 ? "Item" : "Items"} · Total
                </span>
                <span className="text-xl font-bold tabular-nums text-dark-brown">
                  ₱{trackedOrder.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!trackedOrder && !loading && !error && (
          <div className="rounded-3xl border border-dark-brown/12 bg-milk/80 p-6 sm:p-10 text-center shadow-sm backdrop-blur-sm">
            {/* Bakery Croissant Icon */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-light-brown/20 border border-light-brown/30 shadow-inner text-[#0f766e]">
              <CroissantLogoIcon className="w-9 h-9" />
            </div>
            <h3 className="text-xl font-bold uppercase tracking-tight text-dark-brown">
              Track Your Fresh Bakes
            </h3>
            <p className="mx-auto mt-2 max-w-md font-paragraph text-sm leading-relaxed text-dark-brown/60">
              Enter your Order ID (like <strong className="text-dark-brown">ORD-0042</strong>) above or choose one of your recent orders below to view live kitchen updates.
            </p>

            {/* If user has recent orders, display a clickable list */}
            {recentOrdersList.length > 0 && (
              <div className="mt-6 text-left border-t border-dark-brown/10 pt-5">
                <p className="font-paragraph text-xs font-bold uppercase tracking-wider text-dark-brown/45 mb-3">
                  Recent Orders on this device:
                </p>
                <div className="space-y-2.5">
                  {recentOrdersList.slice(0, 3).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setOrderIdInput(o.id);
                        void fetchOrder(o.id);
                      }}
                      className="group flex w-full items-center justify-between rounded-2xl border border-dark-brown/10 bg-white/70 p-3.5 text-left shadow-2xs transition-all hover:bg-white hover:border-dark-brown/30 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-dark-brown/10 bg-milk">
                          <Image
                            src={getMenuItemImage(o.items[0]?.name || "")}
                            alt={o.items[0]?.name || "Order Item"}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-dark-brown text-sm uppercase">{o.id}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                              o.status === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-dark-brown/10 text-dark-brown/70"
                            }`}>
                              {o.status}
                            </span>
                          </div>
                          <p className="truncate font-paragraph text-xs text-dark-brown/60 mt-0.5">
                            {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 pl-3">
                        <span className="font-bold text-dark-brown text-sm tabular-nums">₱{o.total.toFixed(2)}</span>
                        <span className="text-xs text-dark-brown/40 group-hover:text-dark-brown group-hover:translate-x-0.5 transition-all">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-dark-brown/15 bg-white/80 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-dark-brown shadow-xs transition-all hover:bg-dark-brown hover:text-milk"
              >
                <span>View Dashboard</span>
              </Link>
              <Link
                href="/order"
                className="inline-flex items-center gap-2 rounded-full bg-dark-brown px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-milk shadow-xs transition-all hover:bg-dark-brown-hover hover:scale-105 active:scale-95"
              >
                <span>Order Fresh Bakes</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox modal for zooming item images */}
      <ProductLightbox
        open={Boolean(previewProduct)}
        src={previewProduct?.src || ""}
        alt={previewProduct?.alt || ""}
        onClose={() => setPreviewProduct(null)}
      />

      {/* Toast Notification */}
      {toast && (
        <div ref={toastRef} className="fixed bottom-6 right-6 z-50">
          <div className="bg-white border-l-4 border-light-brown shadow-xl rounded-r-xl p-4 pr-10 flex flex-col relative">
            <button onClick={() => setToast(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <span className="font-bold text-dark-brown text-sm">{toast.title}</span>
            <span className="font-paragraph text-dark-brown/60 text-xs mt-0.5">{toast.desc}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    }>
      <TrackPageContent />
    </Suspense>
  );
}
