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
  compact?: boolean;
  className?: string;
};

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
        className={`inline-flex items-center gap-1.5 rounded-full bg-light-brown/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-dark-brown ${className}`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-mid-brown animate-pulse" aria-hidden />
        {short}
        <span className="opacity-40">·</span>
        <span className="normal-case tracking-normal font-semibold opacity-75">
          {formatSmartEtaDisplay(eta)}
        </span>
      </span>
    );
  }

  return (
    <div className={`rounded-2xl bg-light-brown/15 px-3 py-3.5 sm:px-4 sm:py-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-dark-brown/45">
            {showQueue ? "Queue" : "Wait time"}
          </p>
          {showQueue ? (
            <>
              <p className="text-2xl font-bold tracking-tight text-dark-brown md:text-3xl">
                {position > 0 ? `#${position}` : short}
              </p>
              <p className="mt-1 break-words font-paragraph text-sm text-dark-brown/60">{full}</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-dark-brown md:text-3xl">
                {formatSmartEtaDisplay(eta)}
              </p>
              <p className="mt-1 break-words font-paragraph text-sm text-dark-brown/55">{eta.message}</p>
            </>
          )}
        </div>
        {showQueue && (
          <div className="text-left sm:text-right">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-dark-brown/40">Est.</p>
            <p className="text-base font-bold tabular-nums text-mid-brown">{formatSmartEtaDisplay(eta)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
