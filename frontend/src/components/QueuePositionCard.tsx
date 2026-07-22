"use client";

import React from "react";
import {
  formatQueuePositionDisplay,
  formatQueuePositionShort,
  formatSmartEtaDisplay,
  getQueuePosition,
  type SmartEta,
} from "@/lib/smartEta";

type Props = {
  eta: SmartEta | null | undefined;
  /** Compact chip only (for cards / lists). */
  compact?: boolean;
  className?: string;
};

/**
 * Customer-facing queue position + ETA.
 * Shows "You're #N in line" beside the wait estimate.
 */
export default function QueuePositionCard({ eta, compact = false, className = "" }: Props) {
  if (!eta) return null;
  if (eta.status === "cancelled") return null;

  const short = formatQueuePositionShort(eta);
  const full = formatQueuePositionDisplay(eta);
  const position = getQueuePosition(eta);
  const showQueue = Boolean(short) && eta.status !== "ready" && eta.status !== "completed";

  if (compact) {
    if (!showQueue && eta.status !== "ready" && eta.status !== "completed") {
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold text-dark-brown/70 ${className}`}>
          <span className="tabular-nums">{formatSmartEtaDisplay(eta)}</span>
        </span>
      );
    }
    if (!showQueue) return null;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-light-brown/25 border border-light-brown/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-dark-brown ${className}`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-light-brown animate-pulse" aria-hidden />
        {short}
        <span className="opacity-50">·</span>
        <span className="normal-case tracking-normal font-semibold opacity-80">
          {formatSmartEtaDisplay(eta)}
        </span>
      </span>
    );
  }

  return (
    <div
      className={`bg-gradient-to-r from-light-brown/20 to-[#d4af37]/10 border border-light-brown/30 rounded-3xl p-5 md:p-6 shadow-md ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-dark-brown/10 flex items-center justify-center shrink-0 relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {showQueue && position > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[1.35rem] h-5 px-1 rounded-full bg-dark-brown text-milk text-[10px] font-bold flex items-center justify-center tabular-nums">
              {eta.status === "preparing" && (eta.queue_ahead ?? 0) === 0 ? "!" : position}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/50 mb-1">
            {showQueue ? "Queue position" : "Smart ETA"}
          </p>
          {showQueue ? (
            <>
              <p className="text-2xl md:text-3xl font-bold text-dark-brown tracking-tight">
                {short}
              </p>
              <p className="font-paragraph text-dark-brown/70 text-sm mt-1">{full}</p>
              <p className="font-paragraph text-dark-brown/50 text-xs mt-2">
                Est. wait <span className="font-bold text-dark-brown/80">{formatSmartEtaDisplay(eta)}</span>
                {" · "}updates as the line moves
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl md:text-3xl font-bold text-dark-brown tracking-tight">
                {formatSmartEtaDisplay(eta)}
              </p>
              <p className="font-paragraph text-dark-brown/60 text-sm mt-1">{eta.message}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
