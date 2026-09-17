"use client";

import React, { useEffect, useState } from "react";
import PasswordInput from "./PasswordInput";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const inputClass =
  "w-full rounded-2xl border border-light-brown/45 bg-milk px-4 py-3.5 font-paragraph text-base text-dark-brown outline-none transition-all placeholder:text-dark-brown/35 focus:border-light-brown focus:bg-milk focus:ring-2 focus:ring-light-brown/30 [color-scheme:light] autofill:shadow-[inset_0_0_0_1000px_var(--color-milk)]";

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = "",
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<"email" | "reset" | "success">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail);
      setStep("email");
      setError("");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setDemoCode("");
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, initialEmail]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not send reset code. Please try again.");
        setLoading(false);
        return;
      }

      if (data.demo_code) {
        setDemoCode(data.demo_code);
        setCode(data.demo_code);
      }
      setResendCooldown(60);
      setStep("reset");
      setLoading(false);
    } catch {
      setError("Network error. Please make sure the backend server is running.");
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!code.trim()) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    if (!newPassword) {
      setError("Please enter your new password.");
      return;
    }

    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          new_password: newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password. Please check the code.");
        setLoading(false);
        return;
      }

      setStep("success");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.demo_code) {
          setDemoCode(data.demo_code);
          setCode(data.demo_code);
        }
        setResendCooldown(60);
      } else {
        setError(data.error || "Failed to resend code.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-dark-brown/60 backdrop-blur-sm transition-opacity"
        onClick={() => !loading && onClose()}
      />

      {/* Modal Card */}
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-light-brown/35 bg-milk p-6 shadow-[0_24px_60px_rgba(42,24,16,0.35)] sm:p-8 animate-[scaleIn_0.25s_ease-out]">
        {/* Top Header with Close */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-paragraph text-[0.65rem] font-bold uppercase tracking-[0.35em] text-mid-brown">
              Account Recovery
            </p>
            <h2 id="forgot-modal-title" className="text-2xl font-bold uppercase text-dark-brown">
              {step === "email" ? "Forgot Password" : step === "reset" ? "Reset Password" : "Password Reset"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex size-9 items-center justify-center rounded-full bg-dark-brown/5 text-dark-brown/60 transition-colors hover:bg-dark-brown/10 hover:text-dark-brown disabled:opacity-50"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mt-4 rounded-2xl border border-red-brown/25 bg-red-brown/10 px-4 py-3 text-center font-paragraph text-sm text-red-brown animate-[fadeUp_0.3s_ease-out]">
            {error}
          </div>
        )}

        {/* Demo Code Box (for local / offline demo) */}
        {demoCode && step === "reset" && (
          <div className="mt-4 rounded-2xl border border-light-brown/40 bg-light-brown/10 p-3.5 text-center font-paragraph text-xs text-dark-brown">
            <span className="font-bold">Demo Mode Code:</span> <code className="rounded bg-milk px-2 py-0.5 font-bold tracking-widest text-mid-brown">{demoCode}</code>
          </div>
        )}

        {/* Step 1: Request Code */}
        {step === "email" && (
          <form onSubmit={handleRequestCode} className="mt-6 flex flex-col gap-4">
            <p className="font-paragraph text-sm text-dark-brown/70 leading-relaxed">
              Enter the email address associated with your Generation Bread account. We&apos;ll send you a 6-digit verification code.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-email" className="font-paragraph text-sm font-semibold text-dark-brown">
                Email Address
              </label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                className={inputClass}
                disabled={loading}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-dark-brown py-3.5 font-paragraph text-base font-bold uppercase tracking-wide text-milk shadow-[0_8px_24px_rgba(82,49,34,0.2)] transition-all active:scale-[0.98] hover:bg-dark-brown-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <svg className="size-5 animate-spin text-milk" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Sending Code…</span>
                </>
              ) : (
                "Send Reset Code"
              )}
            </button>
          </form>
        )}

        {/* Step 2: Enter Code & New Password */}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} className="mt-5 flex flex-col gap-4">
            <p className="font-paragraph text-sm text-dark-brown/70 leading-relaxed">
              We sent a 6-digit code to <strong className="text-dark-brown">{email}</strong>. Enter the code and your new password below.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-code" className="font-paragraph text-sm font-semibold text-dark-brown">
                6-Digit Verification Code
              </label>
              <input
                id="reset-code"
                type="text"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className={`${inputClass} text-center font-mono text-xl tracking-[0.3em] font-bold`}
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-password" className="font-paragraph text-sm font-semibold text-dark-brown">
                New Password <span className="text-xs text-dark-brown/50 font-normal">(min 10 chars)</span>
              </label>
              <PasswordInput
                id="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-new-password" className="font-paragraph text-sm font-semibold text-dark-brown">
                Confirm New Password
              </label>
              <PasswordInput
                id="confirm-new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setStep("email")}
                className="font-paragraph text-xs font-semibold text-dark-brown/70 hover:text-dark-brown transition-colors"
                disabled={loading}
              >
                Change Email
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                className="font-paragraph text-xs font-semibold text-mid-brown hover:text-dark-brown transition-colors disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-dark-brown py-3.5 font-paragraph text-base font-bold uppercase tracking-wide text-milk shadow-[0_8px_24px_rgba(82,49,34,0.2)] transition-all active:scale-[0.98] hover:bg-dark-brown-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <svg className="size-5 animate-spin text-milk" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Resetting Password…</span>
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}

        {/* Step 3: Success Confirmation */}
        {step === "success" && (
          <div className="mt-6 flex flex-col items-center text-center animate-[fadeUp_0.35s_ease-out]">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-[#34A853]/15 text-[#34A853]">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold uppercase text-dark-brown">Success!</h3>
            <p className="mt-2 font-paragraph text-sm text-dark-brown/75 leading-relaxed">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-dark-brown py-3.5 font-paragraph text-base font-bold uppercase text-milk transition-all hover:bg-dark-brown-hover"
            >
              Sign In Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
