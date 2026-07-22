"use client";

import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import SessionProvider from "@/components/SessionProvider";
import OrderReadyAlertUI from "@/components/OrderReadyAlertUI";
import OrderCompletedCelebration from "@/components/OrderCompletedCelebration";
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
            <OrderCompletedCelebration />
            {children}
          </LanguageProvider>
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
