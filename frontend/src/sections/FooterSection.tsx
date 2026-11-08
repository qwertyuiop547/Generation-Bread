"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

const FooterSection = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="footer-section relative overflow-hidden bg-[#140e0b] text-milk">
      {/* 
        Unified Ambient Bakery Glow across the entire footer.
        Spans from the very top (under the milk dips) down to the bottom copyright bar,
        eliminating any horizontal seam or color mismatch.
      */}
      <div
        className="pointer-events-none absolute inset-0 opacity-75"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 50% 32%, rgba(227, 164, 88, 0.22) 0%, rgba(162, 104, 51, 0.08) 48%, transparent 78%)",
        }}
        aria-hidden
      />

      {/* Signature Cream Dip Transition — smoothly blurs into the unified dark background */}
      <div className="relative w-full overflow-hidden leading-none select-none pointer-events-none">
        <Image
          src="/images/footer-dip.webp"
          alt=""
          width={1920}
          height={315}
          priority={false}
          className="footer-dip theme-lock-media w-full h-auto object-cover -translate-y-1 block"
          aria-hidden
        />
      </div>

      {/* Main Footer Content — seamless continuation with NO separate background div */}
      <div className="relative z-10 px-6 sm:px-10 lg:px-16 pt-3 sm:pt-6 md:pt-8 pb-12">
        {/* ─── Grand Finale Brand Showcase ─── */}
        <div className="mx-auto max-w-4xl text-center">
          {/* Eyebrow */}
          <p className="font-paragraph text-xs sm:text-sm uppercase tracking-[0.3em] text-[#f5d09d] font-bold mb-4 sm:mb-6">
            Bakery &amp; Café · Tacloban City
          </p>

          {/* Signature Kinetic Brand Title */}
          <h2 className="font-sans text-[clamp(3.5rem,11.5vw,7.8rem)] font-black uppercase leading-[0.88] tracking-[-0.04em] text-milk drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]">
            Generation
          </h2>

          {/* Tilted Sticker Badge (matches Hero & Preloader brand system) */}
          <div className="mt-3 sm:mt-4 inline-block -rotate-3 border-[3px] border-milk shadow-[0_12px_36px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:rotate-0">
            <span className="block bg-light-brown px-7 py-2 sm:px-10 sm:py-3 text-[clamp(1.85rem,7vw,4.25rem)] font-black uppercase leading-none tracking-tight text-dark-brown">
              Bread
            </span>
          </div>

          {/* Subtitle */}
          <p className="font-paragraph mx-auto mt-6 sm:mt-7 max-w-lg text-sm sm:text-lg leading-relaxed text-milk/85 font-medium">
            Soft, siksik comfort bakes — warm from the oven, ready when you are.
          </p>

          {/* Bakery Highlights */}
          <div className="mt-5 sm:mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 text-xs sm:text-sm font-semibold text-milk/90">
            <span className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 backdrop-blur-sm">
              🧀 Melty Cheese Rolls
            </span>
            <span className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 backdrop-blur-sm">
              🍠 Ube Pandesal
            </span>
            <span className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 backdrop-blur-sm">
              🥐 Flaky Croissants
            </span>
            <span className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 backdrop-blur-sm">
              ☕ Specialty Brews
            </span>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 sm:mt-9 flex flex-wrap items-center justify-center gap-3.5 sm:gap-4">
            <Link
              href="/order"
              className="group cursor-pointer rounded-full bg-light-brown px-8 sm:px-11 py-3.5 sm:py-4 text-sm sm:text-base font-bold uppercase tracking-wider text-dark-brown shadow-[0_8px_30px_rgba(227,164,88,0.35)] transition-all duration-300 hover:-translate-y-1 hover:bg-milk hover:shadow-[0_12px_40px_rgba(227,164,88,0.55)] flex items-center gap-2.5"
            >
              <span>Order For Pickup</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="group-hover:translate-x-1 transition-transform"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/scan"
              className="cursor-pointer rounded-full border-2 border-milk/40 bg-black/25 backdrop-blur-md px-7 sm:px-10 py-3.5 sm:py-4 text-sm sm:text-base font-bold uppercase tracking-wider text-milk shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-milk hover:bg-milk/15 flex items-center gap-2.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="5" height="5" x="3" y="3" rx="1" />
                <rect width="5" height="5" x="16" y="3" rx="1" />
                <rect width="5" height="5" x="3" y="16" rx="1" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                <path d="M21 21v.01" />
                <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                <path d="M3 12h.01" />
                <path d="M12 3h.01" />
                <path d="M12 16v.01" />
                <path d="M16 12h1" />
                <path d="M21 12v.01" />
                <path d="M12 21v-1" />
              </svg>
              <span>Scan Table QR</span>
            </Link>
          </div>

          {/* Social Channels */}
          <div className="mt-8 sm:mt-9 flex items-center justify-center gap-3.5">
            <a
              href="https://www.facebook.com/generationbread"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Generation Bread on Facebook"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-milk/25 bg-white/5 transition-all hover:bg-light-brown hover:border-light-brown hover:text-dark-brown hover:-translate-y-1 group shadow-sm"
            >
              <Image
                src="/images/social-facebook.svg"
                alt=""
                width={20}
                height={20}
                className="group-hover:brightness-0 transition-all"
              />
            </a>
            <a
              href="https://www.instagram.com/generationbread/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Generation Bread on Instagram"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-milk/25 bg-white/5 transition-all hover:bg-light-brown hover:border-light-brown hover:text-dark-brown hover:-translate-y-1 group shadow-sm"
            >
              <Image
                src="/images/social-instagram.svg"
                alt=""
                width={20}
                height={20}
                className="group-hover:brightness-0 transition-all"
              />
            </a>
            <a
              href="https://www.tiktok.com/@generationbread"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Generation Bread on TikTok"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-milk/25 bg-white/5 transition-all hover:bg-light-brown hover:border-light-brown hover:text-dark-brown hover:-translate-y-1 group shadow-sm"
            >
              <Image
                src="/images/tiktok.svg"
                alt=""
                width={20}
                height={20}
                className="group-hover:brightness-0 transition-all"
              />
            </a>
          </div>
        </div>

        {/* ─── Integrated Lower Footer Navigation ─── */}
        <div className="relative z-10 mx-auto mt-14 sm:mt-18 max-w-6xl border-t border-milk/15 pt-12">
          <div className="grid gap-10 md:gap-14 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
            {/* Brand Information & Store Hours */}
            <div className="flex flex-col gap-4">
              <Link href="/" className="inline-block hover:opacity-85 transition-opacity">
                <BrandLogo onDark className="h-9 w-auto" />
              </Link>

              <p className="font-paragraph text-xs sm:text-sm leading-relaxed text-milk/75 max-w-sm">
                Downtown Tacloban City&apos;s artisanal bakery and café. Hand-rolled comfort bakes, loaded with real cheese and warm Leyteño hospitality.
              </p>

              {/* Store Schedule Capsule */}
              <div className="mt-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-paragraph text-milk/80 backdrop-blur-sm space-y-1.5">
                <div className="flex items-center gap-2 text-[#f5d09d] font-bold uppercase tracking-wider">
                  <span>📍</span>
                  <span>Downtown Tacloban City, Leyte</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>⏰</span>
                  <span>Open Daily: 7:30 AM – 8:30 PM</span>
                </div>
                <div className="flex items-center gap-2 text-milk/60">
                  <span>🛵</span>
                  <span>Dine-In · Counter Pickup · Scheduled Orders</span>
                </div>
              </div>
            </div>

            {/* Quick Links: Menu & Orders */}
            <div className="flex flex-col gap-3 font-paragraph">
              <p className="font-sans text-xs uppercase tracking-[0.25em] text-[#f5d09d] font-bold">
                Order &amp; Menu
              </p>
              <Link href="/order" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                All Bakery Items
              </Link>
              <Link href="/order?category=bread" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Cheese Rolls &amp; Pandesal
              </Link>
              <Link href="/order?category=drinks" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Coffee &amp; Matcha
              </Link>
              <Link href="/scan" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Scan Table QR
              </Link>
              <Link href="/track" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Live Order Tracker
              </Link>
            </div>

            {/* Quick Links: Account & Staff */}
            <div className="flex flex-col gap-3 font-paragraph">
              <p className="font-sans text-xs uppercase tracking-[0.25em] text-[#f5d09d] font-bold">
                Account &amp; Cafe
              </p>
              <Link href="/login" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Customer Sign In
              </Link>
              <Link href="/register" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Create Account
              </Link>
              <Link href="/dashboard" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                My Order History
              </Link>
              <Link href="/profile" className="text-sm text-milk/80 transition-colors hover:text-light-brown">
                Profile &amp; Settings
              </Link>
              <Link href="/staff" className="text-sm text-milk/60 transition-colors hover:text-light-brown">
                Staff Kitchen Portal
              </Link>
            </div>

            {/* Newsletter Subscription */}
            <div className="flex flex-col gap-3 font-paragraph">
              <p className="font-sans text-xs uppercase tracking-[0.25em] text-[#f5d09d] font-bold">
                Fresh Drops &amp; Promos
              </p>
              <p className="text-xs text-milk/70 leading-relaxed">
                Be the first to hear about newly baked specials, secret ube batches, and weekend promotions.
              </p>

              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-1.5 focus-within:border-light-brown transition-colors">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="w-full bg-transparent px-3 py-1.5 text-xs text-milk outline-none placeholder:text-milk/35"
                />
                <button
                  type="button"
                  aria-label="Subscribe"
                  className="rounded-xl bg-light-brown px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-dark-brown hover:bg-milk transition-colors shrink-0"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Bottom Copyright Bar ─── */}
        <div className="relative z-10 mx-auto mt-12 max-w-6xl flex flex-col-reverse sm:flex-row items-center justify-between gap-4 border-t border-milk/10 pt-6 font-paragraph text-xs text-milk/40">
          <p>© {year} Generation Bread — Handcrafted with love in Eastern Visayas</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-milk/70 transition-colors cursor-pointer">Privacy Policy</span>
            <span className="hover:text-milk/70 transition-colors cursor-pointer">Terms of Service</span>
            <span className="hover:text-milk/70 transition-colors cursor-pointer">Tacloban City</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
