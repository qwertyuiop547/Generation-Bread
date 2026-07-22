"use client";

import React, { useCallback, useEffect, useState } from "react";
import Preloader, { type PreloaderVariant } from "@/components/Preloader";

interface PageIntroProps {
  children: React.ReactNode;
  /** Wait for external asset (e.g. hero video) before finishing load phase */
  waitForLoad?: boolean;
  isLoaded?: boolean;
  onFinish?: () => void;
  variant?: PreloaderVariant;
  /** Skip preloader entirely (e.g. right after sign-in). */
  skip?: boolean;
  /** Override Preloader minimum duration */
  minDuration?: number;
}

export default function PageIntro({
  children,
  waitForLoad = false,
  isLoaded = true,
  onFinish,
  variant = "welcome",
  skip = false,
  minDuration,
}: PageIntroProps) {
  const [done, setDone] = useState(skip);
  const ready = waitForLoad ? isLoaded : true;

  const handleFinish = useCallback(() => {
    setDone(true);
    onFinish?.();
  }, [onFinish]);

  useEffect(() => {
    if (!skip) return;
    setDone(true);
    onFinish?.();
  }, [skip, onFinish]);

  // Absolute failsafe: never leave the page inert / unclickable
  useEffect(() => {
    if (done) return;
    const failsafe = window.setTimeout(() => setDone(true), 8000);
    return () => window.clearTimeout(failsafe);
  }, [done]);

  useEffect(() => {
    if (done) return;

    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [done]);

  return (
    <>
      {!done && (
        <Preloader
          variant={variant}
          isLoaded={ready}
          onFinish={handleFinish}
          minDuration={minDuration}
        />
      )}
      <div
        className={
          done
            ? "opacity-100 transition-opacity duration-300 ease-out"
            : "pointer-events-none absolute left-0 top-0 h-0 w-full overflow-hidden opacity-0"
        }
        aria-hidden={!done}
        {...(!done ? { inert: true } : {})}
      >
        {children}
      </div>
    </>
  );
}
