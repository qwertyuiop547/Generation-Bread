"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { signIn } from "next-auth/react";
import IntroHomeLink from "@/components/IntroHomeLink";
import PageIntro from "@/components/PageIntro";
import BrandLogo from "@/components/BrandLogo";
import PasswordInput from "@/components/PasswordInput";
import LegalModal from "@/components/LegalModal";

const inputClass =
  "w-full rounded-2xl border border-light-brown/45 bg-milk px-4 py-3.5 font-paragraph text-base text-dark-brown outline-none transition-all placeholder:text-dark-brown/35 focus:border-light-brown focus:bg-milk focus:ring-2 focus:ring-light-brown/30 [color-scheme:light] autofill:shadow-[inset_0_0_0_1000px_var(--color-milk)]";

function RegisterPageContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalTab, setLegalTab] = useState<"terms" | "privacy">("terms");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    if (!agreeTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await register(name, email, password);
      if (result.ok) {
        const explicitRedirect = searchParams.get("redirect");
        window.location.href = explicitRedirect || "/dashboard";
      } else {
        setError(result.error || "Could not create account.");
        setSubmitting(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <PageIntro>
      <div className="register-page relative min-h-dvh overflow-x-hidden app-canvas text-dark-brown">
        <div className="relative z-10 grid min-h-dvh lg:grid-cols-2">
          {/* Desktop brand panel — matcha */}
          <aside className="relative hidden min-h-dvh overflow-hidden lg:block">
            <Image
              src="/images/generation-bread-matcha-latte.png"
              alt="Iced matcha latte"
              width={1600}
              height={1200}
              priority
              className="absolute inset-0 h-full w-full object-cover object-center scale-105"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a2a28]/90 via-[#1a2a28]/40 to-[#1a2a28]/20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(227,164,88,0.18),transparent_50%)]" />

            <div className="absolute inset-0 flex flex-col justify-between p-10 xl:p-14">
              <IntroHomeLink href="/" className="w-fit">
                <BrandLogo
                  priority
                  width={160}
                  height={40}
                  onDark
                  className="h-10 w-auto opacity-95 hover:opacity-100 transition-opacity"
                />
              </IntroHomeLink>

              <div className="max-w-md">
                <p className="mb-4 font-paragraph text-xs uppercase tracking-[0.35em] text-milk/70">
                  Join the table
                </p>
                <h2 className="text-[clamp(2.75rem,5vw,4.5rem)] font-bold uppercase leading-[0.9] tracking-[-0.03em] text-milk">
                  Create your
                  <span className="mt-1 block text-brand-gold">account.</span>
                </h2>
                <p className="mt-5 max-w-sm font-paragraph text-base leading-relaxed text-milk/75">
                  Order faster, track deliveries, and unlock Generation Bread favorites.
                </p>
              </div>
            </div>
          </aside>

          <main className="relative flex min-h-dvh flex-col">
            {/* Mobile hero — matcha (different from login cheese roll) */}
            <div className="relative isolate h-[min(38vh,320px)] min-h-[240px] w-full shrink-0 overflow-hidden lg:hidden">
              <Image
                src="/images/generation-bread-matcha-latte.png"
                alt="Iced matcha latte"
                width={1200}
                height={900}
                priority
                className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a2a28]/85 via-[#1a2a28]/35 to-[#1a2a28]/15" />

              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(0.85rem,env(safe-area-inset-top))]">
                <IntroHomeLink
                  href="/"
                  className="inline-flex items-center gap-1.5 rounded-full bg-milk/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-milk backdrop-blur-sm transition-colors hover:bg-milk/25"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  Home
                </IntroHomeLink>
              </div>

              <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-8">
                <p className="mb-1.5 font-paragraph text-[0.65rem] uppercase tracking-[0.35em] text-milk/65">
                  Join the table
                </p>
                <p className="text-2xl font-bold uppercase leading-none tracking-tight text-milk">
                  Create your <span className="text-brand-gold">account.</span>
                </p>
              </div>
            </div>

            <div className="relative z-10 -mt-5 flex flex-1 flex-col rounded-t-[1.75rem] theme-sheet px-5 pb-8 pt-6 shadow-[0_-12px_40px_rgba(26,42,40,0.18)] sm:px-8 md:px-12 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-16 lg:pb-10 lg:pt-8 lg:shadow-none xl:px-20">
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-dark-brown/15 lg:hidden" aria-hidden />

              <div className="mb-2 hidden justify-end lg:flex">
                <IntroHomeLink
                  href="/"
                  className="group flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-dark-brown/70 transition-colors hover:text-mid-brown"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-x-1">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  Back to Home
                </IntroHomeLink>
              </div>

              <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center lg:py-6">
                <div className="mb-6 animate-[fadeUp_0.55s_ease-out_both] sm:mb-8">
                  <p className="mb-2 font-paragraph text-[0.65rem] uppercase tracking-[0.35em] text-dark-brown/45 sm:mb-3 sm:text-[0.7rem]">
                    New here
                  </p>
                  <h1 className="text-[clamp(2.1rem,8vw,3.4rem)] font-bold uppercase leading-[0.92] tracking-[-0.03em] text-dark-brown">
                    Get
                    <span className="block text-mid-brown">Started</span>
                  </h1>
                  <p className="mt-2.5 font-paragraph text-sm text-dark-brown/60 sm:mt-3 sm:text-base">
                    Create your account today.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 rounded-2xl border border-red-brown/25 bg-red-brown/10 px-4 py-3 text-center font-paragraph text-sm text-red-brown">
                    {error}
                  </div>
                )}

                <form onSubmit={handleRegister} className="flex flex-col gap-4 sm:gap-5 animate-[fadeUp_0.65s_ease-out_0.06s_both]">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="register-name" className="font-paragraph text-sm font-semibold text-dark-brown">
                      Full Name
                    </label>
                    <input
                      id="register-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="register-email" className="font-paragraph text-sm font-semibold text-dark-brown">
                      Email Address
                    </label>
                    <input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hello@example.com"
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="register-password" className="font-paragraph text-sm font-semibold text-dark-brown">
                      Password <span className="text-xs text-dark-brown/50 font-normal">(min 10 chars)</span>
                    </label>
                    <PasswordInput
                      id="register-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      disabled={submitting}
                    />
                  </div>

                  {/* Terms of Service & Privacy Policy Checkbox */}
                  <div className="flex items-start gap-2.5 pt-1">
                    <input
                      id="agree-terms"
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-dark-brown cursor-pointer"
                    />
                    <label htmlFor="agree-terms" className="font-paragraph text-xs sm:text-sm text-dark-brown/75 leading-relaxed cursor-pointer select-none">
                      I agree to Generation Bread&apos;s{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setLegalTab("terms");
                          setShowLegalModal(true);
                        }}
                        className="font-bold text-dark-brown underline decoration-light-brown/70 underline-offset-2 hover:text-mid-brown transition-colors cursor-pointer"
                      >
                        Terms of Service
                      </button>{" "}
                      and{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setLegalTab("privacy");
                          setShowLegalModal(true);
                        }}
                        className="font-bold text-dark-brown underline decoration-light-brown/70 underline-offset-2 hover:text-mid-brown transition-colors cursor-pointer"
                      >
                        Privacy Policy
                      </button>
                      .
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-light-brown py-3.5 text-base font-bold uppercase tracking-wide text-dark-brown shadow-[0_8px_24px_rgba(227,164,88,0.35)] transition-all active:scale-[0.98] hover:bg-mid-brown hover:text-milk sm:py-4 sm:text-lg disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? (
                      <>
                        <svg className="size-5 animate-spin text-dark-brown" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Creating Account…</span>
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </form>

                <div className="my-5 flex items-center gap-4 sm:my-7 animate-[fadeUp_0.65s_ease-out_0.1s_both]">
                  <div className="h-px flex-1 bg-dark-brown/15" />
                  <span className="font-paragraph text-sm text-dark-brown/40">or</span>
                  <div className="h-px flex-1 bg-dark-brown/15" />
                </div>

                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-light-brown/40 bg-milk py-3.5 font-paragraph font-semibold text-dark-brown transition-all active:scale-[0.98] hover:border-dark-brown/25 hover:bg-white animate-[fadeUp_0.65s_ease-out_0.14s_both]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Sign up with Google
                </button>

                <p className="mt-6 pb-[env(safe-area-inset-bottom)] text-center font-paragraph text-sm text-dark-brown/70 sm:mt-8 sm:text-base animate-[fadeUp_0.65s_ease-out_0.18s_both]">
                  Already have an account?{" "}
                  <Link
                    href={`/login${redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
                    className="font-bold text-dark-brown underline decoration-light-brown/70 underline-offset-4 transition-colors hover:text-mid-brown"
                  >
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Terms of Service & Privacy Policy Modal */}
      <LegalModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialTab={legalTab}
      />
    </PageIntro>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  );
}
