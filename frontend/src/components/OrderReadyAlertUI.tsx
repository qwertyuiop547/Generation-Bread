"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  areOrderAlertsEnabled,
  notificationPermission,
  requestOrderAlertPermission,
  setOrderAlertsEnabled,
} from "@/lib/orderReadyAlerts";

type BannerDetail = { title: string; body: string; orderLabel: string };

/**
 * 1) Permission / enable controls for vibrate + OS notifications
 * 2) In-app banner when order becomes ready
 */
export default function OrderReadyAlertUI() {
  const { isLoggedIn, isStaff, isAdmin, isAuthLoading } = useAuth();
  const isCustomer = isLoggedIn && !isAuthLoading && !isStaff && !isAdmin;

  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [banner, setBanner] = useState<BannerDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState(false);

  useEffect(() => {
    if (!isCustomer) return;
    setEnabled(areOrderAlertsEnabled());
    setPermission(notificationPermission());
    try {
      setDismissedPrompt(sessionStorage.getItem("gb_alert_prompt_dismissed") === "1");
    } catch {
      /* ignore */
    }
  }, [isCustomer]);

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<BannerDetail>).detail;
      if (!detail) return;
      setBanner(detail);
    };
    window.addEventListener("gb:order-ready", onReady as EventListener);
    return () => window.removeEventListener("gb:order-ready", onReady as EventListener);
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 12000);
    return () => clearTimeout(t);
  }, [banner]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await requestOrderAlertPermission();
      setEnabled(ok);
      setPermission(notificationPermission());
      if (ok) setDismissedPrompt(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    setDismissedPrompt(true);
    try {
      sessionStorage.setItem("gb_alert_prompt_dismissed", "1");
    } catch {
      /* ignore */
    }
  }, []);

  const disable = useCallback(() => {
    setOrderAlertsEnabled(false);
    setEnabled(false);
  }, []);

  if (!isCustomer) return null;

  const needsPermission =
    permission !== "granted" && permission !== "unsupported";
  const showPrompt = !dismissedPrompt && (!enabled || needsPermission);

  return (
    <>
      {showPrompt && (
        <div className="pointer-events-none fixed bottom-20 left-0 right-0 z-[90] flex justify-center px-4 sm:bottom-24">
          <div className="pointer-events-auto max-w-md w-full rounded-2xl border border-light-brown/40 bg-milk/95 backdrop-blur shadow-[0_12px_40px_-12px_rgba(82,49,34,0.45)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-dark-brown text-sm uppercase tracking-tight">
                  Order ready alerts
                </p>
                <p className="font-paragraph text-dark-brown/60 text-xs mt-1">
                  Enable so your phone can vibrate and show a notification when your order is ready.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissPrompt}
                className="text-dark-brown/40 hover:text-dark-brown text-lg leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void enable()}
                className="flex-1 bg-dark-brown hover:bg-dark-brown-hover text-milk text-xs font-bold uppercase rounded-full py-2.5 px-4 transition-colors disabled:opacity-60"
              >
                {busy ? "Enabling…" : "Enable vibrate + notif"}
              </button>
              {enabled && (
                <button
                  type="button"
                  onClick={disable}
                  className="text-xs font-bold uppercase text-dark-brown/50 px-2"
                >
                  Off
                </button>
              )}
            </div>
            {permission === "denied" && (
              <p className="text-[10px] text-red-700/80 mt-2 font-paragraph">
                Notifications are blocked in browser settings. Allow them for this site, then tap Enable again.
              </p>
            )}
          </div>
        </div>
      )}

      {banner && (
        <div className="fixed inset-x-0 top-0 z-[110] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-dark-brown text-milk shadow-2xl p-4 border border-yellow-brown/40 translate-y-0 opacity-100 transition-all duration-300">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl bg-yellow-brown/30 flex items-center justify-center shrink-0"
                aria-hidden
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm uppercase tracking-tight">{banner.title}</p>
                <p className="font-paragraph text-milk/75 text-xs mt-0.5">{banner.body}</p>
                <Link
                  href={`/track?order=${encodeURIComponent(banner.orderLabel)}`}
                  className="inline-flex mt-2 text-[11px] font-bold uppercase tracking-wider text-yellow-brown"
                  onClick={() => setBanner(null)}
                >
                  Open tracker →
                </Link>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setBanner(null)}
                className="text-milk/50 hover:text-milk text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
