"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

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
  const panelRef = useRef<HTMLDivElement>(null);

  const activeNotifications = notifications.filter((n) => !dismissed.has(n.id));
  const unreadCount = activeNotifications.length;

  useEffect(() => {
    if (!userEmail) return;

    const fetchNotifs = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/auth/admin/notifications/?admin_email=${encodeURIComponent(userEmail)}`
        );
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        }
      } catch {}
    };

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000);
    return () => clearInterval(interval);
  }, [userEmail]);

  useEffect(() => {
    localStorage.setItem("spylt_dismissed_notifs", JSON.stringify([...dismissed]));
  }, [dismissed]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

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
    setOpen(false);
    if (notif.type === "new_order" || notif.type === "cancel_order") {
      router.push("/admin");
    } else if (notif.type === "low_stock" || (notif.type === "ai_warning" && notif.title.includes("Stock"))) {
      router.push("/admin-menu");
    } else if (notif.type === "forecast_ready" || notif.type === "ai_warning") {
      router.push("/admin-sales");
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-dark-brown/10 transition-colors"
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
        <div className="absolute right-0 top-12 w-80 md:w-96 bg-white rounded-3xl shadow-2xl border border-dark-brown/10 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-brown/10">
            <h3 className="font-bold text-dark-brown uppercase text-sm tracking-tight">Notifications</h3>
            {activeNotifications.length > 0 && (
              <button
                onClick={dismissAll}
                className="text-[10px] font-bold uppercase text-dark-brown/50 hover:text-dark-brown transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {activeNotifications.length === 0 ? (
              <div className="py-10 text-center">
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
                    className="flex items-start gap-3 px-5 py-3.5 border-b border-dark-brown/5 hover:bg-dark-brown/5 transition-colors cursor-pointer"
                  >
                    <span className={`shrink-0 w-8 h-8 rounded-full ${cfg.bg} ${cfg.color} flex items-center justify-center text-sm`}>
                      {cfg.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-dark-brown text-xs leading-tight">{notif.title}</p>
                      <p className="font-paragraph text-dark-brown/60 text-[11px] mt-0.5 leading-snug">{notif.message}</p>
                      
                      {notif.type === "cancel_order" && notif.extra_data?.cancel_reason && (
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const data = {
                              orderId: notif.extra_data!.order_id || "Unknown Order",
                              reason: notif.extra_data!.cancel_reason!
                            };
                            setOpen(false);
                            setTimeout(() => setViewReasonData(data), 50);
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
                      onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                      className="shrink-0 text-dark-brown/30 hover:text-dark-brown transition-colors mt-0.5"
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
      )}

      {/* View Reason Modal */}
      {viewReasonData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={() => setViewReasonData(null)} className="text-dark-brown/40 hover:text-dark-brown transition-colors p-1 rounded-full hover:bg-dark-brown/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="font-paragraph text-dark-brown text-sm leading-relaxed break-words whitespace-pre-wrap">
                {viewReasonData.reason.replace(/^\[User Cancelled\]\s*/i, '')}
              </p>
            </div>
            <div className="p-4 border-t border-dark-brown/10 flex justify-end">
              <button
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
