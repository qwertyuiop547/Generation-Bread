"use client";

import { useEffect, useState } from "react";
import { getMenuItemImage } from "@/constants";
import {
  buildCravingSuggestion,
  fetchTaclobanWeather,
  weatherPhrase,
  type CravingMenuItem,
  type CravingSuggestion,
  type CravingWeather,
} from "@/lib/cravingSync";

interface CravingNowCardProps {
  menuItems: CravingMenuItem[];
  onAdd: (items: CravingSuggestion["items"]) => void;
}

export default function CravingNowCard({ menuItems, onAdd }: CravingNowCardProps) {
  const [weather, setWeather] = useState<CravingWeather | null>(null);
  const [weatherReady, setWeatherReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    let cancelled = false;
    let inFlight = false;

    const loadWeather = () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      fetchTaclobanWeather()
        .then((next) => {
          if (cancelled || !next) return;
          setWeather(next);
          setCheckedAt(Date.now());
        })
        .catch(() => {
          if (!cancelled) setWeather((current) => current);
        })
        .finally(() => {
          inFlight = false;
          if (!cancelled) setWeatherReady(true);
        });
    };

    loadWeather();
    const refresh = window.setInterval(loadWeather, 15_000);
    const onVisible = () => {
      if (!document.hidden) loadWeather();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!now || !weatherReady || menuItems.length === 0) {
    return (
      <div className="mt-6 max-w-5xl mx-auto px-2">
        <div className="h-[148px] animate-pulse rounded-3xl border border-dark-brown/10 bg-dark-brown/5" />
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="mt-6 max-w-5xl mx-auto px-2">
        <div className="rounded-[28px] border border-[#EBE3D7] bg-[#FFFDF9] px-5 py-4 font-paragraph text-sm text-dark-brown/60">
          Connecting to live Tacloban City weather…
        </div>
      </div>
    );
  }

  const suggestion = buildCravingSuggestion(menuItems, now, weather);
  if (!suggestion) return null;

  const [hourText, minute] = weather.observedAt.slice(11, 16).split(":");
  const hour24 = Number(hourText);
  const observedClock = `${hour24 % 12 || 12}:${minute} ${hour24 >= 12 ? "PM" : "AM"}`;
  const secondsAgo = checkedAt ? Math.max(0, Math.round((now.getTime() - checkedAt) / 1000)) : 0;
  const swaps = suggestion.items
    .filter((item) => item.swappedFrom)
    .map((item) => `${item.swappedFrom} is out, so this uses ${item.menuName}`);

  return (
    <section className="mt-6 max-w-5xl mx-auto px-2 text-left">
      <div className="overflow-hidden rounded-[28px] border border-[#EBE3D7] bg-[#FFFDF9] text-dark-brown shadow-[0_4px_20px_rgba(42,24,16,0.05)]">
        <div className="grid items-center md:grid-cols-[minmax(0,1.25fr)_minmax(240px,0.85fr)]">
          <div className="p-5 sm:p-6 md:p-7">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-brown/10 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-dark-brown/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {weather.place}
              </span>
              <span className="rounded-full border border-dark-brown/10 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-dark-brown/70">
                {observedClock}
              </span>
              <span className="rounded-full border border-[#e3a458]/40 bg-[#e3a458]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-dark-brown">
                {weatherPhrase(weather)} · {Math.round(weather.temperature)}°
              </span>
              <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-dark-brown/40">
                {secondsAgo}s ago
              </span>
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#a26833]">
              Perfect for right now
            </p>
            <h2 className="mt-1 text-2xl font-bold uppercase tracking-tight text-dark-brown sm:text-3xl">
              {suggestion.kicker}
            </h2>
            <p className="mt-2 max-w-xl font-paragraph text-sm leading-relaxed text-dark-brown/80 sm:text-base">
              {suggestion.line}
            </p>
            <p className="mt-1 max-w-xl font-paragraph text-xs leading-relaxed text-dark-brown/50">
              {suggestion.reason}
            </p>
            {swaps.length > 0 && (
              <p className="mt-2 font-paragraph text-xs text-[#a26833]">
                {swaps.join(" · ")}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                onAdd(suggestion.items);
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1800);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-dark-brown px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-milk shadow-sm transition-all hover:bg-dark-brown-hover active:scale-95"
            >
              <span>{added ? "Added" : suggestion.items.length > 1 ? "Add both" : "Add to cart"}</span>
              <span className="tabular-nums">₱{suggestion.total.toFixed(0)}</span>
            </button>
          </div>

          <div className={`grid gap-3 p-3 sm:p-4 ${suggestion.items.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {suggestion.items.map((item) => (
              <div key={item.name} className="min-w-0">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] border border-dark-brown/10 bg-[#F7F2EC]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getMenuItemImage(item.menuName, item.image_url, item.color)}
                    alt={item.menuName}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-2 truncate text-xs font-bold uppercase tracking-wide text-dark-brown">
                  {item.menuName}
                </p>
                <p className="truncate font-paragraph text-[11px] text-dark-brown/50">
                  {item.notes || "As baked"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
