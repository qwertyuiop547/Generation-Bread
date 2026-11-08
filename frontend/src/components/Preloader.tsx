"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import { GB_EASE } from "@/lib/motion";

export type PreloaderVariant = "welcome" | "goodbye";

interface PreloaderProps {
  isLoaded: boolean;
  onFinish: () => void;
  /** Minimum time (ms) the load animation plays before exit */
  minDuration?: number;
  variant?: PreloaderVariant;
}

const DEFAULT_MIN_DURATION = 1800;
const GOODBYE_MIN_DURATION = 2600;

const Preloader: React.FC<PreloaderProps> = ({
  isLoaded,
  onFinish,
  minDuration,
  variant = "welcome",
}) => {
  const isGoodbye = variant === "goodbye";
  const duration = minDuration ?? (isGoodbye ? GOODBYE_MIN_DURATION : DEFAULT_MIN_DURATION);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef({ value: 0 });
  const loadTweenRef = useRef<gsap.core.Tween | null>(null);
  const exitRan = useRef(false);
  const [finished, setFinished] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);

  const readyToExit = isLoaded && minTimeDone;

  const updateProgressVisual = (value: number) => {
    const pct = Math.min(100, Math.max(0, Math.round(value)));
    if (barFillRef.current) {
      barFillRef.current.style.width = `${pct}%`;
    }
    if (counterRef.current) {
      counterRef.current.textContent = `${pct}%`;
    }
    if (glowRef.current) {
      const intensity = 0.25 + (pct / 100) * 0.2;
      glowRef.current.style.opacity = String(intensity);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    dialog.focus({ preventScroll: true });

    const blockScrollIntoView = (e: Event) => {
      e.preventDefault();
    };
    dialog.addEventListener("scroll", blockScrollIntoView, { passive: false });

    return () => {
      dialog.removeEventListener("scroll", blockScrollIntoView);
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setMinTimeDone(true), duration);
    return () => window.clearTimeout(t);
  }, [duration]);

  useGSAP(
    () => {
      if (!brandRef.current) return;

      const logo = brandRef.current.querySelector(".preloader-logo");
      const eyebrow = brandRef.current.querySelector(".preloader-eyebrow");
      const titleMain = brandRef.current.querySelector(".preloader-title-main");
      const sticker = brandRef.current.querySelector(".preloader-sticker");
      const loaderBlock = brandRef.current.querySelector(".preloader-loader-block");
      const locationTag = brandRef.current.querySelector(".preloader-location-tag");
      const skipHint = brandRef.current.querySelector(".preloader-skip-hint");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduceMotion) {
        gsap.set(
          [logo, eyebrow, titleMain, sticker, loaderBlock, locationTag, skipHint, productRef.current],
          {
            opacity: 1,
            y: 0,
            yPercent: 0,
            scale: 1,
          }
        );
        progressRef.current.value = isGoodbye ? 100 : 92;
        updateProgressVisual(progressRef.current.value);
        return;
      }

      const intro = gsap.timeline({ defaults: { ease: GB_EASE.out } });

      intro
        .fromTo(
          productRef.current,
          { scale: 1.08, opacity: 0 },
          { scale: 1.02, opacity: 1, duration: 1.2, ease: "power2.out" },
          0
        )
        .fromTo(
          logo,
          { scale: 0.6, opacity: 0, rotation: -8 },
          { scale: 1, opacity: 1, rotation: 0, duration: 0.7, ease: "back.out(1.8)" },
          0.1
        )
        .fromTo(
          eyebrow,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.5, ease: GB_EASE.out },
          0.2
        )
        .fromTo(
          titleMain,
          { opacity: 0, y: 25 },
          { opacity: 1, y: 0, duration: 0.7, ease: GB_EASE.out },
          0.25
        )
        .fromTo(
          sticker,
          { scale: 0.85, opacity: 0, rotation: 0 },
          { scale: 1, opacity: 1, rotation: -2.5, duration: 0.75, ease: "back.out(1.7)" },
          0.35
        )
        .fromTo(
          loaderBlock,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.6, ease: GB_EASE.out },
          0.45
        )
        .fromTo(
          locationTag,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.5, ease: GB_EASE.out },
          0.55
        )
        .fromTo(
          skipHint,
          { opacity: 0 },
          { opacity: 1, duration: 0.5 },
          0.7
        );

      loadTweenRef.current = gsap.fromTo(
        progressRef.current,
        { value: 0 },
        {
          value: isGoodbye ? 100 : 94,
          duration: duration / 1000,
          ease: "power1.inOut",
          onUpdate: () => updateProgressVisual(progressRef.current.value),
        }
      );
    },
    { scope: panelRef }
  );

  useGSAP(
    () => {
      if (!readyToExit || exitRan.current) return;
      if (!panelRef.current || !brandRef.current || !dialogRef.current) return;

      exitRan.current = true;
      loadTweenRef.current?.kill();

      const exitTl = gsap.timeline({
        onComplete: () => {
          dialogRef.current?.close();
          setFinished(true);
          onFinishRef.current();
        },
      });

      exitTl
        .to(progressRef.current, {
          value: 100,
          duration: 0.3,
          ease: "power2.out",
          onUpdate: () => updateProgressVisual(progressRef.current.value),
        })
        .to(
          brandRef.current,
          {
            scale: 0.98,
            opacity: 0,
            duration: 0.45,
            ease: "power2.inOut",
          },
          "-=0.05"
        )
        .to(
          productRef.current,
          { opacity: 0, scale: 1.05, duration: 0.4, ease: "power2.in" },
          "-=0.3"
        )
        .to(
          panelRef.current,
          {
            yPercent: isGoodbye ? 100 : -100,
            duration: 0.8,
            ease: "power4.inOut",
          },
          "-=0.25"
        );
    },
    { dependencies: [readyToExit], scope: panelRef }
  );

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const safety = window.setTimeout(() => {
      if (!exitRan.current) {
        exitRan.current = true;
        dialogRef.current?.close();
        setFinished(true);
        onFinishRef.current();
      }
    }, duration + 2500);
    return () => window.clearTimeout(safety);
  }, [duration]);

  const skipPreloader = () => {
    if (exitRan.current) return;
    exitRan.current = true;
    loadTweenRef.current?.kill();
    dialogRef.current?.close();
    setFinished(true);
    onFinishRef.current();
  };

  if (finished) return null;

  return (
    <dialog
      ref={dialogRef}
      className="preloader-dialog m-0 h-dvh max-h-dvh w-screen max-w-none border-0 bg-transparent p-0 open:flex open:flex-col"
      aria-label={isGoodbye ? "Thank you for visiting Generation Bread" : "Loading Generation Bread"}
      aria-busy="true"
      onCancel={(e) => e.preventDefault()}
      onClick={skipPreloader}
    >
      <div
        ref={panelRef}
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden will-change-transform cursor-pointer select-none bg-[#140f0c]"
        role="status"
        aria-live="polite"
      >
        {/* Warm Artisanal Ube Cheese Bread Backdrop */}
        <div
          ref={productRef}
          className="pointer-events-none absolute inset-0 opacity-0 will-change-transform"
        >
          <Image
            src="/images/generation-bread-ube-artisanal.jpg"
            alt="Generation Bread Artisanal Ube Cheese Pandesal"
            width={1920}
            height={1080}
            priority
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover filter brightness-[0.78] contrast-[1.08] saturate-[1.14] theme-lock-media"
          />

          {/* Warm Café Radial Scrim (Keeps bread delicious and text readable) */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(20, 15, 12, 0.42) 0%, rgba(20, 15, 12, 0.72) 65%, rgba(20, 15, 12, 0.92) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(20, 15, 12, 0.6) 0%, transparent 40%, rgba(20, 15, 12, 0.75) 100%)",
            }}
          />
        </div>

        {/* Ambient Warm Golden Café Glow */}
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 opacity-[0.32] transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(ellipse 65% 50% at 50% 50%, rgba(227, 164, 88, 0.3) 0%, rgba(162, 104, 51, 0.12) 50%, transparent 75%)",
          }}
        />

        {/* ─── CENTRAL BRAND LOCKUP (100% Generation Bread Design System) ─── */}
        <div
          ref={brandRef}
          className="relative z-10 flex w-full max-w-xl flex-col items-center px-6 text-center will-change-transform"
        >
          {/* Generation Bread Signature Croissant Badge */}
          <div className="preloader-logo mb-5 flex items-center justify-center">
            <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border-2 border-[#e3a458]/70 bg-[#241711]/85 p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-md">
              <CroissantLogoIcon
                className="h-9 w-9 sm:h-11 sm:w-11 text-[#faeade] drop-shadow-md"
                strokeWidth={18}
              />
            </div>
          </div>

          {/* Brand Eyebrow Badge */}
          <div className="preloader-eyebrow mb-2 flex items-center justify-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[#e3a458]/40 bg-black/50 px-4 py-1 backdrop-blur-sm shadow-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e3a458] animate-pulse" />
              <span className="font-paragraph text-[10px] sm:text-xs font-bold tracking-[0.32em] uppercase text-[#f5d09d]">
                {isGoodbye ? "Generation Bread" : "Artisanal Bakery & Café"}
              </span>
            </div>
          </div>

          {/* Main Title: Kinetic Antonio Brand Lockup with Signature Tilted Badge */}
          <div className="flex flex-col items-center justify-center my-1 select-none">
            <h1 className="preloader-title-main font-sans text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] leading-none">
              {isGoodbye ? "THANK" : "GENERATION"}
            </h1>

            {/* Signature Angled Brand Sticker (Exact matching hero style) */}
            <div className="preloader-sticker -rotate-2 border-2 sm:border-4 border-milk bg-light-brown px-4 sm:px-7 py-1 sm:py-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.8)] mt-1.5 sm:mt-2">
              <span className="font-sans text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight text-dark-brown leading-none block">
                {isGoodbye ? "YOU" : "BREAD"}
              </span>
            </div>
          </div>

          {/* Subtitle Line */}
          <p className="mt-4 font-paragraph text-xs sm:text-sm tracking-[0.22em] uppercase font-medium text-milk/85 drop-shadow-sm">
            {isGoodbye ? "Salamat for visiting · Come back hungry" : "Fresh Bakes & Bold Flavors"}
          </p>

          {/* ─── SLEEK BAKERY PROGRESS BAR ─── */}
          <div className="preloader-loader-block mt-7 sm:mt-9 flex w-full max-w-xs sm:max-w-sm flex-col items-center">
            {/* Counter + Track in one clean unified capsule */}
            <div className="flex w-full items-center gap-3.5 rounded-full border border-[#e3a458]/35 bg-black/65 px-4 py-2 sm:px-5 sm:py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.7)] backdrop-blur-md">
              <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-white/70 select-none">
                00
              </span>

              {/* Progress Track */}
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/15 p-[1px] shadow-inner">
                <div
                  ref={barFillRef}
                  className="h-full w-0 rounded-full transition-all duration-75"
                  style={{
                    background:
                      "linear-gradient(90deg, #a26833 0%, #e3a458 65%, #faeade 100%)",
                    boxShadow: "0 0 12px rgba(227, 164, 88, 0.9)",
                  }}
                />
              </div>

              {/* Dynamic Live Counter */}
              <span
                ref={counterRef}
                className="w-12 text-right font-mono text-xs sm:text-sm font-extrabold tracking-wider text-[#f5d09d] select-none drop-shadow-sm"
              >
                00%
              </span>
            </div>
          </div>

          {/* Heritage & Location Tag */}
          <div className="preloader-location-tag mt-5 flex items-center justify-center gap-2 text-[10px] sm:text-[11px] font-bold tracking-[0.28em] uppercase text-milk/75">
            <span>Tacloban City</span>
            <span className="text-light-brown">✦</span>
            <span>Leyte</span>
            <span className="text-light-brown">✦</span>
            <span>Est. 2024</span>
          </div>
        </div>

        {/* Quiet Minimalist Skip Hint */}
        <p className="preloader-skip-hint pointer-events-none absolute bottom-5 sm:bottom-7 text-[9px] sm:text-[10px] tracking-[0.32em] uppercase text-milk/40 font-paragraph font-light select-none">
          Click anywhere to skip
        </p>
      </div>
    </dialog>
  );
};

export default Preloader;
