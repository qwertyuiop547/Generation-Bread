"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

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
  // Preloader is a brand splash with food photography — always warm café colors,
  // never follow Sky theme tokens (those turn the glow/accents neon blue).
  const tc = {
    lightBrown: "#e3a458",
    redBrown: "#7f3b2d",
    midBrown: "#a26833",
    milk: "#faeade",
  };

  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);
  const barGlowRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLParagraphElement>(null);
  const progressRef = useRef({ value: 0 });
  const loadTweenRef = useRef<gsap.core.Tween | null>(null);
  const exitRan = useRef(false);
  const [finished, setFinished] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);

  const readyToExit = isLoaded && minTimeDone;

  const updateProgressVisual = (value: number) => {
    const pct = Math.min(100, Math.max(0, value));
    if (barFillRef.current) {
      barFillRef.current.style.width = `${pct}%`;
    }
    if (barGlowRef.current) {
      barGlowRef.current.style.left = `calc(${pct}% - 6px)`;
      barGlowRef.current.style.opacity = pct > 2 && pct < 98 ? "1" : "0";
    }
    if (glowRef.current) {
      const intensity = isGoodbye
        ? 0.22 + (pct / 100) * 0.2
        : 0.18 + (pct / 100) * 0.32;
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
      if (!brandRef.current || !tagRef.current) return;

      const words = brandRef.current.querySelectorAll(".preloader-word");
      const bar = brandRef.current.querySelector(".preloader-bar-track");
      const eyebrow = brandRef.current.querySelector(".preloader-eyebrow");
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      if (reduceMotion) {
        gsap.set([words, tagRef.current, bar, eyebrow, productRef.current], {
          opacity: 1,
          y: 0,
          yPercent: 0,
          scale: 1,
        });
        progressRef.current.value = isGoodbye ? 100 : 90;
        updateProgressVisual(progressRef.current.value);
        return;
      }

      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });

      if (isGoodbye) {
        intro
          .fromTo(
            productRef.current,
            { scale: 1.06, opacity: 0 },
            { scale: 1, opacity: 1, duration: 1.15, ease: "power2.out" },
            0
          )
          .fromTo(
            eyebrow,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.5 },
            0.2
          )
          .fromTo(
            words,
            { yPercent: 100, opacity: 0 },
            { yPercent: 0, opacity: 1, duration: 0.75, stagger: 0.14 },
            0.28
          )
          .fromTo(
            tagRef.current,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.5 },
            "-=0.2"
          )
          .fromTo(
            bar,
            { scaleX: 0, opacity: 0 },
            { scaleX: 1, opacity: 1, duration: 0.55, transformOrigin: "center center" },
            "-=0.3"
          );

        gsap.to(productRef.current, {
          scale: 1.03,
          duration: duration / 1000 + 0.4,
          ease: "sine.inOut",
        });

        loadTweenRef.current = gsap.fromTo(
          progressRef.current,
          { value: 0 },
          {
            value: 100,
            duration: duration / 1000,
            ease: "power1.inOut",
            onUpdate: () => updateProgressVisual(progressRef.current.value),
          }
        );
      } else {
        intro
          .fromTo(
            productRef.current,
            { scale: 1.08, opacity: 0 },
            { scale: 1, opacity: 1, duration: 1.1, ease: "power2.out" },
            0
          )
          .fromTo(
            eyebrow,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.45 },
            0.15
          )
          .fromTo(
            words,
            { yPercent: 110, opacity: 0 },
            { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.12 },
            0.2
          )
          .fromTo(
            tagRef.current,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.45 },
            "-=0.25"
          )
          .fromTo(
            bar,
            { scaleX: 0, opacity: 0 },
            { scaleX: 1, opacity: 1, duration: 0.5, transformOrigin: "left center" },
            "-=0.35"
          );

        gsap.to(productRef.current, {
          scale: 1.04,
          duration: duration / 1000 + 0.6,
          ease: "sine.inOut",
        });

        loadTweenRef.current = gsap.fromTo(
          progressRef.current,
          { value: 0 },
          {
            value: 90,
            duration: duration / 1000,
            ease: "power1.inOut",
            onUpdate: () => updateProgressVisual(progressRef.current.value),
          }
        );
      }
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

      if (isGoodbye) {
        exitTl
          .to(progressRef.current, {
            value: 100,
            duration: 0.25,
            ease: "power2.out",
            onUpdate: () => updateProgressVisual(progressRef.current.value),
          })
          .to(
            tagRef.current,
            { opacity: 0, y: 10, duration: 0.35, ease: "power2.in" },
            "-=0.05"
          )
          .to(
            brandRef.current,
            {
              scale: 0.96,
              opacity: 0,
              filter: "blur(8px)",
              duration: 0.6,
              ease: "power2.inOut",
            },
            "-=0.1"
          )
          .to(
            productRef.current,
            { opacity: 0, scale: 1.08, duration: 0.55, ease: "power2.in" },
            "-=0.45"
          )
          .to(
            panelRef.current,
            {
              yPercent: 100,
              duration: 0.85,
              ease: "power4.inOut",
            },
            "-=0.3"
          );
      } else {
        exitTl
          .to(progressRef.current, {
            value: 100,
            duration: 0.4,
            ease: "power2.out",
            onUpdate: () => updateProgressVisual(progressRef.current.value),
          })
          .to(
            tagRef.current,
            { opacity: 0, y: -8, duration: 0.3, ease: "power2.in" },
            "-=0.1"
          )
          .to(
            brandRef.current,
            {
              scale: 1.08,
              opacity: 0,
              filter: "blur(6px)",
              duration: 0.55,
              ease: "power2.inOut",
            },
            "-=0.05"
          )
          .to(
            productRef.current,
            { opacity: 0, scale: 1.1, duration: 0.5, ease: "power2.in" },
            "-=0.45"
          )
          .to(
            panelRef.current,
            {
              yPercent: -100,
              duration: 0.8,
              ease: "power4.inOut",
            },
            "-=0.25"
          );
      }
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
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden will-change-transform"
        style={{ backgroundColor: "#000000" }}
        role="status"
        aria-live="polite"
      >
        <div
          ref={productRef}
          className="pointer-events-none absolute inset-0 opacity-0 will-change-transform"
        >
          <Image
            src="/images/generation-bread-ube-cheese-pandesal.png"
            alt=""
            width={1200}
            height={1200}
            priority
            fetchPriority="high"
            unoptimized
            className={`absolute inset-0 h-full w-full object-cover scale-100 theme-lock-media ${
              isGoodbye
                ? "object-center brightness-[0.95] saturate-[1.05]"
                : "object-center brightness-[1.05] saturate-[1.1]"
            }`}
          />
          {/* Literal black scrims — never use bg-black (Sky remaps --color-black to navy). */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: isGoodbye ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.38)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.55) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% 48%, rgba(0,0,0,0.55) 0%, transparent 70%)",
            }}
          />
        </div>

        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 opacity-[0.22] transition-opacity duration-300"
          style={{
            background: isGoodbye
              ? `radial-gradient(ellipse 58% 42% at 50% 46%, ${tc.milk}2e 0%, ${tc.lightBrown}38 35%, transparent 72%)`
              : `radial-gradient(ellipse 70% 55% at 50% 48%, ${tc.lightBrown}47 0%, ${tc.redBrown}1f 48%, transparent 75%)`,
          }}
        />

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div
          ref={brandRef}
          className="relative z-10 flex w-full max-w-lg flex-col items-center px-8 will-change-transform"
        >
          {isGoodbye ? (
            <>
              <p
                className="preloader-eyebrow mb-6 font-paragraph text-[0.65rem] sm:text-xs uppercase tracking-[0.42em]"
                style={{ color: "rgba(250,234,222,0.7)" }}
              >
                Generation Bread
              </p>

              <h1 className="text-center font-bold uppercase leading-[0.88] tracking-[-0.03em]">
                <span className="block overflow-hidden">
                  <span
                    className="preloader-word inline-block text-[clamp(2.6rem,10vw,5rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
                    style={{ color: tc.milk }}
                  >
                    Thank
                  </span>
                </span>
                <span className="mt-1 block overflow-hidden">
                  <span
                    className="preloader-word inline-block text-[clamp(2.6rem,10vw,5rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
                    style={{ color: tc.lightBrown }}
                  >
                    You
                  </span>
                </span>
              </h1>

              <div
                className="preloader-bar-track relative mt-9 h-[2px] w-full max-w-[11rem] origin-center overflow-visible rounded-full"
                style={{ backgroundColor: "rgba(250,234,222,0.12)" }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div
                    ref={barFillRef}
                    className="h-full w-0 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${tc.lightBrown}, transparent)`,
                    }}
                  />
                </div>
                <div
                  ref={barGlowRef}
                  className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full opacity-0"
                  style={{
                    left: 0,
                    backgroundColor: tc.milk,
                    boxShadow: `0 0 10px 3px ${tc.lightBrown}a6`,
                  }}
                />
              </div>

              <p
                ref={tagRef}
                className="mt-8 max-w-[16rem] text-center font-paragraph text-sm leading-relaxed tracking-wide sm:max-w-xs sm:text-base"
                style={{ color: "rgba(250,234,222,0.55)" }}
              >
                Salamat for visiting.
                <span className="mt-1.5 block" style={{ color: "rgba(250,234,222,0.4)" }}>
                  Come back hungry · Tacloban City
                </span>
              </p>
            </>
          ) : (
            <>
              <p
                className="preloader-eyebrow mb-5 font-paragraph text-[0.65rem] sm:text-xs uppercase tracking-[0.45em]"
                style={{ color: "rgba(250,234,222,0.65)" }}
              >
                Cheese loaded
              </p>

              <h1 className="text-center font-bold uppercase leading-[0.88] tracking-[-0.03em]">
                <span className="block overflow-hidden">
                  <span
                    className="preloader-word inline-block text-[clamp(2.4rem,9vw,4.75rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
                    style={{ color: tc.milk }}
                  >
                    Generation
                  </span>
                </span>
                <span className="mt-1 block overflow-hidden">
                  <span
                    className="preloader-word inline-block text-[clamp(2.4rem,9vw,4.75rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
                    style={{ color: tc.lightBrown }}
                  >
                    Bread
                  </span>
                </span>
              </h1>

              <div
                className="preloader-bar-track relative mt-9 h-[3px] w-full max-w-[15rem] origin-left overflow-visible rounded-full"
                style={{ backgroundColor: "rgba(250,234,222,0.12)" }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div
                    ref={barFillRef}
                    className="h-full w-0 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${tc.midBrown}, ${tc.lightBrown}, ${tc.milk})`,
                    }}
                  />
                </div>
                <div
                  ref={barGlowRef}
                  className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full opacity-0"
                  style={{
                    left: 0,
                    backgroundColor: tc.milk,
                    boxShadow: `0 0 12px 4px ${tc.lightBrown}bf`,
                  }}
                />
              </div>

              <p
                ref={tagRef}
                className="mt-7 font-paragraph text-center text-sm tracking-wide"
                style={{ color: "rgba(250,234,222,0.5)" }}
              >
                Tacloban City
              </p>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
};

export default Preloader;
