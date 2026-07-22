"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { GB_EASE } from "@/lib/motion";

gsap.registerPlugin(useGSAP);

export type OrderCompletedDetail = {
  orderId?: number | string;
  orderLabel?: string;
};

type CelebrationState = {
  orderLabel: string;
} | null;

/**
 * Full-screen celebration when a customer order is marked completed.
 * Warm bakery motion — check draw, soft crumbs, calm copy.
 */
export default function OrderCompletedCelebration() {
  const [celebration, setCelebration] = useState<CelebrationState>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<SVGSVGElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const crumbsRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const lastShownRef = useRef<{ label: string; at: number } | null>(null);

  useEffect(() => {
    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<OrderCompletedDetail>).detail;
      if (!detail) return;
      const raw = detail.orderLabel || detail.orderId;
      const orderLabel =
        typeof raw === "number"
          ? `ORD-${String(raw).padStart(4, "0")}`
          : String(raw || "your order");

      const now = Date.now();
      const last = lastShownRef.current;
      if (last && last.label === orderLabel && now - last.at < 6000) return;
      lastShownRef.current = { label: orderLabel, at: now };
      setCelebration({ orderLabel });
    };

    window.addEventListener("gb:order-completed", onCompleted as EventListener);
    return () => {
      window.removeEventListener("gb:order-completed", onCompleted as EventListener);
    };
  }, []);

  useGSAP(
    () => {
      if (!celebration || !rootRef.current) return;

      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const crumbs = crumbsRef.current
        ? gsap.utils.toArray<HTMLElement>(".gb-crumb", crumbsRef.current)
        : [];

      if (prefersReduced) {
        gsap.set(rootRef.current, { autoAlpha: 1 });
        gsap.set([cardRef.current, titleRef.current, subRef.current].filter(Boolean), {
          autoAlpha: 1,
          scale: 1,
          y: 0,
        });
        return;
      }

      const tl = gsap.timeline({
        defaults: { ease: GB_EASE.out },
      });

      gsap.set(rootRef.current, { autoAlpha: 1 });
      gsap.set(cardRef.current, { autoAlpha: 0, scale: 0.86, y: 28 });
      gsap.set([titleRef.current, subRef.current], { autoAlpha: 0, y: 16 });
      gsap.set(ringRef.current, { scale: 0.4, autoAlpha: 0 });
      gsap.set(crumbs, { autoAlpha: 0, scale: 0, y: 0, x: 0 });

      const checkPath = checkRef.current?.querySelector("polyline");
      if (checkPath) {
        const length = (checkPath as SVGGeometryElement).getTotalLength?.() ?? 40;
        gsap.set(checkPath, {
          strokeDasharray: length,
          strokeDashoffset: length,
        });
      }

      tl.to(rootRef.current, { backgroundColor: "rgba(42, 24, 16, 0.55)", duration: 0.45 }, 0)
        .to(
          cardRef.current,
          { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: "back.out(1.6)" },
          0.12
        )
        .to(
          ringRef.current,
          { scale: 1, autoAlpha: 1, duration: 0.55, ease: "power3.out" },
          0.28
        )
        .to(
          ringRef.current,
          {
            scale: 1.35,
            autoAlpha: 0,
            duration: 0.85,
            ease: GB_EASE.soft,
          },
          0.55
        );

      if (checkPath) {
        tl.to(
          checkPath,
          { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" },
          0.4
        );
      }

      tl.to(
        checkRef.current,
        { scale: 1.12, duration: 0.22, yoyo: true, repeat: 1, ease: GB_EASE.inOut },
        0.85
      )
        .to(titleRef.current, { autoAlpha: 1, y: 0, duration: 0.45 }, 0.7)
        .to(subRef.current, { autoAlpha: 1, y: 0, duration: 0.45 }, 0.82);

      crumbs.forEach((crumb, i) => {
        const angle = (i / Math.max(crumbs.length, 1)) * Math.PI * 2;
        const dist = 48 + (i % 3) * 28;
        tl.fromTo(
          crumb,
          { autoAlpha: 0, scale: 0, x: 0, y: 0 },
          {
            autoAlpha: 1,
            scale: 0.7 + (i % 4) * 0.2,
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist - 12,
            duration: 0.7,
            ease: "power2.out",
          },
          0.5 + i * 0.035
        );
        tl.to(
          crumb,
          {
            y: `+=${20 + (i % 5) * 8}`,
            autoAlpha: 0,
            duration: 1.1,
            ease: GB_EASE.soft,
          },
          1.15 + i * 0.02
        );
      });

      // Soft settle before auto-dismiss handled outside
      tl.to(cardRef.current, { scale: 1.015, duration: 0.6, yoyo: true, repeat: 1, ease: GB_EASE.inOut }, 1.4);
    },
    { scope: rootRef, dependencies: [celebration], revertOnUpdate: true }
  );

  useEffect(() => {
    if (!celebration) return;
    const id = window.setTimeout(() => setCelebration(null), 4200);
    return () => window.clearTimeout(id);
  }, [celebration]);

  const dismiss = () => {
    if (!rootRef.current) {
      setCelebration(null);
      return;
    }
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setCelebration(null);
      return;
    }
    gsap.to(rootRef.current, {
      autoAlpha: 0,
      duration: 0.35,
      ease: GB_EASE.inOut,
      onComplete: () => setCelebration(null),
    });
  };

  if (!celebration) return null;

  const crumbColors = ["#e3a458", "#a26833", "#523122", "#f5d9a8", "#c47a2c", "#8a6a2f"];

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[200] flex items-center justify-center px-5"
      style={{ backgroundColor: "rgba(42, 24, 16, 0)", visibility: "hidden" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gb-order-complete-title"
      onClick={dismiss}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-[#e3a458]/35 bg-[#faf4ec] px-7 py-9 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(227,164,88,0.28), transparent 60%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(82,49,34,0.08), transparent 50%)",
          }}
        />

        <div ref={crumbsRef} className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="gb-crumb absolute left-0 top-0 h-2 w-2 rounded-full"
              style={{
                backgroundColor: crumbColors[i % crumbColors.length],
                opacity: 0,
              }}
            />
          ))}
        </div>

        <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center">
          <div
            ref={ringRef}
            className="absolute inset-0 rounded-full border-2 border-[#e3a458]/50"
            style={{ opacity: 0 }}
          />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#2a1810] text-[#faf4ec] shadow-lg">
            <svg
              ref={checkRef}
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="origin-center"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <p className="relative font-paragraph text-[10px] uppercase tracking-[0.32em] text-[#523122]/50">
          Generation Bread
        </p>
        <h2
          id="gb-order-complete-title"
          ref={titleRef}
          className="relative mt-2 text-2xl font-bold uppercase tracking-tight text-[#2a1810]"
        >
          Order complete
        </h2>
        <p ref={subRef} className="relative mt-2 font-paragraph text-sm leading-relaxed text-[#523122]/70">
          Salamat! {celebration.orderLabel} is done.
          <br />
          See you again soon.
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="relative mt-6 w-full rounded-full bg-[#2a1810] py-3.5 text-sm font-bold uppercase tracking-wider text-[#faf4ec] transition-opacity hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
