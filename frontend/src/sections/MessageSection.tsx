"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText, ScrollTrigger } from "gsap/all";
import { smoothScrollVars } from "@/lib/scrollConfig";
import { GB_EASE } from "@/lib/motion";

gsap.registerPlugin(ScrollTrigger, SplitText);

const MessageSection = () => {
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
        const firstEl = section.querySelector(".first-message");
        const secondEl = section.querySelector(".second-message");
        const fuelUp = section.querySelector(".msg-text-scroll") as HTMLElement | null;
        const paragraphEl = section.querySelector(".message-content-copy");

        if (!firstEl || !secondEl) return;

        try {
          const firstMsgSplit = SplitText.create(firstEl, { type: "words" });
          const secMsgSplit = SplitText.create(secondEl, { type: "words" });
          const paragraphSplit = paragraphEl
            ? SplitText.create(paragraphEl, {
                type: "words, lines",
                linesClass: "paragraph-line",
              })
            : null;

          if (cancelled) {
            firstMsgSplit.revert();
            secMsgSplit.revert();
            paragraphSplit?.revert();
            return;
          }

          splits.push(firstMsgSplit, secMsgSplit);
          if (paragraphSplit) splits.push(paragraphSplit);

          const milk = getComputedStyle(document.documentElement)
            .getPropertyValue("--color-milk")
            .trim() || "#faeade";
          const milkFaint =
            milk.startsWith("#") && milk.length === 7 ? `${milk}10` : milk;

          if (prefersReduced) {
            gsap.set([firstMsgSplit.words, secMsgSplit.words], { color: milk });
            if (fuelUp) {
              gsap.set(fuelUp, {
                clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                rotate: 3,
              });
            }
            if (paragraphSplit?.words) gsap.set(paragraphSplit.words, { clearProps: "all" });
            return;
          }

          gsap.set(firstMsgSplit.words, { color: milkFaint });
          gsap.set(secMsgSplit.words, { color: milkFaint });

          if (fuelUp) {
            gsap.set(fuelUp, {
              clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
              rotate: 3,
            });
          }

          if (paragraphSplit?.words?.length) {
            gsap.set(paragraphSplit.words, { yPercent: 80, autoAlpha: 0 });
          }

          // Soft sticker reveal — bakery label feel
          const enter = gsap.timeline({
            defaults: { ease: GB_EASE.out },
            scrollTrigger: {
              trigger: section,
              start: "top 70%",
              once: true,
              ...scroll,
            },
          });

          if (fuelUp) {
            enter.to(fuelUp, {
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
              duration: 0.85,
              ease: GB_EASE.inOut,
            });
          }

          if (paragraphSplit?.words?.length) {
            enter.to(
              paragraphSplit.words,
              {
                yPercent: 0,
                autoAlpha: 1,
                duration: 0.6,
                stagger: 0.01,
              },
              "-=0.3"
            );
          }

          // Storytelling scrub — words warm up as you read
          gsap.to(firstMsgSplit.words, {
            color: milk,
            ease: "none",
            stagger: 0.3,
            scrollTrigger: {
              trigger: section,
              start: "top 55%",
              end: "center 42%",
              scrub: 0.8,
              ...scroll,
            },
          });

          gsap.to(secMsgSplit.words, {
            color: milk,
            ease: "none",
            stagger: 0.25,
            scrollTrigger: {
              trigger: secondEl,
              start: "top 72%",
              end: "bottom 48%",
              scrub: 0.8,
              ...scroll,
            },
          });

          ScrollTrigger.refresh();
        } catch {
          // SplitText optional
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
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="message-content">
      <div className="container mx-auto flex-center py-12 sm:py-16 md:py-24 relative">
        <div className="w-full h-full">
          <div className="msg-wrapper">
            <h1 className="first-message">Slow down, take a warm bite, and</h1>

            <div
              style={{
                clipPath: "polygon(0 0, 0 0, 0 100%, 0% 100%)",
              }}
              className="msg-text-scroll"
            >
              <div className="bg-light-brown">
                <h2>Warm Up</h2>
              </div>
            </div>

            <h1 className="second-message">every day with soft bakes from Generation Bread</h1>
          </div>

          <div className="flex-center md:mt-20 mt-6">
            <div className="max-w-md px-10 flex-center overflow-hidden">
              <p className="message-content-copy">
                From melty cheese rolls to ube pandesal and matcha — Generation Bread brings Tacloban City comfort,
                baked fresh and served with heart.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MessageSection;
