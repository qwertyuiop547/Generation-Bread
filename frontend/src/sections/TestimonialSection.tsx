import { useEffect, useRef } from "react";
import { card } from "../constants";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { smoothScroll } from "@/lib/scrollConfig";
import { safePause, safePlay } from "@/lib/safeVideo";

const TestimonialSection = () => {
  const vdRef = useRef<HTMLVideoElement[]>([]);
  const pinBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pinBox = pinBoxRef.current;
    const videos = document.querySelectorAll<HTMLVideoElement>(".testimonials-section .vd-card video");
    if (!videos.length) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            safePlay(video);
          } else {
            safePause(video);
          }
        });
      },
      {
        threshold: 0.55,
        root: isMobile && pinBox ? pinBox : null,
      }
    );

    videos.forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = pinBoxRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > dy && dx > 8) {
        e.stopPropagation();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add("(min-width: 769px)", () => {
      gsap.set(".testimonials-section", { marginTop: 0, clearProps: "marginTop" });

      gsap.from(".testimonials-section .testimonials-titles h1", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".testimonials-section",
          start: "top 80%",
          once: true,
          ...smoothScroll,
        },
      });

      gsap.from(".testimonials-section .vd-card", {
        y: 80,
        opacity: 0,
        scale: 0.92,
        duration: 0.7,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".testimonials-section .pin-box",
          start: "top 85%",
          once: true,
          ...smoothScroll,
        },
      });
    });

    mm.add("(max-width: 768px)", () => {
      gsap.set(".testimonials-section", { marginTop: 0, clearProps: "marginTop" });

      gsap.from(".testimonials-section .testimonials-titles h1", {
        y: 36,
        opacity: 0,
        duration: 0.7,
        stagger: 0.09,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".testimonials-section",
          start: "top 82%",
          once: true,
          ...smoothScroll,
        },
      });

      gsap.from(".testimonials-section .vd-card", {
        opacity: 0,
        scale: 0.96,
        duration: 0.55,
        stagger: 0.05,
        ease: "power2.out",
        clearProps: "transform",
        scrollTrigger: {
          trigger: ".testimonials-section .pin-box",
          start: "top 88%",
          once: true,
          ...smoothScroll,
        },
      });
    });

    return () => mm.revert();
  });

  const handlePlay = (index: number) => {
    safePlay(vdRef.current[index]);
  };

  const handlePause = (index: number) => {
    safePause(vdRef.current[index]);
  };

  return (
    <section className="testimonials-section">
      <div className="testimonials-titles">
        <h1 className="text-black first-title">Your</h1>
        <h1 className="text-light-brown sec-title">Daily</h1>
        <h1 className="text-black third-title">Craving</h1>
      </div>

      <p className="testimonials-swipe-hint md:hidden">Swipe to see all {card.length} cafe moments →</p>

      <div ref={pinBoxRef} className="pin-box testimonials-pin-box">
        {card.map((cardItem, index) => {
          const rot = cardItem.rotation.replace(/\brotate-z-/g, "md:rotate-z-");
          const ty = (cardItem.translation ?? "").replace(/\btranslate-y-/g, "md:translate-y-");
          return (
          <div
            key={index}
            className={`vd-card ${rot} ${ty}`}
            onMouseEnter={() => handlePlay(index)}
            onMouseLeave={() => handlePause(index)}
          >
            <video
              ref={(el) => {
                if (el) vdRef.current[index] = el;
              }}
              data-src={cardItem.src}
              poster={cardItem.img}
              preload="none"
              playsInline
              muted
              loop
              className="size-full object-cover"
            />
          </div>
          );
        })}
      </div>
    </section>
  );
};

export default TestimonialSection;
