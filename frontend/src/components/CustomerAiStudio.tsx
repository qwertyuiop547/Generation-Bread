"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  type AiMenuItem,
  type AiOrderRecord,
  type CaptionVibe,
  type SocialPlatform,
  generateFoodieCaptions,
} from "@/lib/customerAi";

export type CustomerAiFeatureId = "caption";

export interface CustomerAiFeatureMeta {
  id: CustomerAiFeatureId;
  number: number;
  icon: string;
  shortTitle: string;
  fullTitle: string;
  tagline: string;
  badge: string;
}

export const CUSTOMER_AI_FEATURES: ReadonlyArray<CustomerAiFeatureMeta> = [
  {
    id: "caption",
    number: 8,
    icon: "📸",
    shortTitle: "IG / TikTok Captions",
    fullTitle: "AI Foodie Photo Caption & Shot Generator",
    tagline: "Aesthetic, witty Taglish, or study-grind captions + camera angle tips.",
    badge: "Social AI",
  },
];

interface CustomerAiStudioProps {
  isOpen: boolean;
  onClose: () => void;
  initialFeature?: CustomerAiFeatureId;
  menuItems?: AiMenuItem[];
  orders?: AiOrderRecord[];
  activeOrderItems?: string[];
  customerName?: string;
  onAddToCart?: (name: string, price: number, notes?: string, qty?: number) => void;
  onApplyGiftNote?: (note: string) => void;
}

export default function CustomerAiStudio({
  isOpen,
  onClose,
  menuItems = [],
  activeOrderItems = [],
}: CustomerAiStudioProps) {
  const router = useRouter();
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${label} to clipboard`);
    } catch {
      showToast(`Ready to copy ${label}`);
    }
  };

  const catalog: AiMenuItem[] = useMemo(() => {
    if (menuItems && menuItems.length > 0) return menuItems;
    return [
      { name: "Ube Cheese Pandesal", price: 65, description: "Soft ube pandesal with that melty cheese pull — purple, warm, and baked fresh daily.", category: "food" },
      { name: "Pork Floss Ensaymada", price: 75, description: "Buttery ensaymada topped with savory pork floss — soft, fluffy, and filling.", category: "food" },
      { name: "Matcha Latte", price: 149, description: "Smooth matcha latte with creamy milk — earthy, lightly sweet, and refreshing.", category: "drink" },
      { name: "Sausage Croissant", price: 95, description: "Flaky croissant wrapped around a savory sausage — golden and freshly baked.", category: "food" },
      { name: "Ham & Cheese Croissant", price: 99, description: "Classic ham and cheese in a buttery croissant — melty, flaky, and satisfying.", category: "food" },
      { name: "Pistachio Pain au Chocolat", price: 120, description: "Chocolate-filled pastry with pistachio — crisp layers and a rich finish.", category: "food" },
    ];
  }, [menuItems]);

  const [captionItem, setCaptionItem] = useState(
    activeOrderItems[0]?.replace(/\s*\(.*?\)$/, "") || catalog[5]?.name || "Pistachio Pain au Chocolat"
  );
  const [captionVibe, setCaptionVibe] = useState<CaptionVibe>("aesthetic");
  const [captionPlatform, setCaptionPlatform] = useState<SocialPlatform>("instagram");
  const captionsList = useMemo(
    () =>
      generateFoodieCaptions(
        activeOrderItems.length > 0 ? activeOrderItems : [captionItem, "Matcha Latte"],
        captionVibe,
        captionPlatform
      ),
    [activeOrderItems, captionItem, captionVibe, captionPlatform]
  );

  if (!isOpen) return null;

  const feature = CUSTOMER_AI_FEATURES[0];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 md:p-6">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {feedbackToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[140] bg-dark-brown text-milk px-5 py-3 rounded-full shadow-2xl border border-light-brown/40 flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider">
            {feedbackToast}
          </span>
        </div>
      )}

      <div className="relative z-10 w-full max-w-5xl max-h-[92vh] bg-[#FAF3E8] text-dark-brown rounded-[28px] sm:rounded-[34px] border border-dark-brown/15 shadow-[0_25px_70px_rgba(34,33,35,0.45)] flex flex-col overflow-hidden">
        <div className="bg-dark-brown text-milk px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-3 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-light-brown/20 border border-light-brown/40 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.2 13.15 8.7 18.8 9.85 13.15 11 12 16.5 10.85 11 5.2 9.85 10.85 8.7 12 3.2z" />
                <path d="M18.2 14.8v3.2" />
                <path d="M19.8 16.4h-3.2" />
              </svg>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-light-brown text-dark-brown">
                AI Suite
              </span>
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight truncate mt-0.5">
                {feature.fullTitle}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/10 hover:bg-light-brown hover:text-dark-brown text-milk flex items-center justify-center font-bold text-sm transition-all shrink-0"
            aria-label="Close AI Studio"
          >
            ✕
          </button>
        </div>

        <div className="bg-white/60 border-b border-dark-brown/8 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <p className="font-paragraph text-xs sm:text-sm text-dark-brown/75">
            {feature.tagline}
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/order");
            }}
            className="text-[11px] font-bold uppercase tracking-wider text-mid-brown hover:text-dark-brown underline"
          >
            Go to Menu →
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white/90 rounded-3xl p-5 border border-dark-brown/12 shadow-xs space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-dark-brown mb-2">
                    Featured item in your photo
                  </label>
                  <select
                    value={captionItem}
                    onChange={(e) => setCaptionItem(e.target.value)}
                    className="w-full rounded-2xl border border-dark-brown/20 bg-[#FAF3E8] px-3.5 py-2.5 text-xs sm:text-sm font-bold text-dark-brown focus:outline-none"
                  >
                    {catalog.map((it) => (
                      <option key={it.name} value={it.name}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-dark-brown mb-2">
                    Feed vibe
                  </label>
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: "aesthetic", label: "Cozy & golden hour" },
                        { id: "taglish_funny", label: "Taglish / humorous" },
                        { id: "study_grind", label: "Study or work grind" },
                        { id: "main_character", label: "Main character" },
                        { id: "minimalist", label: "Short & minimal" },
                      ] as const
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setCaptionVibe(v.id)}
                        className={`w-full px-3.5 py-2.5 rounded-2xl text-left text-xs font-bold transition-all ${
                          captionVibe === v.id
                            ? "bg-dark-brown text-milk shadow-xs"
                            : "bg-[#FAF3E8] text-dark-brown hover:bg-light-brown/25"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-dark-brown mb-2">
                    Platform
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "instagram", label: "IG Post" },
                        { id: "story", label: "IG Story" },
                        { id: "tiktok", label: "TikTok" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setCaptionPlatform(p.id)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          captionPlatform === p.id
                            ? "bg-mid-brown text-milk border-mid-brown"
                            : "bg-white text-dark-brown border-dark-brown/15"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-3.5">
              {captionsList.map((cap) => (
                <div
                  key={cap.id}
                  className="bg-white/95 rounded-3xl p-5 border border-dark-brown/15 shadow-xs flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full bg-light-brown/25 text-dark-brown text-xs font-bold uppercase">
                      {cap.vibeLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(`${cap.caption}\n\n${cap.hashtags}`, "Caption & Hashtags")
                      }
                      className="rounded-full bg-dark-brown hover:bg-dark-brown-hover text-milk px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      Copy caption
                    </button>
                  </div>

                  <p className="font-paragraph text-xs sm:text-sm text-dark-brown whitespace-pre-line bg-[#FAF3E8] p-3.5 rounded-2xl border border-dark-brown/10">
                    {cap.caption}
                  </p>

                  <p className="font-paragraph text-[11px] font-semibold text-mid-brown">
                    {cap.hashtags}
                  </p>

                  <div className="text-[11px] font-paragraph text-dark-brown/65 bg-emerald-50/70 border border-emerald-200/70 px-3 py-2 rounded-xl">
                    <strong>Camera angle:</strong> {cap.bestShotTip}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
