"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "EN" | "FIL";

interface Translations {
  [key: string]: { EN: string; FIL: string };
}

export const translations: Translations = {
  "Dashboard": { EN: "Dashboard", FIL: "Dashboard" },
  "Back": { EN: "Back", FIL: "Bumalik" },
  "Login": { EN: "Login", FIL: "Mag-login" },
  "Logout": { EN: "Logout", FIL: "Mag-logout" },
  "Cart": { EN: "Cart", FIL: "Cart" },

  "Our Menu": { EN: "Our Menu", FIL: "Ating Menu" },
  "Pick your favorites and place your order": { EN: "Pick your favorites and place your order", FIL: "Piliin ang paborito at mag-order na" },

  "Customize & Add": { EN: "Customize & Add", FIL: "I-customize at Idagdag" },
  "Add More": { EN: "Add More", FIL: "Magdagdag Pa" },
  "Review Order": { EN: "Review Order", FIL: "Suriin ang Order" },
  "Place Order": { EN: "Place Order", FIL: "Umorder Na" },
  "Placing...": { EN: "Placing...", FIL: "Pino-proseso..." },

  "Your Cart": { EN: "Your Cart", FIL: "Ang Iyong Cart" },
  "Your cart is empty": { EN: "Your cart is empty", FIL: "Walang laman ang cart" },
  "Add some drinks to get started!": { EN: "Add some drinks to get started!", FIL: "Magdagdag ng inumin para mag-umpisa!" },
  
  "Pre-Order": { EN: "Pre-Order", FIL: "I-advance" },
  "Dine-In": { EN: "Dine-In", FIL: "Dine-In" },
  "Takeout": { EN: "Takeout", FIL: "I-uwi" },

  "Customer Name": { EN: "Customer Name", FIL: "Pangalan ng Customer" },
  "Table Number": { EN: "Table Number", FIL: "Numero ng Mesa" },
  "Pickup Time": { EN: "Pickup Time", FIL: "Oras ng Pickup" },
  "Total:": { EN: "Total:", FIL: "Kabuuan:" },
  "Total": { EN: "Total", FIL: "Kabuuan" },
  
  "Customize": { EN: "Customize", FIL: "I-customize" },
  "Size": { EN: "Size", FIL: "Laki" },
  "Sugar Level": { EN: "Sugar Level", FIL: "Dami ng Asukal" },
  "Add-Ons": { EN: "Add-Ons", FIL: "Mga Dagdag" },
  "Special Notes": { EN: "Special Notes", FIL: "Espesyal na Notes" },
  "Base:": { EN: "Base:", FIL: "Basehan:" },
  "Included": { EN: "Included", FIL: "Kasama" },
  "Confirm to Cart": { EN: "Confirm to Cart", FIL: "Ilagay sa Cart" },
  "Notes for barista...": { EN: "Notes for barista...", FIL: "Mabilin sa barista..." },
  // Dashboard
  "Profile": { EN: "Profile", FIL: "Profile" },
  "Welcome,": { EN: "Welcome,", FIL: "Mabuhay," },
  "Here is your activity overview.": { EN: "Here is your activity overview.", FIL: "Narito ang buod ng iyong aktibidad." },
  "Total Orders": { EN: "Total Orders", FIL: "Kabuuang Orders" },
  "Total Spent": { EN: "Total Spent", FIL: "Kabuuang Nagastos" },
  "Completed": { EN: "Completed", FIL: "Nakumpleto" },
  "#1 Favorite": { EN: "#1 Favorite", FIL: "#1 Paborito" },
  "View Leaderboard": { EN: "View Leaderboard", FIL: "Tignan ang Leaderboard" },
  "Order Now": { EN: "Order Now", FIL: "Umorder Na" },
  "Browse the menu and place an order": { EN: "Browse the menu and place an order", FIL: "Tignan ang menu at mag-order" },
  "Scan QR": { EN: "Scan QR", FIL: "I-scan ang QR" },
  "Scan table QR to order quickly": { EN: "Scan table QR to order quickly", FIL: "I-scan ang QR ng mesa para mabilis umorder" },
  "Recent Orders": { EN: "Recent Orders", FIL: "Mga Nakaraang Order" },
  "View All": { EN: "View All", FIL: "Tignan Lahat" },
  "Your Recent Orders": { EN: "Your Recent Orders", FIL: "Ang Iyong Mga Nakaraang Order" },
  
  "Hello,": { EN: "Hello,", FIL: "Kamusta," },
  "Manage orders and monitor store performance.": { EN: "Manage orders and monitor store performance.", FIL: "Pamahalaan ang mga order at bantayan ang takbo ng benta." },
  
  // Admin & Staff Panels
  "Admin Panel": { EN: "Admin Panel", FIL: "Admin Panel" },
  "Staff Panel": { EN: "Staff Panel", FIL: "Staff Panel" },
  "Analytics": { EN: "Analytics", FIL: "Analytics" },
  "Menu": { EN: "Menu", FIL: "Menu" },
  "Sales": { EN: "Sales", FIL: "Benta" },
  "Tables": { EN: "Tables", FIL: "Mga Mesa" },
  "Admin Dashboard": { EN: "Admin Dashboard", FIL: "Admin Dashboard" },
  "Staff Dashboard": { EN: "Staff Dashboard", FIL: "Staff Dashboard" },
  "Overview of system activity for today.": { EN: "Overview of system activity for today.", FIL: "Buod ng aktibidad sa sistema ngayong araw." },
  "Manage orders and tables for today's shift.": { EN: "Manage orders and tables for today's shift.", FIL: "Pamahalaan ang mga order at mesa para sa shift ngayon." },
  "Today's Revenue": { EN: "Today's Revenue", FIL: "Benta Ngayong Araw" },
  "Today's Orders": { EN: "Today's Orders", FIL: "Orders Ngayong Araw" },
  "Pending Orders": { EN: "Pending Orders", FIL: "Mga Nakabinbing Order" },
  "Completed Orders": { EN: "Completed Orders", FIL: "Mga Nakumpletong Order" },
  "Pending": { EN: "Pending", FIL: "Nakabinbin" },
  "Occupied Tables": { EN: "Occupied Tables", FIL: "Mga Okupadong Mesa" },
  "Orders": { EN: "Orders", FIL: "Mga Order" },
  "Live Orders": { EN: "Live Orders", FIL: "Mga Live na Order" },
  "Order ID": { EN: "Order ID", FIL: "Order ID" },
  "Customer": { EN: "Customer", FIL: "Customer" },
  "Type": { EN: "Type", FIL: "Uri" },
  "Status": { EN: "Status", FIL: "Status" },
  "Items": { EN: "Items", FIL: "Mga Item" },
  "Date": { EN: "Date", FIL: "Petsa" },
  "Action": { EN: "Action", FIL: "Aksyon" },
  "Actions": { EN: "Actions", FIL: "Mga Aksyon" },
  "Void": { EN: "Void", FIL: "I-void" },
  "Mark Ready": { EN: "Mark Ready", FIL: "Itakdang Ready" },
  "Mark Completed": { EN: "Mark Completed", FIL: "Itakdang Nakumpleto" },
  "Mark Preparing": { EN: "Mark Preparing", FIL: "Itakdang Inihahanda" },
  "Cancel": { EN: "Cancel", FIL: "Kanselahin" },
  "Cancel Order": { EN: "Cancel Order", FIL: "Kanselahin ang Order" },
  "Void Order": { EN: "Void Order", FIL: "I-void ang Order" },
  "Reason for voiding...": { EN: "Reason for voiding...", FIL: "Dahilan ng pag-void..." },
  "Provide a reason for voiding this order. This action will restore inventory.": { EN: "Provide a reason for voiding this order. This action will restore inventory.", FIL: "Magbigay ng dahilan para sa pag-void ng order na ito. Ibabalik nito ang imbentaryo." },
  "Void Reason:": { EN: "Void Reason:", FIL: "Dahilan ng pag-void:" },
  "Are you sure you want to cancel this order?": { EN: "Are you sure you want to cancel this order?", FIL: "Sigurado ka bang gusto mong kanselahin ang order na ito?" },
  "Yes, Cancel": { EN: "Yes, Cancel", FIL: "Oo, Kanselahin" },
  "No, Keep": { EN: "No, Keep", FIL: "Hindi, Ituloy" },
  "View Reason": { EN: "View Reason", FIL: "Tignan ang Dahilan" },
  "Close": { EN: "Close", FIL: "Isara" },
  
  "Leave a review": { EN: "Leave a review", FIL: "Mag-iwan ng review" },
  "reviews": { EN: "reviews", FIL: "mga review" }
};

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "EN",
  toggleLanguage: () => {},
  t: (key: string) => key,
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguage] = useState<Language>("EN");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("spylt_lang");
    if (saved === "FIL") setLanguage("FIL");
    setMounted(true);
  }, []);

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const next = prev === "EN" ? "FIL" : "EN";
      localStorage.setItem("spylt_lang", next);
      return next;
    });
  };

  const t = (key: string) => {
    // Avoid hydration mismatch by waiting for mount if possible, 
    // but typically it's fine since we default to EN on server.
    if (!mounted) return key; 
    
    if (!translations[key]) return key;
    return translations[key][language];
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
