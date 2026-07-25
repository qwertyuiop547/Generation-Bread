"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ProductLightboxProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

/** Full-screen product photo viewer. Esc / backdrop / ✕ to close. */
export default function ProductLightbox({ src, alt, open, onClose }: ProductLightboxProps) {
  const [mounted, setMounted] = useState(false);
  /** Prevent the same click that opened the lightbox from immediately closing it. */
  const [closeArmed, setCloseArmed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCloseArmed(false);
      return;
    }

    setCloseArmed(false);
    const arm = window.setTimeout(() => setCloseArmed(true), 180);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(arm);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open || !src) return null;

  const handleClose = () => {
    if (!closeArmed) return;
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-3 py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-label="Close"
        onClick={handleClose}
      />
      <div
        className="relative z-10 flex w-full max-w-3xl flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute -top-1 right-0 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-milk/95 text-lg font-bold text-dark-brown shadow-lg transition-colors hover:bg-white sm:-right-2 sm:-top-2"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Natural aspect — no forced square that stretches/crops on tall phones */}
        <div className="flex w-full items-center justify-center overflow-hidden rounded-2xl bg-black shadow-2xl sm:rounded-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="h-auto max-h-[min(72dvh,780px)] w-auto max-w-full object-contain"
            draggable={false}
          />
        </div>

        <p className="mt-3 max-w-full truncate px-2 text-center text-sm font-bold uppercase tracking-wide text-milk/90">
          {alt}
        </p>
      </div>
    </div>,
    document.body
  );
}
