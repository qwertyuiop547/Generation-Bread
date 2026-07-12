"use client";

import Image from "next/image";
import Link from "next/link";

const FooterSection = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="footer-section relative overflow-hidden bg-main-bg text-milk">
      <Image
        src="/images/footer-dip.webp"
        alt=""
        width={3000}
        height={3000}
        className="footer-dip theme-lock-media w-full object-cover -translate-y-1"
        aria-hidden
      />

      <div className="footer-stage relative px-6 sm:px-10 lg:px-16 pt-12 md:pt-20 pb-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-paragraph text-[0.7rem] sm:text-xs uppercase tracking-[0.28em] text-milk/55 mb-6">
            Bakery &amp; café · Tacloban City
          </p>

          <h2 className="font-bold uppercase leading-[0.88] tracking-[-0.04em] text-[clamp(3rem,12vw,7.5rem)] text-milk">
            Generation
          </h2>

          <div className="mt-3 md:mt-4 inline-block -rotate-3 border-[3px] border-milk">
            <span className="block bg-mid-brown px-6 py-2.5 sm:px-9 sm:py-3.5 text-[clamp(1.75rem,7vw,4.25rem)] font-bold uppercase leading-none tracking-[-0.03em] text-milk">
              Bread
            </span>
          </div>

          <p className="font-paragraph mx-auto mt-8 max-w-md text-base sm:text-lg leading-relaxed text-milk/75">
            Soft, siksik comfort bakes — warm from the oven, ready when you are.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/order"
              className="cursor-pointer rounded-full bg-light-brown px-9 py-3.5 text-sm sm:text-base font-bold uppercase text-dark-brown transition-all duration-200 hover:-translate-y-0.5 hover:bg-milk"
            >
              Order now
            </Link>
            <Link
              href="/scan"
              className="cursor-pointer rounded-full border border-milk/40 px-9 py-3.5 text-sm sm:text-base font-bold uppercase text-milk transition-all duration-200 hover:border-milk/80 hover:bg-milk/10"
            >
              Scan to order
            </Link>
          </div>

          <div className="mt-10 flex items-center justify-center gap-4">
            <a
              href="https://www.facebook.com/generationbread"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Generation Bread on Facebook"
              className="flex size-12 cursor-pointer items-center justify-center rounded-full border border-milk/25 p-2.5 transition-colors hover:bg-white/10"
            >
              <Image src="/images/social-facebook.svg" alt="" width={36} height={36} />
            </a>
            <a
              href="https://www.instagram.com/generationbread/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Generation Bread on Instagram"
              className="flex size-12 cursor-pointer items-center justify-center rounded-full border border-milk/25 p-2.5 transition-colors hover:bg-white/10"
            >
              <Image src="/images/social-instagram.svg" alt="" width={36} height={36} />
            </a>
            <a
              href="https://www.tiktok.com/@generationbread"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Generation Bread on TikTok"
              className="flex size-12 cursor-pointer items-center justify-center rounded-full border border-milk/25 p-2.5 transition-colors hover:bg-white/10"
            >
              <Image src="/images/tiktok.svg" alt="" width={36} height={36} />
            </a>
          </div>
        </div>

        <div className="mx-auto mt-16 md:mt-24 max-w-6xl border-t border-milk/12 pt-12">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
            <nav
              aria-label="Footer"
              className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-10 font-paragraph"
            >
              <div className="flex flex-col gap-2.5">
                <p className="mb-1 text-[0.65rem] uppercase tracking-[0.22em] text-milk/40">
                  Order
                </p>
                <Link href="/order" className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer">
                  Menu
                </Link>
                <Link href="/scan" className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer">
                  Scan QR
                </Link>
                <Link href="/track" className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer">
                  Track
                </Link>
              </div>
              <div className="flex flex-col gap-2.5">
                <p className="mb-1 text-[0.65rem] uppercase tracking-[0.22em] text-milk/40">
                  Visit
                </p>
                <span className="text-base text-milk/90">Tacloban City</span>
                <span className="text-base text-milk/90">Dine-in &amp; pickup</span>
                <a
                  href="https://www.facebook.com/generationbread"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer"
                >
                  Follow us
                </a>
              </div>
              <div className="flex flex-col gap-2.5 col-span-2 sm:col-span-1">
                <p className="mb-1 text-[0.65rem] uppercase tracking-[0.22em] text-milk/40">
                  Account
                </p>
                <Link href="/login" className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer">
                  Login
                </Link>
                <Link href="/register" className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer">
                  Get started
                </Link>
                <Link href="/dashboard" className="text-base text-milk/90 transition-colors hover:text-light-brown cursor-pointer">
                  My orders
                </Link>
              </div>
            </nav>

            <div className="font-paragraph">
              <p className="text-base sm:text-lg leading-relaxed text-milk/75">
                New bakes, matcha drops, and promos — straight from our Tacloban kitchen.
              </p>
              <label htmlFor="footer-email" className="sr-only">
                Email address
              </label>
              <div className="mt-6 flex items-center gap-3 border-b border-milk/30 pb-3">
                <input
                  id="footer-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  className="w-full bg-transparent text-xl md:text-2xl text-milk outline-none placeholder:text-milk/35"
                />
                <button
                  type="button"
                  aria-label="Subscribe"
                  className="shrink-0 cursor-pointer p-1 opacity-80 transition-opacity hover:opacity-100"
                >
                  <Image src="/images/arrow.svg" alt="" width={44} height={44} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-6xl flex flex-col-reverse md:flex-row items-center justify-between gap-4 border-t border-milk/10 pt-6 font-paragraph text-sm text-milk/40">
          <p>© {year} Generation Bread — All rights reserved</p>
          <div className="flex items-center gap-6">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
