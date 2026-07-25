"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useAuth } from "@/context/AuthContext";

gsap.registerPlugin(useGSAP);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface Notification {
  id: string;
  type: "new_order" | "cancel_order" | "low_stock" | "ai_warning" | "forecast_ready";
  title: string;
  message: string;
  time: string;
  read: boolean;
  extra_data?: { order_id?: string; cancel_reason?: string };
}

const typeConfig: Record<Notification["type"], { icon: string; color: string; bg: string }> = {
  new_order: { icon: "🛒", color: "text-blue-700", bg: "bg-blue-100" },
  cancel_order: { icon: "🚫", color: "text-red-700", bg: "bg-red-100" },
  low_stock: { icon: "⚠️", color: "text-yellow-700", bg: "bg-yellow-100" },
  ai_warning: { icon: "🤖", color: "text-red-700", bg: "bg-red-100" },
  forecast_ready: { icon: "📈", color: "text-green-700", bg: "bg-green-100" },
};

export default function NotificationBell({ userEmail }: { userEmail?: string }) {
  const router = useRouter();
  const { accessToken, apiFetch, isAuthLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("spylt_dismissed_notifs");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    }
    return new Set();
  });
  const [open, setOpen] = useState(false);
  const [viewReasonData, setViewReasonData] = useState<{ orderId: string; reason: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const authFailedRef = useRef(false);

  const activeNotifications = notifications.filter((n) => !dismissed.has(n.id));
  const unreadCount = activeNotifications.length;

  const { contextSafe } = useGSAP({ scope: rootRef });

  const closePanel = contextSafe(() => {
    if (!open || closingRef.current) return;
    closingRef.current = true;

    const panel = dropdownRef.current;
    const backdrop = backdropRef.current;
    if (!panel) {
      setOpen(false);
      closingRef.current = false;
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        setOpen(false);
        closingRef.current = false;
      },
    });

    if (backdrop) {
      tl.to(backdrop, { opacity: 0, duration: 0.15, ease: "power1.in" }, 0);
    }
    tl.to(
      panel,
      {
        opacity: 0,
        y: -10,
        scale: 0.96,
        duration: 0.2,
        ease: "power2.in",
      },
      0
    );
  });

  useGSAP(
    () => {
      if (!open) return;
      closingRef.current = false;

      const panel = dropdownRef.current;
      const backdrop = backdropRef.current;
      if (!panel) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReduced) {
        gsap.set(panel, { opacity: 1, y: 0, scale: 1 });
        if (backdrop) gsap.set(backdrop, { opacity: 1 });
        return;
      }

      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      gsap.set(panel, {
        opacity: 0,
        y: -14,
        scale: 0.94,
        transformOrigin: isMobile ? "top center" : "top right",
      });
      if (backdrop) gsap.set(backdrop, { opacity: 0 });

      const items = panel.querySelectorAll(".notif-item, .notif-empty");
      gsap.set(items, { opacity: 0, y: 10 });

      const tl = gsap.timeline();
      if (backdrop) {
        tl.to(backdrop, { opacity: 1, duration: 0.22, ease: "power1.out" }, 0);
      }
      tl.to(
        panel,
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4,
          ease: "back.out(1.5)",
        },
        0
      );
      tl.to(
        items,
        {
          opacity: 1,
          y: 0,
          duration: 0.28,
          stagger: 0.045,
          ease: "power2.out",
        },
        0.1
      );
    },
    { dependencies: [open], scope: rootRef }
  );

  useEffect(() => {
    if (!userEmail || isAuthLoading || !accessToken) return;
    authFailedRef.current = false;

    const fetchNotifs = async () => {
      if (authFailedRef.current) return;
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/api/auth/admin/notifications/?admin_email=${encodeURIComponent(userEmail)}`
        );
        if (res.status === 401 || res.status === 403) {
          authFailedRef.current = true;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setNotifications(data.notifications || []);
      } catch {
        /* ignore transient network errors */
      }
    };

    void fetchNotifs();
    const interval = setInterval(() => void fetchNotifs(), 15000);
    return () => clearInterval(interval);
  }, [userEmail, accessToken, isAuthLoading, apiFetch]);

  useEffect(() => {
    localStorage.setItem("spylt_dismissed_notifs", JSON.stringify([...dismissed]));
  }, [dismissed]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, closePanel]);

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const dismissAll = () => {
    const newDismissed = new Set(dismissed);
    activeNotifications.forEach((n) => newDismissed.add(n.id));
    setDismissed(newDismissed);
  };

  const timeAgo = (isoTime: string) => {
    const diff = Date.now() - new Date(isoTime).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const handleNotificationClick = (notif: Notification) => {
    closePanel();
    if (notif.type === "new_order" || notif.type === "cancel_order") {
      router.push("/admin");
    } else if (notif.type === "low_stock" || (notif.type === "ai_warning" && notif.title.includes("Stock"))) {
      router.push("/admin-menu");
    } else if (notif.type === "forecast_ready" || notif.type === "ai_warning") {
      router.push("/admin-sales");
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => (open ? closePanel() : setOpen(true))}
        className="relative p-2 rounded-full hover:bg-dark-brown/10 transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
      >
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
          className="text-dark-brown"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            ref={backdropRef}
            type="button"
            style={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/20 sm:hidden"
            aria-label="Close notifications"
            onClick={closePanel}
          />
          <div
            ref={dropdownRef}
            style={{ opacity: 0 }}
            className={[
              "app-panel z-[60] overflow-hidden rounded-3xl border shadow-2xl will-change-transform",
              "fixed left-3 right-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))] max-h-[min(70dvh,28rem)]",
              "sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-12 sm:w-80 md:w-96 sm:max-h-[28rem]",
            ].join(" ")}
          >
            <div className="notif-header flex items-center justify-between px-5 py-4 border-b border-dark-brown/10">
              <h3 className="font-bold text-dark-brown uppercase text-sm tracking-tight">Notifications</h3>
              {activeNotifications.length > 0 && (
                <button
                  type="button"
                  onClick={dismissAll}
                  className="text-[10px] font-bold uppercase text-dark-brown/50 hover:text-dark-brown transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="max-h-[min(calc(70dvh-3.5rem),24rem)] overflow-y-auto sm:max-h-80">
              {activeNotifications.length === 0 ? (
                <div className="notif-empty py-10 text-center">
                  <p className="text-3xl mb-2">🔔</p>
                  <p className="font-paragraph text-dark-brown/40 text-sm">No new notifications</p>
                </div>
              ) : (
                activeNotifications.map((notif) => {
                  const cfg = typeConfig[notif.type];
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className="notif-item flex items-start gap-3 px-5 py-3.5 border-b border-dark-brown/5 hover:bg-dark-brown/5 transition-colors cursor-pointer"
                    >
                      <span className={`shrink-0 w-8 h-8 rounded-full ${cfg.bg} ${cfg.color} flex items-center justify-center text-sm`}>
                        {cfg.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-dark-brown text-xs leading-tight">{notif.title}</p>
                        <p className="font-paragraph text-dark-brown/60 text-[11px] mt-0.5 leading-snug">{notif.message}</p>

                        {notif.type === "cancel_order" && notif.extra_data?.cancel_reason && (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const data = {
                                orderId: notif.extra_data!.order_id || "Unknown Order",
                                reason: notif.extra_data!.cancel_reason!,
                              };
                              closePanel();
                              setTimeout(() => setViewReasonData(data), 220);
                            }}
                            className="flex items-center gap-1 text-[10px] text-red-600 mt-1 italic font-bold hover:text-red-800 hover:underline transition-colors cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            View Reason
                          </button>
                        )}

                        <p className="text-[10px] text-dark-brown/30 mt-1">{timeAgo(notif.time)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(notif.id);
                        }}
                        className="shrink-0 text-dark-brown/30 hover:text-dark-brown transition-colors mt-0.5"
                        aria-label="Dismiss"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {viewReasonData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="app-panel border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-50 border-b border-red-100 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                </div>
                <div>
                  <h3 className="font-bold text-dark-brown text-sm uppercase tracking-wider">Cancellation Reason</h3>
                  <p className="text-dark-brown/50 text-xs font-paragraph">{viewReasonData.orderId}</p>
                </div>
              </div>
              <button type="button" onClick={() => setViewReasonData(null)} className="text-dark-brown/40 hover:text-dark-brown transition-colors p-1 rounded-full hover:bg-dark-brown/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="font-paragraph text-dark-brown text-sm leading-relaxed break-words whitespace-pre-wrap">
                {viewReasonData.reason.replace(/^\[User Cancelled\]\s*/i, "")}
              </p>
            </div>
            <div className="p-4 border-t border-dark-brown/10 flex justify-end">
              <button
                type="button"
                onClick={() => setViewReasonData(null)}
                className="px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-dark-brown bg-dark-brown/10 hover:bg-dark-brown/20 transition-colors focus:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
