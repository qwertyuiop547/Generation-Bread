"use client";
import Navbar from "@/components/Navbar";
import HeroSection from "@/sections/HeroSection";
import gsap from "gsap";
import { ScrollTrigger, ScrollSmoother } from "gsap/all";
import { useGSAP } from "@gsap/react";
import MessageSection from "@/sections/MessageSection";
import NutritionSection from "@/sections/NutritionSection";
import FlavorSection from "@/sections/FlavorSection";
import BenefitSection from "@/sections/BenefitSection";
import VideoPin from "@/components/VideoPin";
import TestimonialSection from "@/sections/TestimonialSection";
import FooterSection from "@/sections/FooterSection";
import { useState, useEffect, useRef } from "react";
import PageIntro from "@/components/PageIntro";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { consumeLogoutGoodbye } from "@/lib/logoutTransition";
import type { PreloaderVariant } from "@/components/Preloader";

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

export default function Home() {
  const router = useRouter();
  const { isLoggedIn, isAuthLoading } = useAuth();
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  // Resolve goodbye flag only after mount — sessionStorage differs on SSR vs client.
  const [clientReady, setClientReady] = useState(false);
  const [introVariant, setIntroVariant] = useState<PreloaderVariant>("welcome");
  const smootherRef = useRef<ScrollSmoother | null>(null);

  useEffect(() => {
    setIntroVariant(consumeLogoutGoodbye() ? "goodbye" : "welcome");
    setClientReady(true);
  }, []);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!isAuthLoading && isLoggedIn) {
      router.replace("/dashboard");
    }
  }, [isAuthLoading, isLoggedIn, router]);

  const scrollSetupKey = `${isAuthLoading}:${isLoggedIn}:${isPreloaderDone}`;

  useGSAP(
    () => {
      if (isAuthLoading || isLoggedIn || !isPreloaderDone) return;

      if (!smootherRef.current) {
        smootherRef.current = ScrollSmoother.create({
          wrapper: "#smooth-wrapper",
          content: "#smooth-content",
          smooth: 1,
          effects: true,
          normalizeScroll: {
            allowNestedScroll: ".testimonials-pin-box",
            debounce: true,
          } as any,
          smoothTouch: 0.1,
        });
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => ScrollTrigger.refresh());
      });
    },
    { dependencies: [scrollSetupKey] }
  );

  useEffect(() => {
    if (isAuthLoading || isLoggedIn || !isPreloaderDone) return;

    const refresh = () => ScrollTrigger.refresh();
    const timer = window.setTimeout(refresh, 200);
    window.addEventListener("load", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [isPreloaderDone, isAuthLoading, isLoggedIn]);

  useEffect(() => {
    return () => {
      smootherRef.current?.kill();
      smootherRef.current = null;
    };
  }, []);

  // Same shell on server + first client paint to avoid hydration mismatch.
  if (!clientReady) {
    return <main className="min-h-screen bg-black" aria-busy="true" />;
  }

  // Guests: mount home immediately so mobile hero video can preload.
  // Possible session: keep a blank shell until auth resolves, then redirect.
  if (isAuthLoading) {
    const maybeSession = !!(
      localStorage.getItem("spylt_user") ||
      localStorage.getItem("spylt_access_token")
    );
    if (maybeSession) {
      return <main className="min-h-screen bg-dark-brown" />;
    }
  }

  if (!isAuthLoading && isLoggedIn) {
    return null;
  }

  return (
    <main>
      <PageIntro
        variant={introVariant}
        waitForLoad={introVariant === "welcome"}
        isLoaded={isVideoLoaded}
        onFinish={() => setIsPreloaderDone(true)}
      >
      <div className={!isPreloaderDone ? "h-screen overflow-hidden opacity-0" : "opacity-100 transition-opacity duration-300 ease-out"}>
        <Navbar />
        <div id="smooth-wrapper">
          <div id="smooth-content">
            <HeroSection 
              onLoaded={() => setIsVideoLoaded(true)} 
              triggerAnimation={isPreloaderDone} 
            />
            {isPreloaderDone && (
              <>
                <MessageSection />
                <FlavorSection />
                <NutritionSection />
                <div>
                  <BenefitSection />
                  <VideoPin />
                  <TestimonialSection />
                </div>
                <FooterSection />
              </>
            )}
          </div>
        </div>
      </div>
      </PageIntro>
    </main>
  );
}

