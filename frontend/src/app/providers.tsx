"use client";

import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import SessionProvider from "@/components/SessionProvider";
import { ReactNode } from "react";
import "./suppress-dev-noise";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthProvider>
        <LanguageProvider>{children}</LanguageProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
