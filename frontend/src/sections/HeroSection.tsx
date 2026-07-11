"use client";

import Image from "next/image";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText, ScrollTrigger } from "gsap/all";
import { useCallback, useEffect, useRef, useState } from "react";
import { smoothScrollVars } from "@/lib/scrollConfig";
import { GB_EASE } from "@/lib/motion";
import { safePlay } from "@/lib/safeVideo";

gsap.registerPlugin(ScrollTrigger, SplitText);

const MOBILE_HERO_MQ = "(max-width: 768px)";
/** Generation Bread still — never use old Spylt preview art as fallback */
const HERO_STILL = "/images/generation-bread-cheese-roll.png";

interface HeroSectionProps {
  onLoaded: () => void;
  triggerAnimation: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onLoaded, triggerAnimation }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const desktopVideoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const [useMobileFallback, setUseMobileFallback] = useState(false);
  const loadedOnce = useRef(false);

  const markLoaded = useCallback(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    onLoaded();
  }, [onLoaded]);

  const getActiveVideo = useCallback(() => {
    const isMobile = window.matchMedia(MOBILE_HERO_MQ).matches;
    return isMobile ? mobileVideoRef.current : desktopVideoRef.current;
  }, []);

  const syncPlayback = useCallback(() => {
    const isMobile = window.matchMedia(MOBILE_HERO_MQ).matches;
    const active = isMobile ? mobileVideoRef.current : desktopVideoRef.current;
    const inactive = isMobile ? desktopVideoRef.current : mobileVideoRef.current;

    if (inactive) inactive.pause();
    if (active) safePlay(active);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      markLoaded();
    }, 3500);

    const video = getActiveVideo();
    if (video?.readyState && video.readyState >= 3) {
      markLoaded();
      clearTimeout(timer);
    }

    return () => clearTimeout(timer);
  }, [markLoaded, getActiveVideo]);

  useEffect(() => {
    const video = mobileVideoRef.current;
    if (!video) return;

    const isMobileViewport = window.matchMedia(MOBILE_HERO_MQ).matches;
    if (!isMobileViewport) return;

    // Only fall back if media never arrives. Being paused during the
    // preloader is normal and must NOT swap to a static image.
    const fallbackTimer = window.setTimeout(() => {
      if (video.readyState < 2) {
        setUseMobileFallback(true);
        markLoaded();
      }
    }, 5000);

    return () => window.clearTimeout(fallbackTimer);
  }, [markLoaded]);

  useEffect(() => {
    const container = desktopVideoRef.current?.closest(".hero-container");
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          syncPlayback();
        } else {
          desktopVideoRef.current?.pause();
          mobileVideoRef.current?.pause();
        }
      },
      { threshold: 0.1 }
    );

    syncPlayback();
    observer.observe(container);

    const mq = window.matchMedia(MOBILE_HERO_MQ);
    mq.addEventListener("change", syncPlayback);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncPlayback);
    };
  }, [syncPlayback]);

  useEffect(() => {
    if (!triggerAnimation) return;
    const video = getActiveVideo();
    if (!video) return;
    video.currentTime = 0;
    safePlay(video);
  }, [triggerAnimation, getActiveVideo]);

  useGSAP(
    () => {
      if (!triggerAnimation) return;

      const section = sectionRef.current;
      if (!section) return;

      const splits: InstanceType<typeof SplitText>[] = [];
      let cancelled = false;
      const scroll = smoothScrollVars(section);

      document.fonts.ready.then(() => {
        if (cancelled || !sectionRef.current) return;

        const content = section.querySelector(".hero-content") as HTMLElement | null;
        const titleEl = section.querySelector(".hero-title");
        const brandBlock = section.querySelector(".hero-text-scroll") as HTMLElement | null;
        const subcopy = section.querySelector(".hero-subcopy");
        const cta = section.querySelector(".hero-button");
        const heroContainer = section.querySelector(".hero-container");

        if (!content || !titleEl) return;

        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReduced) {
          gsap.set(content, { opacity: 1, y: 0 });
          if (brandBlock) {
            gsap.set(brandBlock, {
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
              rotate: -3,
            });
          }
          gsap.set([subcopy, cta].filter(Boolean), { autoAlpha: 1, y: 0, clearProps: "transform" });
          return;
        }

        let titleSplit: InstanceType<typeof SplitText> | null = null;
        try {
          titleSplit = SplitText.create(titleEl, { type: "chars" });
          if (cancelled) {
            titleSplit.revert();
            return;
          }
          splits.push(titleSplit);
        } catch {
          return;
        }

        gsap.set(content, { opacity: 1, y: 0 });
        gsap.set(titleSplit.chars, { yPercent: 100, autoAlpha: 0 });
        if (brandBlock) {
          gsap.set(brandBlock, {
            clipPath: "polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)",
            rotate: -3,
            transformOrigin: "center center",
          });
        }
        if (subcopy) gsap.set(subcopy, { autoAlpha: 0, y: 16 });
        if (cta) gsap.set(cta, { autoAlpha: 0, y: 12 });

        const tl = gsap.timeline({
          delay: 0.12,
          defaults: { ease: GB_EASE.out },
        });

        // 1) Title — calm char rise (readable, not flashy)
        tl.to(titleSplit.chars, {
          yPercent: 0,
          autoAlpha: 1,
          stagger: 0.022,
          duration: 0.65,
        });

        // 2) Brand sticker — soft center wipe (keeps CSS tilt)
        if (brandBlock) {
          tl.to(
            brandBlock,
            {
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
              duration: 0.85,
              ease: GB_EASE.inOut,
            },
            "-=0.3"
          );
        }

        // 3) Subcopy + CTA — invite to order
        if (subcopy) {
          tl.to(subcopy, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.2");
        }
        if (cta) {
          tl.to(cta, { autoAlpha: 1, y: 0, duration: 0.45 }, "-=0.25");
        }

        // Scroll: gentle peel into next section (not a dramatic 3D flip)
        if (heroContainer) {
          gsap.to(heroContainer, {
            rotate: 3,
            scale: 0.96,
            yPercent: 12,
            ease: "none",
            force3D: true,
            scrollTrigger: {
              trigger: heroContainer,
              start: "1% top",
              end: "bottom top",
              scrub: true,
              ...scroll,
            },
          });
        }
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
    { scope: sectionRef, dependencies: [triggerAnimation] }
  );

  return (
    <section ref={sectionRef} className="bg-main-bg">
      <div className="hero-container">
        {useMobileFallback ? (
          <Image
            src={HERO_STILL}
            alt="Generation Bread cheese roll"
            fill
            priority
            className="absolute inset-0 w-full h-full object-cover object-[center_40%] md:hidden"
          />
        ) : (
          <video
            ref={mobileVideoRef}
            src="/videos/herobg-mobile.mp4"
            muted
            loop
            playsInline
            preload="auto"
            poster={HERO_STILL}
            className="absolute inset-0 w-full h-full object-cover object-[center_35%] md:hidden"
            onError={() => {
              setUseMobileFallback(true);
              markLoaded();
            }}
            onCanPlayThrough={() => {
              markLoaded();
            }}
            onLoadedData={() => {
              markLoaded();
            }}
          />
        )}
        <video
          ref={desktopVideoRef}
          src="/videos/herobg.mp4"
          muted
          loop
          playsInline
          preload="auto"
          poster={HERO_STILL}
          className="absolute inset-0 hidden h-full w-full object-cover md:block"
          onCanPlayThrough={() => {
            markLoaded();
          }}
          onLoadedData={() => {
            markLoaded();
          }}
        />
        <div className="hero-media-scrim" aria-hidden />
        <div className="hero-content opacity-0">
          <div className="overflow-hidden">
            <h1 className="hero-title">Freaking Delicious</h1>
          </div>
          <div
            style={{
              clipPath: "polygon(50% 0, 50% 0, 50% 100%, 50% 100%)",
            }}
            className="hero-text-scroll"
          >
            <div className="hero-subtitle">
              <h1>Generation Bread</h1>
            </div>
          </div>
          <h2 className="hero-subcopy">
            Fresh bakes and bold flavors from Tacloban City.
          </h2>
          <a href="/scan" className="hero-button cursor-pointer hover:scale-105 transition-transform inline-block">
            <p>SCAN TO ORDER</p>
          </a>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
