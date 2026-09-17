"use client";

import React, { useEffect, useState } from "react";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "terms" | "privacy";
}

export default function LegalModal({
  isOpen,
  onClose,
  initialTab = "terms",
}: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-dark-brown/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-light-brown/35 bg-milk shadow-[0_24px_60px_rgba(42,24,16,0.35)] animate-[scaleIn_0.25s_ease-out]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-dark-brown/10 px-6 py-5 sm:px-8">
          <div>
            <p className="font-paragraph text-[0.65rem] font-bold uppercase tracking-[0.35em] text-mid-brown">
              Generation Bread
            </p>
            <h2 id="legal-modal-title" className="text-xl font-bold uppercase text-dark-brown sm:text-2xl">
              {activeTab === "terms" ? "Terms of Service" : "Privacy Policy"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-dark-brown/5 text-dark-brown/60 transition-colors hover:bg-dark-brown/10 hover:text-dark-brown"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex shrink-0 border-b border-dark-brown/10 bg-dark-brown/[0.02] px-6 pt-2 sm:px-8">
          <button
            type="button"
            onClick={() => setActiveTab("terms")}
            className={`border-b-2 px-4 py-3 font-paragraph text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === "terms"
                ? "border-dark-brown text-dark-brown"
                : "border-transparent text-dark-brown/45 hover:text-dark-brown/70"
            }`}
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`border-b-2 px-4 py-3 font-paragraph text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === "privacy"
                ? "border-dark-brown text-dark-brown"
                : "border-transparent text-dark-brown/45 hover:text-dark-brown/70"
            }`}
          >
            Privacy Policy
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 font-paragraph text-sm leading-relaxed text-dark-brown/80 sm:px-8 sm:text-base">
          {activeTab === "terms" ? (
            <div className="space-y-6">
              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  1. Fresh Bakes &amp; Availability
                </h3>
                <p>
                  Generation Bread serves freshly baked artisanal bread, pastries, and handcrafted beverages in Tacloban City. Because our signature bakes (including Ube Cheese Pandesal and specialty croissants) are made daily in limited batches, availability is on a first-come, first-served basis.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  2. Orders &amp; Smart Queue
                </h3>
                <p>
                  Orders placed through our website or QR tables enter our kitchen queue in real-time. Estimated prep times (Smart ETA) are calculated based on kitchen volume and drink complexity. Please ensure your contact details are accurate to receive order ready notifications.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  3. Payment Methods
                </h3>
                <p>
                  We accept Cash (upon pickup/dine-in), GCash, GoTyme Bank, and standard credit/debit cards. Once an order is prepared, payments are non-refundable unless verified as a store mistake or product defect.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  4. Account Security
                </h3>
                <p>
                  You are responsible for maintaining the confidentiality of your login credentials. You agree to notify us immediately if you suspect unauthorized access to your account.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  5. Updates to Terms
                </h3>
                <p>
                  Generation Bread reserves the right to modify these terms as we introduce new café features, seasonal menu items, and loyalty perks. Continued use of the platform signifies your acceptance of any updates.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  1. Information We Collect
                </h3>
                <p>
                  When you register or order from Generation Bread, we collect your name, email address, optional contact number, and your order history. For dine-in QR orders, table numbers are temporarily attached for service delivery.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  2. Purpose of Collection
                </h3>
                <p>
                  We use your information solely to:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Process, prepare, and notify you when your bread and drinks are ready.</li>
                  <li>Provide order tracking and purchase receipts.</li>
                  <li>Enable password recovery via verification codes.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  3. Data Privacy Act Compliance (RA 10173)
                </h3>
                <p>
                  We adhere strictly to the <em>Data Privacy Act of 2012 (Republic Act No. 10173)</em> of the Philippines. We never sell, rent, or trade your personal information to third parties.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  4. Security &amp; Encryption
                </h3>
                <p>
                  All account passwords are encrypted using one-way cryptographic hashing. Communication between your browser and our backend is secured with modern token-based authentication (JWT).
                </p>
              </section>

              <section>
                <h3 className="font-bold text-dark-brown uppercase tracking-wide text-xs sm:text-sm mb-1.5">
                  5. Your Rights &amp; Deletion
                </h3>
                <p>
                  You have the right to review, update, or permanently delete your account and personal data at any time through your Profile settings.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-dark-brown/10 bg-dark-brown/[0.03] px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-dark-brown px-7 py-2.5 font-paragraph text-sm font-bold uppercase text-milk transition-all hover:bg-dark-brown-hover"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
