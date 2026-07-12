"use client";

import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import SessionProvider from "@/components/SessionProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { ReactNode } from "react";
import "./suppress-dev-noise";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AuthProvider>
          <LanguageProvider>
            {children}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[100] sm:bottom-6 sm:right-6">
              <div className="pointer-events-auto">
                <ThemeToggle compact />
              </div>
            </div>
          </LanguageProvider>
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
