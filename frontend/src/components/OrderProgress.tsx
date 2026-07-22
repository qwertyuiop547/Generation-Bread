"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { GB_EASE } from "@/lib/motion";

export type OrderProgressStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

const STEPS = ["pending", "preparing", "ready"] as const;

export type OrderProgressType = "dine_in" | "takeout" | "scheduled" | "Dine-In" | "Takeout" | "Scheduled";

function isDineIn(orderType?: OrderProgressType | string | null): boolean {
  if (!orderType) return false;
  const t = orderType.toLowerCase().replace("-", "_").replace(" ", "_");
  return t === "dine_in" || t === "dinein";
}

function readyCopy(orderType?: OrderProgressType | string | null, tableNumber?: string | null) {
  if (isDineIn(orderType)) {
    const table = tableNumber ? ` to table ${tableNumber}` : " to your table";
    return {
      stepDesc: "We'll serve it to your table",
      bannerTitle: "Ready to serve",
      bannerDesc: `Your order will be brought${table}.`,
    };
  }
  if (orderType && (orderType.toLowerCase().includes("schedul") || orderType === "scheduled")) {
    return {
      stepDesc: "Claim at the counter",
      bannerTitle: "Ready for pickup",
      bannerDesc: "Please head to the counter to collect your scheduled order.",
    };
  }
  return {
    stepDesc: "Claim at the counter",
    bannerTitle: "Ready for pickup",
    bannerDesc: "Please head to the counter to collect your order.",
  };
}

const STEP_META_BASE: Record<
  (typeof STEPS)[number],
  { label: string; desc: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    desc: "We got your order",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  preparing: {
    label: "Preparing",
    desc: "Baking your order now",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3c-1.5 3-1.5 5 0 8" />
        <path d="M8.5 5c-1 2.5-1 4.5 0 7" />
        <path d="M15.5 5c1 2.5 1 4.5 0 7" />
        <rect x="5" y="13" width="14" height="8" rx="2" />
        <path d="M9 17h.01" />
        <path d="M15 17h.01" />
      </svg>
    ),
  },
  ready: {
    label: "Ready",
    desc: "Claim at the counter",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
};

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function statusToStep(status: OrderProgressStatus): number {
  if (status === "preparing") return 1;
  if (status === "ready" || status === "completed") return 2;
  return 0;
}

type OrderProgressProps = {
  status: OrderProgressStatus;
  orderType?: OrderProgressType | string | null;
  tableNumber?: string | null;
  /** Compact = slightly tighter padding for embedding inside order cards */
  compact?: boolean;
  className?: string;
};

export default function OrderProgress({
  status,
  orderType,
  tableNumber,
  compact = false,
  className = "",
}: OrderProgressProps) {
  const currentStep = statusToStep(status);
  const isCompleted = status === "completed";
  const isCancelled = status === "cancelled";
  const ready = readyCopy(orderType, tableNumber);
  const STEP_META = {
    ...STEP_META_BASE,
    ready: { ...STEP_META_BASE.ready, desc: ready.stepDesc },
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const stepNodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stepLabelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const statusTitleRef = useRef<HTMLHeadingElement>(null);
  const statusBadgeRef = useRef<HTMLSpanElement>(null);
  const statusBannerRef = useRef<HTMLDivElement>(null);
  const completeStampRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef<number>(-1);
  const prevStatusRef = useRef<OrderProgressStatus | null>(null);

  useEffect(() => {
    prevStepRef.current = -1;
    prevStatusRef.current = null;
  }, []);

  useGSAP(
    () => {
      if (isCancelled) return;

      const step = currentStep;
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const progressPct = isCompleted ? 100 : step === 0 ? 33 : step === 1 ? 66 : 100;
      const prev = prevStepRef.current;
      const prevStatus = prevStatusRef.current;
      const isAdvance = step > prev;
      const isFirstPaint = prev < 0;
      const justCompleted = isCompleted && prevStatus !== null && prevStatus !== "completed";
      prevStepRef.current = step;
      prevStatusRef.current = status;

      if (prefersReduced) {
        if (progressFillRef.current) gsap.set(progressFillRef.current, { width: `${progressPct}%` });
        if (completeStampRef.current && isCompleted) gsap.set(completeStampRef.current, { autoAlpha: 1, scale: 1 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: GB_EASE.out } });

      if (progressFillRef.current) {
        tl.to(
          progressFillRef.current,
          {
            width: `${progressPct}%`,
            duration: isFirstPaint ? 0.55 : isAdvance || justCompleted ? 0.95 : 0.45,
            ease: GB_EASE.inOut,
          },
          0
        );
      }

      if (!isFirstPaint && statusTitleRef.current) {
        tl.fromTo(
          statusTitleRef.current,
          { autoAlpha: 0.35, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.45 },
          0.05
        );
      }
      if (!isFirstPaint && statusBadgeRef.current) {
        tl.fromTo(
          statusBadgeRef.current,
          { scale: 0.86, autoAlpha: 0.5 },
          { scale: 1, autoAlpha: 1, duration: 0.4 },
          0.08
        );
      }

      stepNodeRefs.current.forEach((node, i) => {
        if (!node) return;
        gsap.killTweensOf(node);

        if (isAdvance && i === prev) {
          tl.fromTo(node, { scale: 1.12 }, { scale: 1, duration: 0.5 }, 0.12);
        }

        if (i === step && !justCompleted) {
          tl.fromTo(
            node,
            { scale: isFirstPaint ? 0.92 : 0.78 },
            { scale: 1, duration: 0.55 },
            isFirstPaint ? 0.1 : 0.28
          );
          tl.fromTo(
            node,
            { boxShadow: "0 0 0 0 rgba(227,164,88,0)" },
            {
              boxShadow: "0 0 0 10px rgba(227,164,88,0.18)",
              duration: 0.55,
              yoyo: true,
              repeat: 1,
              ease: GB_EASE.inOut,
              onComplete: () => {
                gsap.set(node, { clearProps: "boxShadow" });
              },
            },
            isFirstPaint ? 0.15 : 0.32
          );
        }

        // Completion: every step pops to "done" with warm pulse
        if (justCompleted) {
          tl.fromTo(
            node,
            { scale: 0.88 },
            {
              scale: 1,
              duration: 0.45,
              ease: "back.out(1.8)",
            },
            0.15 + i * 0.08
          );
        }
      });

      stepLabelRefs.current.forEach((label, i) => {
        if (!label || i !== step || isFirstPaint) return;
        gsap.killTweensOf(label);
        tl.fromTo(label, { autoAlpha: 0.45, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.3);
      });

      if (statusBannerRef.current && (status === "ready" || isCompleted)) {
        tl.fromTo(
          statusBannerRef.current,
          { autoAlpha: 0, y: 14, scale: 0.98 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.55 },
          isAdvance || justCompleted ? 0.45 : 0.1
        );
      }

      if (completeStampRef.current) {
        if (justCompleted) {
          tl.fromTo(
            completeStampRef.current,
            { autoAlpha: 0, scale: 0.4, rotation: -12 },
            {
              autoAlpha: 1,
              scale: 1,
              rotation: -6,
              duration: 0.65,
              ease: "back.out(2)",
            },
            0.55
          );
          tl.to(
            completeStampRef.current,
            { scale: 1.06, duration: 0.28, yoyo: true, repeat: 1, ease: GB_EASE.inOut },
            1.1
          );
        } else if (isCompleted) {
          gsap.set(completeStampRef.current, { autoAlpha: 1, scale: 1, rotation: -6 });
        } else {
          gsap.set(completeStampRef.current, { autoAlpha: 0, scale: 0.4 });
        }
      }
    },
    { scope: rootRef, dependencies: [currentStep, status, isCompleted] }
  );

  if (isCancelled) {
    return (
      <div className={`rounded-2xl border border-red-brown/20 bg-red-brown/10 px-4 py-3.5 text-center ${className}`}>
        <p className="text-sm font-bold uppercase tracking-wide text-red-brown">Order cancelled</p>
        <p className="mt-1 font-paragraph text-xs text-red-brown/60">
          Please contact staff for assistance.
        </p>
      </div>
    );
  }

  const pad = compact ? "p-4 md:p-5" : "p-5 md:p-7";

  return (
    <div
      ref={rootRef}
      className={`app-panel relative overflow-hidden border rounded-3xl shadow-lg ${pad} ${className}`}
    >
      <div
        ref={completeStampRef}
        className="pointer-events-none absolute -right-2 top-4 z-20 rotate-[-6deg] rounded-xl border-2 border-[#2a1810]/80 bg-[#e3a458]/25 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#2a1810] opacity-0 md:right-4 md:top-6"
        aria-hidden
      >
        Complete
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 md:mb-6">
        <div>
          <p className="font-paragraph text-[10px] uppercase tracking-[0.28em] text-dark-brown/45">
            Order progress
          </p>
          <h3
            ref={statusTitleRef}
            className="mt-1 text-lg font-bold uppercase tracking-tight text-dark-brown md:text-xl"
          >
            {isCompleted ? "Completed" : STEP_META[STEPS[Math.min(currentStep, STEPS.length - 1)]].label}
          </h3>
        </div>
        <span
          ref={statusBadgeRef}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ${
            isCompleted
              ? "bg-emerald-100 text-emerald-800"
              : status === "ready"
                ? "bg-light-brown/40 text-dark-brown"
                : status === "preparing"
                  ? "bg-yellow-brown/25 text-dark-brown"
                  : "bg-dark-brown/10 text-dark-brown"
          }`}
        >
          {status}
        </span>
      </div>

      <div className="mb-5 h-2 overflow-hidden rounded-full bg-dark-brown/10 md:mb-6">
        <div
          ref={progressFillRef}
          className={`h-full origin-left rounded-full will-change-[width] ${
            isCompleted
              ? "bg-gradient-to-r from-light-brown via-mid-brown to-emerald-600"
              : "bg-gradient-to-r from-light-brown to-mid-brown"
          }`}
          style={{ width: "0%" }}
        />
      </div>

      <div className="relative px-1 md:px-4">
        <div className="absolute left-[16%] right-[16%] top-[22px] hidden h-1 rounded-full bg-dark-brown/10 md:block" />

        <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-2">
          {STEPS.map((step, i) => {
            const done = isCompleted || i < currentStep;
            const active = !isCompleted && i === currentStep;
            return (
              <div key={step} className="flex items-center gap-3 md:flex-col md:items-center md:text-center">
                <div
                  ref={(el) => {
                    stepNodeRefs.current[i] = el;
                  }}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 will-change-transform md:h-12 md:w-12 ${
                    isCompleted
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-[0_0_0_6px_rgba(16,185,129,0.18)]"
                      : active
                        ? "border-light-brown bg-light-brown text-dark-brown shadow-[0_0_0_6px_rgba(227,164,88,0.22)]"
                        : done
                          ? "border-dark-brown bg-dark-brown text-milk"
                          : "border-light-brown/50 app-chip text-dark-brown/35"
                  }`}
                >
                  {done || isCompleted ? <CheckIcon /> : STEP_META[step].icon}
                </div>
                <div
                  ref={(el) => {
                    stepLabelRefs.current[i] = el;
                  }}
                  className="min-w-0 md:mt-3"
                >
                  <p
                    className={`text-sm font-bold uppercase tracking-tight ${
                      active || done || isCompleted ? "text-dark-brown" : "text-dark-brown/40"
                    }`}
                  >
                    {STEP_META[step].label}
                  </p>
                  <p
                    className={`font-paragraph text-xs leading-snug md:mt-0.5 ${
                      active ? "text-dark-brown/70" : done || isCompleted ? "text-dark-brown/55" : "text-dark-brown/35"
                    }`}
                  >
                    {isCompleted && i === STEPS.length - 1 ? "Enjoy your order" : STEP_META[step].desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(status === "ready" || isCompleted) && (
        <div
          ref={statusBannerRef}
          className={`mt-5 rounded-2xl border px-4 py-3.5 text-center md:mt-6 ${
            isCompleted
              ? "border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-light-brown/20"
              : "border-light-brown/30 bg-gradient-to-r from-light-brown/20 to-yellow-brown/10"
          }`}
        >
          <p className="text-sm font-bold uppercase tracking-wide text-dark-brown">
            {isCompleted ? "Order completed" : ready.bannerTitle}
          </p>
          <p className="mt-1 font-paragraph text-xs text-dark-brown/60">
            {isCompleted
              ? "Salamat! See you again at Generation Bread."
              : ready.bannerDesc}
          </p>
        </div>
      )}
    </div>
  );
}
