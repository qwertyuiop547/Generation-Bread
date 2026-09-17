"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/all";
import { useRef, useEffect } from "react";

import { smoothScrollVars } from "@/lib/scrollConfig";
import { safePlay } from "@/lib/safeVideo";

gsap.registerPlugin(ScrollTrigger);

const VideoPinSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          safePlay(video);
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(video);
    safePlay(video);
    return () => observer.disconnect();
  }, []);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const box = section?.querySelector(".video-box") as HTMLElement | null;
      if (!section || !box) return;

      let mm: gsap.MatchMedia | null = null;
      let armed = false;

      const killSectionTriggers = () => {
        ScrollTrigger.getAll().forEach((t) => {
          if (t.trigger === section) t.kill(true);
        });
      };

      const createAnimation = () => {
        if (armed) return;
        armed = true;

        // Let ScrollTrigger restore any previous pin — never move nodes by hand
        // (manual insertBefore fights React and causes NotFoundError).
        killSectionTriggers();
        ScrollTrigger.refresh();

        const scroll = smoothScrollVars(section);
        mm = gsap.matchMedia();

        mm.add("(max-width: 768px)", () => {
          gsap.set(box, {
            clipPath: "circle(12% at 50% 50%)",
            opacity: 1,
          });

          gsap.to(box, {
            clipPath: "circle(100% at 50% 50%)",
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top 75%",
              end: "top 15%",
              scrub: 0.8,
              ...scroll,
            },
          });
        });

        mm.add("(min-width: 769px)", () => {
          gsap.set(box, {
            clipPath: "circle(16% at 50% 50%)",
          });

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "+=100%",
              scrub: true,
              pin: true,
              pinSpacing: true,
              anticipatePin: 1,
              ...scroll,
            },
          });

          tl.to(box, {
            clipPath: "circle(100% at 50% 50%)",
            ease: "none",
          });
        });

        ScrollTrigger.refresh();
      };

      gsap.set(box, { clipPath: "circle(16% at 50% 50%)" });

      // Create pin only when near viewport so layout above has settled
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            createAnimation();
            io.disconnect();
          }
        },
        { root: null, rootMargin: "120% 0px 120% 0px", threshold: 0 }
      );
      io.observe(section);

      return () => {
        io.disconnect();
        mm?.revert();
        killSectionTriggers();
        armed = false;
      };
    },
    { scope: sectionRef, dependencies: [], revertOnUpdate: true }
  );

  return (
    <section ref={sectionRef} className="vd-pin-section">
      <div className="video-box">
        <video
          ref={videoRef}
          src="/videos/pinvideo.mp4"
          playsInline
          muted
          loop
          preload="auto"
        />
      </div>
    </section>
  );
};

export default VideoPinSection;
