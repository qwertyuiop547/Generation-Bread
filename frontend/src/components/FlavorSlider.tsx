import { useGSAP } from "@gsap/react";
import { flavorList } from "../constants";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/all";
import { useRef } from "react";
import Image from "next/image";
import { smoothScroll } from "@/lib/scrollConfig";

gsap.registerPlugin(ScrollTrigger);

const FlavorSlider = () => {
  const sliderRef = useRef<null | HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add("(min-width: 1025px)", () => {
      const container = document.querySelector(".flavor-container") as HTMLElement | null;
      const flavorsTrack = sliderRef.current?.querySelector(".flavors") as HTMLElement | null;

      /** How far to drag so the last of all 6 cards fully enters the viewport */
      const measure = () => {
        if (!container) {
          return Math.max(0, (sliderRef.current?.scrollWidth ?? 0) - window.innerWidth);
        }

        const lastCard = flavorsTrack?.querySelector(
          ".flavor-item:last-child"
        ) as HTMLElement | null;

        if (lastCard) {
          const containerRect = container.getBoundingClientRect();
          const lastRect = lastCard.getBoundingClientRect();
          // Current overflow of last card past the right edge (+ padding)
          const overflow = lastRect.right - window.innerWidth + 48;
          // Undo any current translateX so we get the full travel distance
          const currentX = gsap.getProperty(container, "x") as number;
          return Math.max(0, overflow - currentX);
        }

        return Math.max(0, container.scrollWidth - window.innerWidth);
      };

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: ".flavor-section",
          start: "2% top",
          end: () => `+=${measure()}px`,
          scrub: true,
          pin: true,
          invalidateOnRefresh: true,
          ...smoothScroll,
        },
      });

      tl.to(".flavor-container", {
        x: () => -measure(),
        ease: "none",
        force3D: true,
      });

      // Recalc after images/fonts settle so all 6 cards are reachable
      const refresh = () => ScrollTrigger.refresh();
      requestAnimationFrame(refresh);
      window.addEventListener("load", refresh);
      const imgs = flavorsTrack?.querySelectorAll("img") ?? [];
      imgs.forEach((img) => {
        if (!img.complete) img.addEventListener("load", refresh, { once: true });
      });

      return () => {
        window.removeEventListener("load", refresh);
      };
    });

    const titleTl = gsap.timeline({
      scrollTrigger: {
        trigger: ".flavor-section",
        start: "top top",
        end: "bottom 80%",
        scrub: true,
        ...smoothScroll,
      },
    });

    titleTl
      .to(".first-text-split", {
        xPercent: -30,
        ease: "power1.inOut",
      })
      .to(
        ".flavor-text-scroll",
        {
          xPercent: -22,
          ease: "power1.inOut",
        },
        "<"
      )
      .to(
        ".second-text-split",
        {
          xPercent: -10,
          ease: "power1.inOut",
        },
        "<"
      );

    gsap.from(".flavors > div", {
      opacity: 0,
      y: 100,
      scale: 0.8,
      duration: 1,
      stagger: 0.2,
      ease: "power3.out",
      scrollTrigger: {
        trigger: ".flavor-section",
        start: "top 80%",
        ...smoothScroll,
      },
    });

    const flavors = document.querySelectorAll(".flavors > div");
    const cleanups: (() => void)[] = [];

    flavors.forEach((flavor) => {
      const photo = flavor.querySelector(".flavor-product") as HTMLElement;
      const title = flavor.querySelector("h1") as HTMLElement;

      const animateIn = () => {
        gsap.to(photo, {
          scale: 1.06,
          duration: 0.4,
          ease: "power2.out",
        });
        gsap.to(title, {
          scale: 1.05,
          y: -6,
          duration: 0.4,
          ease: "power2.out",
        });
      };

      const animateOut = () => {
        gsap.to(photo, {
          scale: 1,
          duration: 0.4,
          ease: "power2.out",
        });
        gsap.to(title, {
          scale: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out",
        });
      };

      flavor.addEventListener("mouseenter", animateIn, { passive: true });
      flavor.addEventListener("mouseleave", animateOut, { passive: true });
      flavor.addEventListener("touchstart", animateIn, { passive: true });
      flavor.addEventListener("touchend", animateOut, { passive: true });

      cleanups.push(() => {
        flavor.removeEventListener("mouseenter", animateIn);
        flavor.removeEventListener("mouseleave", animateOut);
        flavor.removeEventListener("touchstart", animateIn);
        flavor.removeEventListener("touchend", animateOut);
      });
    });

    return () => {
      cleanups.forEach((c) => c());
    };
  });

  return (
    <div ref={sliderRef} className="slider-wrapper">
      <div className="flavors">
        {flavorList.map((flavor) => (
          <div
            key={flavor.name}
            className={`flavor-item relative z-0 md:z-30 lg:w-[50vw] md:w-[90vw] w-[88vw] max-w-[22rem] md:max-w-none lg:max-w-none lg:h-[70vh] md:h-[50vh] h-[17.5rem] flex-none overflow-hidden rounded-3xl md:rounded-[2rem] shadow-lg shadow-dark-brown/15 ${flavor.rotation}`}
            style={{ backgroundColor: flavor.bgColor }}
          >
            <Image
              src={flavor.image}
              alt={flavor.name}
              fill
              sizes="(max-width: 768px) 88vw, (max-width: 1024px) 90vw, 50vw"
              className="flavor-product theme-lock-media object-cover object-[center_40%] scale-[1.12]"
              unoptimized
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
            <h1>{flavor.name}</h1>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlavorSlider;
