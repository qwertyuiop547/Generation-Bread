"use client";

import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import SessionProvider from "@/components/SessionProvider";
import ThemeToggle from "@/components/ThemeToggle";
import OrderReadyAlertUI from "@/components/OrderReadyAlertUI";
import { CustomerOrderReadyAlerts } from "@/hooks/useCustomerOrderReadyAlerts";
import { ReactNode } from "react";
import "./suppress-dev-noise";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AuthProvider>
          <LanguageProvider>
            <CustomerOrderReadyAlerts />
            <OrderReadyAlertUI />
            {children}
            {/* Keep below toasts (z-[110]+) so error banners are never covered on mobile. */}
            <div className="pointer-events-none fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">
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
