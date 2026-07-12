"use client";

import { useTheme } from "@/context/ThemeContext";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

const ThemeToggle = ({ className = "", compact = false }: ThemeToggleProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`inline-flex items-center rounded-full border border-dark-brown/15 bg-milk/90 p-0.5 shadow-sm backdrop-blur-md ${className}`}
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        onClick={() => setTheme("warm")}
        className={`cursor-pointer rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-200 sm:px-3 sm:text-xs ${
          theme === "warm"
            ? "bg-dark-brown text-milk shadow-sm"
            : "text-dark-brown/55 hover:text-dark-brown"
        }`}
        aria-pressed={theme === "warm"}
      >
        {compact ? "Warm" : "Warm Brown"}
      </button>
      <button
        type="button"
        onClick={() => setTheme("sky")}
        className={`cursor-pointer rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-200 sm:px-3 sm:text-xs ${
          theme === "sky"
            ? "bg-dark-brown text-milk shadow-sm"
            : "text-dark-brown/55 hover:text-dark-brown"
        }`}
        aria-pressed={theme === "sky"}
      >
        {compact ? "Sky" : "Sky Blue"}
      </button>
    </div>
  );
};

export default ThemeToggle;
