"use client";

import React from "react";
import Link from "next/link";

interface LoyaltyStampCardProps {
  totalOrders: number;
}

export default function LoyaltyStampCard({ totalOrders }: LoyaltyStampCardProps) {
  const STAMPS_REQUIRED = 8;
  const currentStamps = totalOrders % STAMPS_REQUIRED === 0 && totalOrders > 0 ? STAMPS_REQUIRED : totalOrders % STAMPS_REQUIRED;
  const isRewardReady = currentStamps === STAMPS_REQUIRED;
  const stampsRemaining = isRewardReady ? 0 : STAMPS_REQUIRED - currentStamps;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-light-brown/30 bg-gradient-to-br from-[#2a1810] via-[#3a2218] to-[#1c0f0a] p-5 sm:p-6 text-milk shadow-2xl">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-light-brown/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-brand-gold/15 blur-3xl"
        aria-hidden
      />

      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-milk/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-light-brown/20 border border-light-brown/30 text-lg">
            🥐
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-paragraph text-[10px] uppercase tracking-[0.25em] text-light-brown font-bold">
                Generation Bread Club
              </span>
              <span className="rounded-full bg-light-brown/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-light-brown border border-light-brown/30">
                VIP Stamp Card
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-milk">
              Artisan Rewards
            </h3>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-bold uppercase tracking-wider text-light-brown">
            {isRewardReady ? "🎉 Reward Unlocked!" : `${currentStamps} of ${STAMPS_REQUIRED} Stamps`}
          </span>
          <p className="text-[11px] font-paragraph text-milk/60">
            {isRewardReady ? "Free Ube Cheese Pandesal ready" : `${stampsRemaining} more orders to reward`}
          </p>
        </div>
      </div>

      {/* 8 Stamp Slots Grid */}
      <div className="relative z-10 my-5 grid grid-cols-4 gap-2.5 sm:grid-cols-8 sm:gap-3">
        {Array.from({ length: STAMPS_REQUIRED }).map((_, idx) => {
          const isStamped = idx < currentStamps;
          const isLastSlot = idx === STAMPS_REQUIRED - 1;

          return (
            <div
              key={idx}
              className={`group relative flex aspect-square flex-col items-center justify-center rounded-2xl border transition-all duration-300 ${
                isStamped
                  ? "border-brand-gold bg-gradient-to-b from-brand-gold/30 to-brand-gold/10 shadow-[0_0_15px_rgba(227,164,88,0.25)] scale-100"
                  : isLastSlot
                  ? "border-dashed border-light-brown/40 bg-milk/5"
                  : "border-milk/10 bg-black/20"
              }`}
            >
              {isStamped ? (
                <div className="flex flex-col items-center justify-center animate-fade-in">
                  <span className="text-base sm:text-lg drop-shadow-sm">🥐</span>
                  <span className="mt-0.5 text-[9px] font-bold text-brand-gold font-paragraph">
                    #{idx + 1}
                  </span>
                </div>
              ) : isLastSlot ? (
                <div className="flex flex-col items-center justify-center text-center px-1">
                  <span className="text-sm">🎁</span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter text-light-brown/80 mt-0.5">
                    Free Bake
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-milk/25">
                  <span className="text-xs font-bold tabular-nums">#{idx + 1}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Progress & Quick CTA */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-paragraph text-milk/75">
          <span className="flex h-2 w-2 rounded-full bg-light-brown animate-pulse" />
          <span>Each completed order earns 1 fresh stamp</span>
        </div>

        <div className="flex items-center gap-2">
          {isRewardReady ? (
            <Link
              href="/order"
              className="rounded-full bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-wide text-dark-brown shadow-lg hover:brightness-110 transition-all active:scale-95"
            >
              Claim Free Bake →
            </Link>
          ) : (
            <Link
              href="/order"
              className="rounded-full bg-milk/15 hover:bg-milk/25 px-4 py-2 text-xs font-bold uppercase tracking-wider text-light-brown hover:text-milk transition-all"
            >
              Order & Collect Stamp →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
