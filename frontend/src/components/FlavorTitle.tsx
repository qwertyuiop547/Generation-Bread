"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/all";
import { smoothScrollVars } from "@/lib/scrollConfig";
import { GB_EASE } from "@/lib/motion";

const FlavorTitle = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const splits: InstanceType<typeof SplitText>[] = [];
      let cancelled = false;
      const scroll = smoothScrollVars(root);

      document.fonts.ready.then(() => {
        if (cancelled || !rootRef.current) return;

        try {
          const firstEl = root.querySelector(".first-text-split h1");
          const secondEl = root.querySelector(".second-text-split h1");
          const sticker = root.querySelector(".flavor-text-scroll");
          if (!firstEl || !secondEl) return;

          const firstTextSplit = SplitText.create(firstEl, { type: "chars" });
          const secondTextSplit = SplitText.create(secondEl, { type: "chars" });

          if (cancelled) {
            firstTextSplit.revert();
            secondTextSplit.revert();
            return;
          }

          splits.push(firstTextSplit, secondTextSplit);

          const flavorSection = root.closest(".flavor-section") || root;

          gsap.from(firstTextSplit.chars, {
            yPercent: 110,
            stagger: 0.018,
            ease: GB_EASE.out,
            duration: 0.7,
            scrollTrigger: {
              trigger: flavorSection,
              start: "top 35%",
              ...scroll,
            },
          });

          if (sticker) {
            gsap.fromTo(
              sticker,
              { clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)" },
              {
                clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                duration: 0.85,
                ease: GB_EASE.inOut,
                scrollTrigger: {
                  trigger: flavorSection,
                  start: "top 18%",
                  ...scroll,
                },
              }
            );
          }

          gsap.from(secondTextSplit.chars, {
            yPercent: 110,
            stagger: 0.018,
            ease: GB_EASE.out,
            duration: 0.7,
            scrollTrigger: {
              trigger: flavorSection,
              start: "top 8%",
              ...scroll,
            },
          });
        } catch {
          /* SplitText optional */
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
    { scope: rootRef }
  );

  return (
    <div ref={rootRef} className="flavor-title-block">
      <div className="overflow-hidden 2xl:py-0 first-text-split">
        <h1>every meal with</h1>
      </div>

      <div
        style={{
          clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
        }}
        className="flavor-text-scroll"
      >
        <div className="bg-mid-brown px-3 pb-2 pt-1.5 sm:px-4 sm:pb-3 sm:pt-2 2xl:px-5 2xl:pb-5 2xl:pt-0">
          <h2 className="text-milk">fresh baked</h2>
        </div>
      </div>

      <div className="overflow-hidden 2xl:py-0 second-text-split">
        <h1>from Generation Bread</h1>
      </div>
    </div>
  );
};

export default FlavorTitle;
