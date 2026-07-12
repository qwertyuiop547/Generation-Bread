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
  formatSmartEtaDisplay,
  localFallbackEta,
  type SmartEta,
} from "@/lib/smartEta";
import { GB_EASE } from "@/lib/motion";
import OrderProgress from "@/components/OrderProgress";
import { withWsToken } from "@/lib/authHeaders";
import BrandLogo from "@/components/BrandLogo";

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
        const res = await fetch(`${API_BASE_URL}/api/auth/orders/${numericId}/`);
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

  // Read order ID from URL params
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setOrderIdInput(id);
      void fetchOrder(id);
    }
  }, [searchParams, fetchOrder]);

  // Redirect if not logged in
  useEffect(() => {
    if (mounted && !isAuthLoading && !isLoggedIn) {
      router.push("/login");
    }
  }, [mounted, isAuthLoading, isLoggedIn, router]);

  // WebSocket for real-time updates (status changes from staff/admin)
  useEffect(() => {
    if (!user?.email) return;

    const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
    const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
    const wsUrl = withWsToken(`${wsProtocol}${wsHost}/ws/orders/${user.email}/`);

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const current = trackedOrderRef.current;
      if (!current) return;

      const orderIdFormatted = `ORD-${data.order_id.toString().padStart(4, "0")}`;
      if (orderIdFormatted !== current.id) return;

      if (data.type === "order_payment_update") {
        setTrackedOrder((prev) =>
          prev
            ? {
                ...prev,
                paymentMethod: data.payment_method || prev.paymentMethod,
                paymentStatus: data.payment_status || prev.paymentStatus,
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

      if (data.type !== "order_status_update") return;

      const newStatus = data.status as TrackedOrder["status"];
      setTrackedOrder((prev) => (prev ? { ...prev, status: newStatus } : prev));
      void refreshOrderEta(orderIdFormatted, newStatus, current.totalItems);
      setToast({
        title: "Order Updated",
        desc: `Your order is now ${newStatus.toUpperCase()}`,
      });
    };

    return () => ws.close();
  }, [user?.email, refreshOrderEta]);

  // Refresh smart ETA while order is still in progress
  useEffect(() => {
    if (!trackedOrder) return;
    if (["cancelled", "completed", "ready"].includes(trackedOrder.status)) return;

    const interval = setInterval(() => {
      void refreshOrderEta(trackedOrder.id, trackedOrder.status, trackedOrder.totalItems);
    }, 30000);

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
  useGSAP(() => {
    if (!mounted) return;
    gsap.fromTo(
      ".track-hero",
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 0.7, ease: GB_EASE.out }
    );
    gsap.fromTo(
      ".track-search",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: GB_EASE.out, delay: 0.12 }
    );
  }, [mounted]);

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
      <div className="min-h-screen bg-milk flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  const isCancelled = trackedOrder?.status === "cancelled";

  return (
    <div className="min-h-screen bg-milk relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20" />

      {/* Header */}
      <div className="sticky top-0 z-40 bg-milk/80 backdrop-blur-xl border-b border-dark-brown/10">
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

      <div className="max-w-2xl mx-auto px-5 md:px-10 py-8 md:py-12 relative z-10">
        {/* Hero */}
        <div className="track-hero text-center mb-8 md:mb-10">
          <h2 className="text-3xl md:text-5xl font-bold text-dark-brown uppercase tracking-tighter">
            Track Your Order
          </h2>
          <p className="font-paragraph text-dark-brown/60 mt-2 text-sm md:text-base">
            Enter your order ID to see real-time status updates
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="track-search flex gap-3 mb-8 md:mb-10">
          <div className="flex-1 relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-brown/40"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
              placeholder="Enter Order ID (e.g. ORD-0001)"
              className="w-full bg-white/60 backdrop-blur-sm border border-dark-brown/15 rounded-2xl py-3.5 pl-12 pr-4 text-dark-brown font-paragraph text-sm md:text-base placeholder:text-dark-brown/30 focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-dark-brown hover:bg-[#3a2218] text-milk uppercase font-bold text-sm rounded-2xl px-6 md:px-8 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-milk/30 border-t-milk rounded-full animate-spin" />
            ) : (
              "Track"
            )}
          </button>
        </form>

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

            {/* 2 — Smart ETA */}
            {!isCancelled && orderEta && (
              <div className="bg-gradient-to-r from-light-brown/20 to-[#d4af37]/10 border border-light-brown/30 rounded-3xl p-5 md:p-6 shadow-md">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-dark-brown/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#523122" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/50 mb-1">Smart ETA</p>
                    <p className="text-2xl md:text-3xl font-bold text-dark-brown tracking-tight">
                      {formatSmartEtaDisplay(orderEta)}
                    </p>
                    <p className="font-paragraph text-dark-brown/60 text-sm mt-1">{orderEta.message}</p>
                    {orderEta.queue_ahead > 0 && trackedOrder.status === "pending" && (
                      <p className="font-paragraph text-dark-brown/45 text-xs mt-2">
                        Updates automatically as your order moves through the queue.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3 — Order summary */}
            <div className="bg-white/50 backdrop-blur-sm border border-white/60 rounded-3xl p-5 md:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-dark-brown uppercase tracking-tight text-sm">{trackedOrder.id}</p>
                  <p className="font-paragraph text-dark-brown/50 text-xs mt-0.5">
                    {new Date(trackedOrder.date).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    isCancelled
                      ? "bg-red-100 text-red-700"
                      : trackedOrder.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : trackedOrder.status === "ready"
                          ? "bg-blue-100 text-blue-700"
                          : trackedOrder.status === "preparing"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {trackedOrder.status}
                </span>
              </div>
              <div className="divide-y divide-dark-brown/10">
                {trackedOrder.items.map((item) => (
                  <div key={item.name} className="flex justify-between items-start py-2">
                    <div className="flex items-start gap-3 flex-1 pr-4">
                      <span className="bg-dark-brown/10 text-dark-brown font-bold text-xs w-6 h-6 shrink-0 rounded-full flex items-center justify-center mt-0.5">
                        {item.qty}
                      </span>
                      <span className="font-paragraph text-dark-brown text-sm leading-tight">{item.name}</span>
                    </div>
                    <span className="font-paragraph text-dark-brown/70 text-sm shrink-0">
                      ₱{(item.price * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-dark-brown/10">
                <span className="font-paragraph text-dark-brown/60 text-sm">Total</span>
                <span className="font-bold text-dark-brown text-lg">₱{trackedOrder.total.toFixed(2)}</span>
              </div>
              {trackedOrder.paymentMethod && (
                <div className={`mt-4 rounded-2xl border px-4 py-3 ${
                  trackedOrder.paymentStatus === "paid"
                    ? "border-emerald-200 bg-emerald-50/80"
                    : "border-amber-200 bg-amber-50/70"
                }`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/45">Payment</p>
                  <p className="font-bold text-dark-brown text-sm uppercase mt-0.5">
                    {trackedOrder.paymentMethod}
                    <span className={`ml-2 font-paragraph text-xs normal-case ${
                      trackedOrder.paymentStatus === "paid" ? "text-emerald-700 font-bold" : "text-amber-700"
                    }`}>
                      {trackedOrder.paymentStatus === "paid" ? "· paid" : "· unpaid (counter)"}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!trackedOrder && !loading && !error && (
          <div className="bg-white/50 backdrop-blur-sm border border-white/60 rounded-3xl p-8 md:p-12 text-center shadow-lg">
            <div className="text-5xl mb-4">📦</div>
            <p className="font-paragraph text-dark-brown/60 text-lg">Enter an order ID to track</p>
            <p className="font-paragraph text-dark-brown/40 text-sm mt-1">
              You can find your order ID on your receipt or dashboard
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-6 bg-dark-brown hover:bg-[#3a2218] text-milk uppercase font-bold text-sm rounded-full py-3 px-8 shadow-lg hover:shadow-xl transition-all"
            >
              View My Orders
            </Link>
          </div>
        )}
      </div>

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
      <div className="min-h-screen bg-milk flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    }>
      <TrackPageContent />
    </Suspense>
  );
}
