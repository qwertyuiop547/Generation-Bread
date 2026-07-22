"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/all";
import ClipPathTitle from "@/components/ClipPathTitle";
import { smoothScrollVars } from "@/lib/scrollConfig";
import { useTheme } from "@/context/ThemeContext";

gsap.registerPlugin(ScrollTrigger);

const WARM_STICKERS = [
  { title: "Fresh Bakes", color: "#faeade", bg: "#c88e64", borderColor: "#222123", className: "first-title" },
  { title: "Tacloban City", color: "#222123", bg: "#faeade", borderColor: "#222123", className: "second-title" },
  { title: "Dine & Pickup", color: "#faeade", bg: "#7F3B2D", borderColor: "#222123", className: "third-title" },
  { title: "Soft & Siksik", color: "#2E2D2F", bg: "#FED775", borderColor: "#222123", className: "fourth-title" },
] as const;

const SKY_STICKERS = [
  { title: "Fresh Bakes", color: "#f4f7fb", bg: "#1a3352", borderColor: "#0f172a", className: "first-title" },
  { title: "Tacloban City", color: "#1a3352", bg: "#f4f7fb", borderColor: "#1a3352", className: "second-title" },
  { title: "Dine & Pickup", color: "#f4f7fb", bg: "#b0793a", borderColor: "#0f172a", className: "third-title" },
  { title: "Soft & Siksik", color: "#1a3352", bg: "#e3a458", borderColor: "#1a3352", className: "fourth-title" },
] as const;

const BenefitSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const { theme } = useTheme();
  const stickers = theme === "sky" ? SKY_STICKERS : WARM_STICKERS;

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const titles = gsap.utils.toArray<HTMLElement>(
        section.querySelectorAll("[data-benefit-clip]")
      );
      const intro = section.querySelector(".benefit-intro");
      const outro = section.querySelector(".benefit-outro");

      if (!titles.length) return;

      if (prefersReduced) {
        gsap.set(titles, {
          clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          autoAlpha: 1,
          y: 0,
          clearProps: "transform",
        });
        gsap.set([intro, outro].filter(Boolean), { autoAlpha: 1, y: 0, clearProps: "transform" });
        return;
      }

      gsap.set(titles, {
        clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
        autoAlpha: 1,
      });
      gsap.set([intro, outro].filter(Boolean), { autoAlpha: 0, y: 24 });

      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: {
          trigger: section,
          start: "top 72%",
          end: "center 45%",
          scrub: 1,
          ...smoothScrollVars(section),
        },
      });

      if (intro) tl.to(intro, { autoAlpha: 1, y: 0, duration: 0.55 }, 0);

      titles.forEach((title, i) => {
        tl.to(
          title,
          {
            clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
            duration: 0.8,
            ease: "power1.inOut",
          },
          0.2 + i * 0.2
        );
      });

      if (outro) tl.to(outro, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.15");
    },
    { scope: sectionRef, dependencies: [theme] }
  );

  return (
    <section ref={sectionRef} className="benefit-section">
      <div className="container mx-auto pt-20">
        <div className="col-center">
          <p className="benefit-intro">
            Restaurant & bakery in Tacloban City — <br />
            fresh bakes, dine-in & pickup.
          </p>

          <div className="mt-12 sm:mt-16 md:mt-20 col-center benefit-titles">
            {stickers.map((item) => (
              <ClipPathTitle
                key={`${theme}-${item.title}`}
                title={item.title}
                color={item.color}
                bg={item.bg}
                className={item.className}
                borderColor={item.borderColor}
              />
            ))}
          </div>

          <div className="benefit-outro md:mt-0 mt-10">
            <p>Come taste the difference...</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BenefitSection;
