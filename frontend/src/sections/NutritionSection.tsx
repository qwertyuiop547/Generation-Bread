"use client";

import { useGSAP } from "@gsap/react";
import { SplitText, ScrollTrigger } from "gsap/all";
import gsap from "gsap";
import Image from "next/image";
import { useRef } from "react";
import { smoothScrollVars } from "@/lib/scrollConfig";
import { GB_EASE } from "@/lib/motion";

gsap.registerPlugin(ScrollTrigger, SplitText);

const HIGHLIGHTS = [
  { label: "Ube Color", value: "Bold" },
  { label: "Soft & Warm", value: "Perfect" },
  { label: "Melty Cheese", value: "Loaded" },
  { label: "Tacloban City", value: "Local" },
  { label: "Fresh Daily", value: "Baked" },
];

const NutritionSection = () => {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      const splits: InstanceType<typeof SplitText>[] = [];
      let cancelled = false;
      const scroll = smoothScrollVars(section);

      document.fonts.ready.then(() => {
        if (cancelled || !sectionRef.current) return;

        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const isMobile = window.matchMedia("(max-width: 767px)").matches;

        const titleLines = section.querySelectorAll(".nutrition-title-line");
        const pandesal = section.querySelector(".nutrition-text-scroll") as HTMLElement | null;
        const productImg = section.querySelector(".nutrition-product-img");
        const highlights = section.querySelectorAll(".nutrition-highlight-item");
        const mobileDesc = section.querySelector(".nutrition-desc--mobile");
        const desktopDesc = section.querySelector(".nutrition-desc--desktop");

        let paragraphSplit: InstanceType<typeof SplitText> | null = null;

        try {
          if (!isMobile && desktopDesc) {
            paragraphSplit = SplitText.create(desktopDesc, {
              type: "words, lines",
              linesClass: "paragraph-line",
            });
            if (cancelled) {
              paragraphSplit.revert();
              return;
            }
            splits.push(paragraphSplit);
          }
        } catch {
          // SplitText optional
        }

        if (cancelled) return;

        if (prefersReduced) {
          gsap.set([titleLines, pandesal, productImg, highlights, mobileDesc].filter(Boolean), {
            clearProps: "all",
          });
          if (pandesal) {
            gsap.set(pandesal, {
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
              autoAlpha: 1,
            });
          }
          return;
        }

        // --- initial states (calm, product-first) ---
        gsap.set(titleLines, { yPercent: 100 });
        if (pandesal) {
          gsap.set(pandesal, {
            clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
            rotate: -3,
          });
        }
        if (productImg) {
          gsap.set(productImg, { autoAlpha: 0, y: 28, scale: 0.96 });
        }
        gsap.set(highlights, { autoAlpha: 0 });
        if (mobileDesc) gsap.set(mobileDesc, { autoAlpha: 0, y: 12 });
        if (paragraphSplit?.words?.length) {
          gsap.set(paragraphSplit.words, { yPercent: 70, autoAlpha: 0 });
        } else if (desktopDesc && !isMobile) {
          gsap.set(desktopDesc, { autoAlpha: 0, y: 12 });
        }

        const tl = gsap.timeline({
          defaults: { ease: GB_EASE.out },
          scrollTrigger: {
            trigger: section,
            start: "top 72%",
            once: true,
            ...scroll,
          },
        });

        // Title → sticker → copy → product → highlights
        tl.to(titleLines, {
          yPercent: 0,
          stagger: 0.1,
          duration: 0.7,
        });

        if (pandesal) {
          tl.to(
            pandesal,
            {
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
              duration: 0.8,
              ease: GB_EASE.inOut,
            },
            "-=0.4"
          );
        }

        if (paragraphSplit?.words?.length) {
          tl.to(
            paragraphSplit.words,
            {
              yPercent: 0,
              autoAlpha: 1,
              duration: 0.55,
              stagger: 0.014,
            },
            "-=0.4"
          );
        } else if (desktopDesc && !isMobile) {
          tl.to(desktopDesc, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.35");
        }

        if (productImg) {
          tl.to(
            productImg,
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.85,
            },
            "-=0.55"
          );
        }

        if (mobileDesc) {
          tl.to(mobileDesc, { autoAlpha: 1, y: 0, duration: 0.45 }, "-=0.35");
        }

        tl.to(
          highlights,
          {
            autoAlpha: 1,
            duration: 0.4,
            stagger: 0.06,
            clearProps: "opacity",
          },
          "-=0.25"
        );

        // Light hover only — no looping float (distracts from the product)
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          highlights.forEach((item) => {
            const animateIn = () => {
              gsap.to(item, { scale: 1.03, duration: 0.25, ease: GB_EASE.out });
            };
            const animateOut = () => {
              gsap.to(item, {
                scale: 1,
                duration: 0.25,
                ease: GB_EASE.out,
                clearProps: "transform",
              });
            };
            item.addEventListener("mouseenter", animateIn, { passive: true });
            item.addEventListener("mouseleave", animateOut, { passive: true });
          });
        }

        ScrollTrigger.refresh();
      });

      return () => {
        cancelled = true;
        splits.forEach((s) => {
          try {
            s.revert();
          } catch {
            /* ignore */
          }
        });
      };
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="nutrition-section nutrition-section--bestseller">
      <Image
        src="/images/slider-dip.webp"
        width={2000}
        height={2000}
        alt=""
        aria-hidden
        className="w-full object-cover pointer-events-none select-none theme-lock-media"
      />

      <div className="nutrition-bestseller-layout">
        <div className="nutrition-bestseller-hero">
          <div className="nutrition-bestseller-copy">
            <div className="nutrition-title-wrap">
              <div className="overflow-hidden">
                <span className="nutrition-title-line block">Ube</span>
              </div>
              <div className="overflow-hidden">
                <span className="nutrition-title-line block">Cheese</span>
              </div>
            </div>

            <div className="nutrition-text-scroll inline-block w-fit">
              <div className="bg-mid-brown px-4 md:px-6 py-2 md:py-3">
                <h2 className="text-milk-yellow text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight whitespace-nowrap">
                  Pandesal
                </h2>
              </div>
            </div>

            <p className="nutrition-desc nutrition-desc--desktop font-paragraph text-dark-brown text-base sm:text-lg md:text-xl max-w-md leading-relaxed">
              Soft ube pandesal with that melty cheese pull — purple, warm, and baked fresh daily at Generation Bread, Tacloban City.
            </p>
          </div>

          <div className="nutrition-product-wrap">
            <Image
              src="/images/generation-bread-ube-cheese-pandesal.png"
              width={1200}
              height={1200}
              alt="Generation Bread ube cheese pandesal"
              className="nutrition-product-img theme-lock-media"
              loading="lazy"
              sizes="(max-width: 768px) 90vw, 480px"
              unoptimized
            />
          </div>

          <p className="nutrition-desc nutrition-desc--mobile font-paragraph text-dark-brown text-base leading-relaxed">
            Soft ube pandesal with that melty cheese pull — purple, warm, and baked fresh daily at Generation Bread, Tacloban City.
          </p>
        </div>

        <div className="nutrition-highlights">
          <div className="nutrition-highlights-track">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="nutrition-highlight-item">
                <p className="nutrition-highlight-label">{item.label}</p>
                <p className="nutrition-highlight-value">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default NutritionSection;
