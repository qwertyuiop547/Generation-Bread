"use client";

import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";

function readCssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export type ThemeColors = {
  black: string;
  mainBg: string;
  darkBrown: string;
  darkBrownHover: string;
  midBrown: string;
  lightBrown: string;
  redBrown: string;
  yellowBrown: string;
  milkYellow: string;
  milk: string;
  red: string;
  white: string;
};

export function getThemeColors(): ThemeColors {
  return {
    black: readCssVar("--color-black", "#222123"),
    mainBg: readCssVar("--color-main-bg", "#232224"),
    darkBrown: readCssVar("--color-dark-brown", "#523122"),
    darkBrownHover: readCssVar("--color-dark-brown-hover", "#3a2218"),
    midBrown: readCssVar("--color-mid-brown", "#a26833"),
    lightBrown: readCssVar("--color-light-brown", "#e3a458"),
    redBrown: readCssVar("--color-red-brown", "#7f3b2d"),
    yellowBrown: readCssVar("--color-yellow-brown", "#a26833"),
    milkYellow: readCssVar("--color-milk-yellow", "#e3d3bc"),
    milk: readCssVar("--color-milk", "#faeade"),
    red: readCssVar("--color-red", "#a02128"),
    white: readCssVar("--color-white", "#ffffff"),
  };
}

/** Re-reads CSS theme tokens whenever Warm/Sky theme changes. */
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return useMemo(() => getThemeColors(), [theme]);
}

export function withAlpha(hex: string, alphaHex: string) {
  if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) {
    const full =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    return `${full}${alphaHex}`;
  }
  return hex;
}
