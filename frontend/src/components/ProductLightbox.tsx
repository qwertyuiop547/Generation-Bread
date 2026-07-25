"use client";

import React, { useEffect } from "react";
import Image from "next/image";

type ProductLightboxProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

/** Full-screen product photo viewer. Esc / backdrop / ✕ to close. */
export default function ProductLightbox({ src, alt, open, onClose }: ProductLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col items-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-1 right-0 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-milk/95 text-lg font-bold text-dark-brown shadow-lg transition-colors hover:bg-white sm:-right-2 sm:-top-2"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl sm:rounded-3xl">
          <div className="relative aspect-square w-full sm:aspect-[4/3]">
            <Image
              src={src}
              alt={alt}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-contain"
              priority
              unoptimized
            />
          </div>
        </div>
        <p className="mt-3 max-w-full truncate px-2 text-center text-sm font-bold uppercase tracking-wide text-milk/90">
          {alt}
        </p>
      </div>
    </div>
  );
}
