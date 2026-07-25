"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import {
  fetchEtaPreview,
  localFallbackEta,
  type SmartEta,
} from "@/lib/smartEta";
import { getMenuItemImage } from "@/constants";
import { withWsToken, authHeaders } from "@/lib/authHeaders";
import QueuePositionCard from "@/components/QueuePositionCard";
import ProductLightbox from "@/components/ProductLightbox";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const CART_API_URL = `${API_BASE_URL}/api/auth/cart/`;
const ORDERS_API_URL = `${API_BASE_URL}/api/auth/orders/`;

interface MenuItem {
  id?: string | number;
  name: string;
  color: string;
  price: number;
  description: string;
  bg_color?: string;
  bgColor?: string;
  image_url?: string | null;
  category?: "drink" | "food";
}

interface MenuApiItem extends MenuItem {
  is_hidden?: boolean;
}

const defaultMenu: MenuItem[] = [
  { name: "Ube Cheese Pandesal", category: "food", color: "purple", price: 65, description: "Soft ube pandesal with that melty cheese pull — purple, warm, and baked fresh daily.", bgColor: "#5b2c6f" },
  { name: "Pork Floss Ensaymada", category: "food", color: "orange", price: 75, description: "Buttery ensaymada topped with savory pork floss — soft, fluffy, and filling.", bgColor: "#c47a2c" },
  { name: "Matcha Latte", category: "drink", color: "green", price: 149, description: "Smooth matcha latte with creamy milk — earthy, lightly sweet, and refreshing.", bgColor: "#2f5d50" },
  { name: "Sausage Croissant", category: "food", color: "brown", price: 95, description: "Flaky croissant wrapped around a savory sausage — golden and freshly baked.", bgColor: "#6b3e26" },
  { name: "Ham & Cheese Croissant", category: "food", color: "gold", price: 99, description: "Classic ham and cheese in a buttery croissant — melty, flaky, and satisfying.", bgColor: "#8a6a2f" },
  { name: "Pistachio Pain au Chocolat", category: "food", color: "olive", price: 120, description: "Chocolate-filled pastry with pistachio — crisp layers and a rich finish.", bgColor: "#6b7c3a" },
];

interface CartItem {
  lineId: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
}

function makeCartLineId() {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ensureCartLineIds(items: CartItem[]): CartItem[] {
  return items.map((item) =>
    item.lineId ? item : { ...item, lineId: makeCartLineId() }
  );
}

interface Review {
  id: string;
  userName: string;
  rating: number;
  text: string;
  date: string;
}

type CustomSize = "Small" | "Medium" | "Large";
type SugarLevel = "0%" | "25%" | "50%" | "75%" | "100%";

const sizeOptions: ReadonlyArray<{ label: CustomSize; price: number }> = [
  { label: "Small", price: 0 },
  { label: "Medium", price: 20 },
  { label: "Large", price: 40 },
];

const sugarLevels: ReadonlyArray<SugarLevel> = ["0%", "25%", "50%", "75%", "100%"];

const toBackendItems = (items: CartItem[]) =>
  items.map((item) => ({
    name: item.name,
    quantity: item.qty,
    price: item.price,
    notes: item.notes || "",
  }));

export default function OrderPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [lastOrderPrice, setLastOrderPrice] = useState(0);
  const [lastOrderItems, setLastOrderItems] = useState(0);
  const [lastOrderId, setLastOrderId] = useState("");
  const [lastOrderNumericId, setLastOrderNumericId] = useState<number | null>(null);
  const [lastOrderToken, setLastOrderToken] = useState<string | null>(null);
  const [lastOrderEta, setLastOrderEta] = useState<SmartEta | null>(null);
  const [cartQueueEta, setCartQueueEta] = useState<SmartEta | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<"choose" | "confirm" | "done">("choose");
  const [selectedPayment, setSelectedPayment] = useState<"cash" | "gcash" | "gotyme" | "card" | null>(null);
  const [lastPaymentStatus, setLastPaymentStatus] = useState<"paid" | "unpaid">("unpaid");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentSecondsLeft, setPaymentSecondsLeft] = useState(300);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isGuestCartLoaded, setIsGuestCartLoaded] = useState(false);
  const [isCartInitialized, setIsCartInitialized] = useState(false);
  const [isBackendCartSyncEnabled, setIsBackendCartSyncEnabled] = useState(true);
  const [restoredCartFromLoginRedirect, setRestoredCartFromLoginRedirect] = useState(false);
  
  const [orderType, setOrderType] = useState<"Dine-In" | "Takeout" | "Scheduled">("Takeout");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [pickupTime, setPickupTime] = useState("");

  const { isLoggedIn, user, accessToken, apiFetch } = useAuth();
  const router = useRouter();
  const { t, language, toggleLanguage } = useLanguage();

  // Re-enable backend cart sync once a JWT is available (e.g. after Google bridge).
  React.useEffect(() => {
    if (accessToken) {
      setIsBackendCartSyncEnabled(true);
    }
  }, [accessToken]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [previewProduct, setPreviewProduct] = useState<{ src: string; alt: string } | null>(null);
  const [customSize, setCustomSize] = useState<CustomSize>("Small");
  const [customSugar, setCustomSugar] = useState<SugarLevel>("100%");
  const [customAddOns, setCustomAddOns] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState("");

  // Fetch dynamic menu
  React.useEffect(() => {
    // Check for table in URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tableParam = params.get("table");
      if (tableParam) {
        setOrderType("Dine-In");
        setTableNumber(tableParam);
      }
    }

    const fetchMenu = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/menu/`);
        if (res.ok) {
          const data = await res.json();
          const mapped: MenuItem[] = (data as MenuApiItem[]).map((d) => ({
            ...d,
            category: d.category || "drink",
            bgColor: d.bg_color || d.bgColor,
            image_url: d.image_url || null,
          }));
          setMenuItems(mapped);
          localStorage.setItem("spylt_menu", JSON.stringify(mapped));
          return;
        }
      } catch {}
      
      const local = localStorage.getItem("spylt_menu");
      if (local) {
        const parsed = JSON.parse(local) as MenuApiItem[];
        setMenuItems(parsed.filter((m) => !m.is_hidden).map((m) => ({
          ...m,
          category: m.category || "drink",
          bgColor: m.bg_color || m.bgColor,
          image_url: m.image_url || null,
        })));
      } else {
        setMenuItems(defaultMenu);
      }
    };
    fetchMenu();
  }, []);

  const [reviewsData, setReviewsData] = useState<Record<string, Review[]>>({});
  const [reviewingItem, setReviewingItem] = useState<MenuItem | null>(null);
  const [ratingVal, setRatingVal] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const submitReview = () => {
    if (!reviewingItem || !user) return;
    if (ratingVal < 1 || ratingVal > 5) return;
    
    const newReview: Review = {
      id: Date.now().toString(),
      userName: user.name,
      rating: ratingVal,
      text: reviewText.trim(),
      date: new Date().toISOString()
    };

    const updatedReviews = {
      ...reviewsData,
      [reviewingItem.name]: [newReview, ...(reviewsData[reviewingItem.name] || [])]
    };

    setReviewsData(updatedReviews);
    localStorage.setItem("spylt_reviews", JSON.stringify(updatedReviews));
    
    setRatingVal(5);
    setReviewText("");
  };

  const openCustomizer = (item: typeof menuItems[0]) => {
    setCustomizingItem(item);
    setCustomSize("Small");
    setCustomSugar("100%");
    setCustomAddOns([]);
    setCustomNotes("");
  };

  const confirmAddToCart = () => {
    if (!customizingItem) return;

    const isFood = customizingItem.category === "food";
    let finalPrice = customizingItem.price;
    let fullName = customizingItem.name;

    if (!isFood) {
      if (customSize === "Medium") finalPrice += 20;
      if (customSize === "Large") finalPrice += 40;
      if (customAddOns.includes("Extra Protein")) finalPrice += 30;
      if (customAddOns.includes("Oat Milk Swap")) finalPrice += 40;
      const addOnText = customAddOns.length > 0 ? `, ${customAddOns.join(", ")}` : "";
      fullName = `${customizingItem.name} (${customSize}, ${customSugar} Sugar${addOnText})`;
    }

    addToCart(fullName, finalPrice, customNotes.trim());
    setCustomizingItem(null);
    setShowCart(true);
  };

  const getModalPrice = () => {
    if (!customizingItem) return 0;
    if (customizingItem.category === "food") return Number(customizingItem.price);
    let finalPrice = Number(customizingItem.price);
    if (customSize === "Medium") finalPrice += 20;
    if (customSize === "Large") finalPrice += 40;
    if (customAddOns.includes("Extra Protein")) finalPrice += 30;
    if (customAddOns.includes("Oat Milk Swap")) finalPrice += 40;
    return finalPrice;
  };

  const addToCart = (name: string, price: number, notes?: string) => {
    setCart((prev) => {
      // Find matching item with SAME notes to group them
      const existing = prev.find((item) => item.name === name && (item.notes || "") === (notes || ""));
      if (existing) {
        return prev.map((item) =>
          item.name === name && (item.notes || "") === (notes || "") ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { lineId: makeCartLineId(), name, price, qty: 1, notes: notes || "" }];
    });
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.lineId === lineId);
      if (existing && existing.qty > 1) {
        return prev.map((item) =>
          item.lineId === lineId ? { ...item, qty: item.qty - 1 } : item
        );
      }
      return prev.filter((item) => item.lineId !== lineId);
    });
  };

  const bumpCartLine = (lineId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.lineId === lineId ? { ...item, qty: item.qty + 1 } : item
      )
    );
  };

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Preview queue position while cart has items (before placing)
  useEffect(() => {
    if (totalItems <= 0) {
      setCartQueueEta(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const eta = await fetchEtaPreview(totalItems);
      if (!cancelled) setCartQueueEta(eta || localFallbackEta(totalItems));
    };
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [totalItems]);

  // Prefill once from account — don't re-fill when the customer clears the field
  const didPrefillName = useRef(false);
  useEffect(() => {
    if (!didPrefillName.current && user?.name) {
      setCustomerName(user.name);
      didPrefillName.current = true;
    }
  }, [user?.name]);

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isPlacingOrder) return;

    if (orderType === "Dine-In" && !tableNumber.trim()) {
      setToast({ message: "Please specify a table number.", type: "error" });
      setTimeout(() => setToast(null), 3000);
      if (!showCart) setShowCart(true);
      return;
    }

    if ((orderType === "Takeout" || orderType === "Scheduled") && !customerName.trim()) {
      setToast({ message: "Please enter your name.", type: "error" });
      setTimeout(() => setToast(null), 3000);
      if (!showCart) setShowCart(true);
      return;
    }

    if (orderType === "Scheduled" && !pickupTime) {
      setToast({ message: "Please select a pickup time.", type: "error" });
      setTimeout(() => setToast(null), 3000);
      if (!showCart) setShowCart(true);
      return;
    }

    // If not logged in, redirect to login first
    if (!isLoggedIn) {
      // Save cart to localStorage so it persists after login
      localStorage.setItem("spylt_cart", JSON.stringify(cart));
      router.push("/login?redirect=/order");
      return;
    }

    try {
      setIsPlacingOrder(true);
      const email = user?.email || "guest@test.com";
      const orderPayload = {
        email,
        total_price: totalPrice,
        items: toBackendItems(cart),
        order_type: orderType,
        table_number: orderType === "Dine-In" ? tableNumber : null,
        pickup_time: orderType === "Scheduled" ? pickupTime : null,
        customer_name: orderType !== "Dine-In" ? customerName : (user?.name || "Guest"),
      };

      // Prefer JWT (with refresh). Expired Bearer tokens used to 401 even on AllowAny.
      let res = await apiFetch(ORDERS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      // Fallback: place order without Authorization so email identity still works.
      if (res.status === 401) {
        res = await fetch(ORDERS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
        });
      }

      if (!res.ok) {
        let detail = "Failed to place order. Try again.";
        if (res.status === 429) {
          detail = "Too many orders just now. Please wait a moment and try again.";
        } else if (res.status === 401) {
          detail = "Session expired. Please sign in again.";
        } else {
          try {
            const errBody = await res.json();
            if (typeof errBody?.error === "string") detail = errBody.error;
          } catch {
            /* ignore */
          }
        }
        setToast({ message: detail, type: "error" });
        setTimeout(() => setToast(null), 4000);
        return;
      }

      const data = await res.json();
      const orderId = `ORD-${data.order_id.toString().padStart(4, "0")}`;
      setLastOrderNumericId(Number(data.order_id));
      if (data.order_token) setLastOrderToken(String(data.order_token));
      setLastOrderEta((data.eta as SmartEta) || localFallbackEta(totalItems));
      setLastOrderPrice(totalPrice);
      setLastOrderItems(totalItems);
      setLastOrderId(orderId);
      setSelectedPayment(null);
      setLastPaymentStatus("unpaid");
      setPaymentStep("choose");
      setCart([]);
      setOrderPlaced(true);
      setShowCart(false);
      setShowOrderModal(true);
    } catch (err) {
      console.error(err);
      setToast({
        message: "Unable to reach the server. Order was not sent to kitchen. Try again.",
        type: "error",
      });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const PAYMENT_OPTIONS = [
    { id: "cash" as const, label: "Cash", desc: "Pay at the counter", cashless: false, accent: "var(--color-dark-brown)" },
    { id: "gcash" as const, label: "GCash", desc: "Scan & pay via GCash", cashless: true, accent: "#007DFE" },
    { id: "gotyme" as const, label: "GoTyme", desc: "Scan & pay via GoTyme", cashless: true, accent: "#00A651" },
    { id: "card" as const, label: "Card", desc: "Debit / credit terminal", cashless: true, accent: "#1e293b" },
  ];

  const makePaymentRef = (method: string) => {
    const prefix = method === "gcash" ? "GC" : method === "gotyme" ? "GT" : method === "card" ? "CD" : "GB";
    const a = Math.floor(1000 + Math.random() * 9000);
    const b = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${a}-${b}`;
  };

  const formatPaymentTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const persistLocalPayment = (method: "cash" | "gcash" | "gotyme" | "card", paymentStatus: "paid" | "unpaid") => {
    try {
      const localOrders = JSON.parse(localStorage.getItem("spylt_local_orders") || "[]");
      const updated = localOrders.map((o: { id: string }) =>
        o.id === lastOrderId ? { ...o, paymentMethod: method, paymentStatus } : o
      );
      localStorage.setItem("spylt_local_orders", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const savePaymentChoice = async (method: "cash" | "gcash" | "gotyme" | "card") => {
    if (isSavingPayment) return;
    // Server keeps payment unpaid until staff confirms — never trust client "paid"
    const paymentStatus = "unpaid";
    setIsSavingPayment(true);
    try {
      if (lastOrderNumericId != null && user?.email) {
        try {
          const res = await fetch(`${ORDERS_API_URL}${lastOrderNumericId}/payment/`, {
            method: "PATCH",
            headers: {
              ...authHeaders({ "Content-Type": "application/json" }),
              ...(lastOrderToken ? { "X-Order-Token": lastOrderToken } : {}),
            },
            body: JSON.stringify({
              payment_method: method,
              ...(lastOrderToken ? { order_token: lastOrderToken } : {}),
            }),
          });
          if (!res.ok) throw new Error("payment save failed");
        } catch {
          persistLocalPayment(method, paymentStatus);
        }
      } else {
        persistLocalPayment(method, paymentStatus);
      }
      setPaymentStep("done");
      setLastPaymentStatus(paymentStatus);
      setIsVerifyingPayment(false);
      setToast({
        message:
          method === "cash"
            ? "Pay at the counter"
            : "Payment method saved — staff will confirm once paid",
        type: "success",
      });
      setTimeout(() => setToast(null), 2500);
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleSelectPayment = (method: "cash" | "gcash" | "gotyme" | "card") => {
    setSelectedPayment(method);
    if (method === "cash") {
      void savePaymentChoice(method);
      return;
    }
    setPaymentRef(makePaymentRef(method));
    setPaymentSecondsLeft(300);
    setIsVerifyingPayment(false);
    setPaymentStep("confirm");
  };

  const handleConfirmCashlessPaid = async () => {
    if (!selectedPayment || selectedPayment === "cash" || isVerifyingPayment || isSavingPayment) return;
    setIsVerifyingPayment(true);
    // Simulated wallet/bank verification delay for a realistic feel
    await new Promise((r) => setTimeout(r, 1600));
    await savePaymentChoice(selectedPayment);
  };

  // Countdown while waiting on cashless QR screen
  useEffect(() => {
    if (!showOrderModal || paymentStep !== "confirm" || !selectedPayment || selectedPayment === "cash") return;
    if (paymentSecondsLeft <= 0) return;
    const id = setInterval(() => {
      setPaymentSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [showOrderModal, paymentStep, selectedPayment, paymentSecondsLeft]);

  // Live payment status: when staff marks cash as paid, update this modal
  useEffect(() => {
    if (!showOrderModal || paymentStep !== "done" || lastPaymentStatus === "paid") return;
    if (!user?.email || lastOrderNumericId == null) return;

    const applyPaid = (method?: string) => {
      setLastPaymentStatus("paid");
      if (method) {
        setSelectedPayment(method as "cash" | "gcash" | "gotyme" | "card");
      }
      setToast({ message: "Payment confirmed — Paid!", type: "success" });
      setTimeout(() => setToast(null), 3000);
    };

    const wsProtocol = API_BASE_URL.startsWith("https") ? "wss://" : "ws://";
    const wsHost = API_BASE_URL.replace(/^https?:\/\//, "");
    const ws = new WebSocket(
      withWsToken(`${wsProtocol}${wsHost}/ws/orders/${user.email}/`)
    );

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "order_payment_update") return;
        if (Number(data.order_id) !== Number(lastOrderNumericId)) return;
        if (data.payment_status === "paid") {
          applyPaid(data.payment_method);
        }
      } catch {
        // ignore
      }
    };

    const pollId = setInterval(async () => {
      try {
        const res = await fetch(`${ORDERS_API_URL}${lastOrderNumericId}/`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.payment_status === "paid") {
          applyPaid(data.payment_method);
        }
      } catch {
        // ignore
      }
    }, 5000);

    return () => {
      clearInterval(pollId);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [showOrderModal, paymentStep, lastPaymentStatus, user?.email, lastOrderNumericId]);

  // Load reviews on mount
  React.useEffect(() => {
    const storedReviews = localStorage.getItem("spylt_reviews");
    if (storedReviews) {
      try {
        setReviewsData(JSON.parse(storedReviews));
      } catch {}
    }
  }, []);

  // Keep guest cart across refreshes before login.
  React.useEffect(() => {
    if (isLoggedIn) {
      setIsGuestCartLoaded(false);
      return;
    }

    const savedCart = localStorage.getItem("spylt_cart");
    if (savedCart) {
      try {
        setCart(ensureCartLineIds(JSON.parse(savedCart)));
      } catch {
        localStorage.removeItem("spylt_cart");
      }
    }

    setIsGuestCartLoaded(true);
  }, [isLoggedIn]);

  // Persist guest cart while not logged in.
  React.useEffect(() => {
    if (isLoggedIn || !isGuestCartLoaded) {
      return;
    }

    if (cart.length === 0) {
      localStorage.removeItem("spylt_cart");
      return;
    }

    localStorage.setItem("spylt_cart", JSON.stringify(cart));
  }, [cart, isLoggedIn, isGuestCartLoaded]);

  // Restore cart from localStorage after login redirect
  React.useEffect(() => {
    if (!isLoggedIn) {
      setIsBackendCartSyncEnabled(true);
      setRestoredCartFromLoginRedirect(false);
      return;
    }

    const savedCart = localStorage.getItem("spylt_cart");
    if (savedCart) {
      try {
        setCart(ensureCartLineIds(JSON.parse(savedCart)));
        setRestoredCartFromLoginRedirect(true);
        localStorage.removeItem("spylt_cart");
      } catch {
        setRestoredCartFromLoginRedirect(false);
        localStorage.removeItem("spylt_cart");
      }
    } else {
      setRestoredCartFromLoginRedirect(false);
    }
  }, [isLoggedIn]);

  // Load cart from backend when user is logged in (requires JWT).
  React.useEffect(() => {
    if (!isLoggedIn || !user?.email) {
      setIsCartInitialized(false);
      return;
    }

    // Keep local cart restored after login redirect and push it to backend via autosave effect.
    if (restoredCartFromLoginRedirect) {
      setIsCartInitialized(true);
      return;
    }

    // Wait for Google JWT bridge / email-password login before hitting protected cart API.
    if (!accessToken) {
      setIsCartInitialized(true);
      return;
    }

    let isCancelled = false;
    setIsCartInitialized(false);

    const loadCart = async () => {
      try {
        const response = await fetch(CART_API_URL, { headers: authHeaders() });
        if (!response.ok) {
          if (response.status !== 401) {
            setIsBackendCartSyncEnabled(false);
          }
          return;
        }

        const data = await response.json();
        const mapped: CartItem[] = (data.items || []).map((item: { name: string; quantity: number; price: number }) => ({
          lineId: makeCartLineId(),
          name: item.name,
          qty: item.quantity,
          price: Number(item.price),
          notes: "",
        }));

        if (!isCancelled) {
          // Never wipe a non-empty local cart with an empty backend cart (common after Google JWT arrives).
          setCart((prev) => (mapped.length > 0 ? mapped : prev.length > 0 ? prev : mapped));
          setIsBackendCartSyncEnabled(true);
        }
      } catch {
        setIsBackendCartSyncEnabled(false);
        console.warn("Failed to load cart (backend might be unavailable). Using local cart.");
      } finally {
        if (!isCancelled) {
          setIsCartInitialized(true);
        }
      }
    };

    loadCart();

    return () => {
      isCancelled = true;
    };
  }, [isLoggedIn, user?.email, accessToken, restoredCartFromLoginRedirect]);

  // Autosave cart to backend so it persists across refreshes and devices.
  React.useEffect(() => {
    if (!isLoggedIn || !user?.email || !isCartInitialized || !isBackendCartSyncEnabled || !accessToken) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(CART_API_URL, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            email: user.email,
            items: toBackendItems(cart),
          }),
        });

        if (!response.ok) {
          // 401 often means JWT not ready yet — keep sync enabled for retry.
          if (response.status === 401) {
            return;
          }
          throw new Error(`Failed to save cart: ${response.status}`);
        }
      } catch {
        setIsBackendCartSyncEnabled(false);
        console.warn("Failed to save cart to backend. Operating locally.");
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cart, isLoggedIn, user?.email, isCartInitialized, isBackendCartSyncEnabled, accessToken]);

  return (
    <div className="min-h-screen app-canvas relative overflow-hidden pb-28">
      {/* Background blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      {/* Header */}
      <div className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <Link href={isLoggedIn ? "/dashboard" : "/"} className="group flex items-center gap-2 text-dark-brown font-bold hover:text-light-brown transition-colors text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform">
                <path d="m15 18-6-6 6-6"/>
              </svg>
              {isLoggedIn ? t("Dashboard") : t("Back")}
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <span className="font-paragraph text-dark-brown text-sm hidden md:block">Hi, <strong>{user?.name}</strong></span>
                <button
                  onClick={() => { void performLogout(signOut); }}
                  className="group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                >
                  {t("Logout")}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </button>
              </div>
            ) : (
              <Link href="/login?redirect=/order" className="text-dark-brown font-bold text-sm uppercase hover:text-light-brown transition-colors">
                {t("Login")}
              </Link>
            )}
            
            <button
              onClick={toggleLanguage}
              className="bg-light-brown/20 hover:bg-light-brown/40 text-dark-brown font-bold text-xs md:text-sm rounded-full py-1.5 px-3 md:py-2 md:px-4 transition-all"
            >
              {language}
            </button>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative bg-dark-brown hover:bg-dark-brown-hover text-milk font-bold text-sm uppercase rounded-full py-2 px-5 md:py-3 md:px-8 transition-all hover:-translate-y-0.5 shadow-md"
            >
              🛒 Cart
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-light-brown text-dark-brown text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-md">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Page Title */}
      <div className="text-center pt-8 md:pt-12 pb-6 px-5">
        <h1 className="text-4xl md:text-6xl font-bold text-dark-brown uppercase tracking-tighter">{t("Our Menu")}</h1>
        <p className="font-paragraph text-dark-brown/60 mt-2 text-lg">{t("Pick your favorites and place your order")}</p>
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-5 md:px-10 max-w-6xl mx-auto">
        {menuItems.map((item) => {
          const baseQty = cart.filter(c => c.name === item.name || c.name.startsWith(item.name + " (")).reduce((sum, c) => sum + c.qty, 0);
          return (
            <div
              key={item.id ?? item.name}
              className="group relative app-panel border rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all hover:-translate-y-2 flex flex-col h-full"
            >
              {/* Item image — tap for full view */}
              <button
                type="button"
                className="relative h-52 md:h-64 w-full flex items-end justify-center overflow-hidden cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-light-brown"
                style={{ backgroundColor: item.bgColor }}
                onClick={() =>
                  setPreviewProduct({
                    src: getMenuItemImage(item.name, item.image_url, item.color),
                    alt: item.name,
                  })
                }
                aria-label={`View ${item.name}`}
              >
                <Image
                  src={getMenuItemImage(item.name, item.image_url, item.color)}
                  alt={item.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover object-[center_40%] drop-shadow-xl group-hover:scale-105 transition-transform duration-500 pointer-events-none"
                  unoptimized
                />
                <span className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-milk backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100">
                  View
                </span>
              </button>

              {/* Details */}
              <div className="p-5 md:p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-1">
                  <h2 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight leading-tight">{item.name}</h2>
                  <span className="text-xl md:text-2xl font-bold text-light-brown whitespace-nowrap ml-3">₱{item.price}</span>
                </div>
                
                {/* Rating display */}
                {(() => {
                  const itemReviews = reviewsData[item.name] || [];
                  const avgRating = itemReviews.length > 0 
                    ? (itemReviews.reduce((sum, r) => sum + r.rating, 0) / itemReviews.length).toFixed(1) 
                    : "New";
                  const ratingValue = Number(avgRating) || 5;
                  
                  return (
                    <div 
                      className="inline-flex items-center gap-2 mb-3 cursor-pointer group/rating w-fit" 
                      onClick={() => setReviewingItem(item)}
                    >
                      <div className="flex text-light-brown text-sm">
                        {"★".repeat(Math.round(ratingValue))}{"☆".repeat(5 - Math.round(ratingValue))}
                      </div>
                      <span className="text-dark-brown/60 text-xs font-bold uppercase group-hover/rating:text-dark-brown transition-colors">
                        {itemReviews.length > 0 ? `${avgRating} (${itemReviews.length} ${t("reviews")})` : t("Leave a review")}
                      </span>
                    </div>
                  );
                })()}

                <p className="font-paragraph text-dark-brown/60 text-sm mb-5 flex-1">{item.description}</p>

                {/* Add / Quantity Controls */}
                {baseQty > 0 ? (
                  <div className="flex items-center justify-between">
                    <div className="text-dark-brown font-bold text-sm bg-dark-brown/10 px-4 py-2 rounded-full">
                      {baseQty} in cart
                    </div>
                    <button
                      onClick={() => openCustomizer(item)}
                      className="bg-light-brown hover:bg-mid-brown text-dark-brown hover:text-milk uppercase font-bold text-sm rounded-full py-2 px-5 shadow-md hover:shadow-lg transition-all"
                    >
                      {t("Add More")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openCustomizer(item)}
                    className="w-full bg-light-brown hover:bg-mid-brown text-dark-brown hover:text-milk uppercase font-bold text-sm rounded-full py-3 shadow-md hover:shadow-lg transition-all"
                  >
                    {item.category === "food" ? t("Add to Cart") : t("Customize & Add")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Cart Summary */}
      {totalItems > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 w-full z-50 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto bg-dark-brown/95 backdrop-blur-xl text-milk rounded-2xl shadow-2xl p-4 md:p-5 flex items-center justify-between border border-white/10">
            <div>
              <p className="font-bold text-lg">{totalItems} item{totalItems > 1 ? "s" : ""}</p>
              <p className="text-milk/70 font-paragraph text-sm">Total: ₱{totalPrice.toFixed(2)}</p>
            </div>
            <button
              onClick={() => setShowCart(true)}
              className="bg-light-brown hover:bg-mid-brown disabled:hover:bg-light-brown text-dark-brown uppercase font-bold text-sm md:text-base rounded-full py-3 px-6 md:px-10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {t("Review Order")}
            </button>
          </div>
        </div>
      )}

      {/* Cart Slide-Over */}
      {showCart && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCart(false)}></div>
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-milk shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            {/* Cart Header */}
            <div className="flex items-center justify-between p-5 border-b border-dark-brown/10 shrink-0">
              <h2 className="text-2xl font-bold text-dark-brown uppercase tracking-tight">{t("Your Cart")}</h2>
              <button onClick={() => setShowCart(false)} className="text-dark-brown hover:text-light-brown transition-colors text-2xl font-bold">✕</button>
            </div>

            {/* Cart Items + order details (scrollable) */}
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-5xl mb-4">🛒</p>
                  <p className="font-paragraph text-dark-brown/50 text-lg">{t("Your cart is empty")}</p>
                  <p className="font-paragraph text-dark-brown/40 text-sm mt-1">{t("Add drinks or food to get started!")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {cart.map((item) => (
                    <div key={item.lineId} className="app-panel border rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex-1 pr-2">
                        <p className="font-bold text-dark-brown text-sm uppercase tracking-tight leading-tight">{item.name}</p>
                        {item.notes && (
                          <p className="font-paragraph text-dark-brown/60 text-xs italic mt-1 bg-white/40 p-1.5 rounded">
                            Note: {item.notes}
                          </p>
                        )}
                        <p className="font-paragraph text-dark-brown/60 text-sm mt-1">₱{item.price} each</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-dark-brown text-lg">₱{(item.price * item.qty).toFixed(2)}</p>
                        <div className="flex items-center bg-white rounded-full border border-dark-brown/20 p-0.5 shadow-sm">
                          <button
                            onClick={() => removeFromCart(item.lineId)}
                            className="w-6 h-6 flex items-center justify-center rounded-full text-dark-brown hover:bg-dark-brown/10 transition-colors"
                          >
                            −
                          </button>
                          <span className="px-2 text-sm font-bold text-dark-brown">{item.qty}</span>
                          <button
                            onClick={() => bumpCartLine(item.lineId)}
                            className="w-6 h-6 flex items-center justify-center rounded-full text-dark-brown hover:bg-dark-brown/10 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Order Type UI — scrolls with items so Place Order stays pinned */}
                  <div className="bg-dark-brown/5 rounded-2xl p-4 border border-dark-brown/10">
                    <div className="flex bg-dark-brown/10 rounded-xl p-1 mb-4">
                      <button
                        onClick={() => setOrderType("Dine-In")}
                        className={`flex-1 py-1.5 md:py-2 font-bold text-[10px] md:text-sm rounded-lg transition-all ${orderType === "Dine-In" ? "bg-white text-dark-brown shadow-sm" : "text-dark-brown/50 hover:text-dark-brown"}`}
                      >
                        {t("Dine-In")}
                      </button>
                      <button
                        onClick={() => setOrderType("Takeout")}
                        className={`flex-1 py-1.5 md:py-2 font-bold text-[10px] md:text-sm rounded-lg transition-all ${orderType === "Takeout" ? "bg-white text-dark-brown shadow-sm" : "text-dark-brown/50 hover:text-dark-brown"}`}
                      >
                        {t("Takeout")}
                      </button>
                      <button
                        onClick={() => setOrderType("Scheduled")}
                        className={`flex-1 py-1.5 md:py-2 font-bold text-[10px] md:text-sm rounded-lg transition-all ${orderType === "Scheduled" ? "bg-white text-dark-brown shadow-sm" : "text-dark-brown/50 hover:text-dark-brown"}`}
                      >
                        {t("Pre-Order")}
                      </button>
                    </div>
                  
                    {orderType === "Dine-In" ? (
                      <div>
                        <label className="block font-bold text-dark-brown text-sm mb-1 ml-1 cursor-pointer">{t("Table Number")}</label>
                        <input 
                          type="text" 
                          value={tableNumber} 
                          onChange={e => setTableNumber(e.target.value)} 
                          placeholder="e.g. 5"
                          className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown shadow-inner"
                        />
                      </div>
                    ) : orderType === "Takeout" ? (
                      <div>
                        <label className="block font-bold text-dark-brown text-sm mb-1 ml-1 cursor-pointer">{t("Customer Name")}</label>
                        <input 
                          type="text" 
                          value={customerName} 
                          onChange={e => setCustomerName(e.target.value)} 
                          placeholder="..."
                          className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown shadow-inner"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="block font-bold text-dark-brown text-sm mb-1 ml-1 cursor-pointer">{t("Customer Name")}</label>
                          <input 
                            type="text" 
                            value={customerName} 
                            onChange={e => setCustomerName(e.target.value)} 
                            placeholder="..."
                            className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown shadow-inner"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-dark-brown text-sm mb-1 ml-1 cursor-pointer">{t("Pickup Date & Time")}</label>
                          <input 
                            type="datetime-local" 
                            value={pickupTime} 
                            onChange={e => setPickupTime(e.target.value)} 
                            min={new Date().toISOString().slice(0, 16)}
                            className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown shadow-inner cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {cartQueueEta && (
                    <QueuePositionCard eta={cartQueueEta} />
                  )}
                </div>
              )}
            </div>

            {/* Sticky checkout footer — always visible on mobile */}
            {cart.length > 0 && (
              <div className="shrink-0 p-5 border-t border-dark-brown/10 bg-milk">
                <div className="flex justify-between items-center mb-4">
                  <p className="font-paragraph text-dark-brown/60">{t("Total")}</p>
                  <p className="text-2xl font-bold text-dark-brown">₱{totalPrice.toFixed(2)}</p>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder}
                  className="w-full bg-dark-brown hover:bg-dark-brown-hover disabled:hover:bg-dark-brown text-milk uppercase font-bold text-lg rounded-full py-4 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  {isPlacingOrder ? t("Placing...") : t("Place Order")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCustomizingItem(null)}></div>
          <div className="relative bg-milk w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-dark-brown/10 flex justify-between items-center app-chip rounded-t-3xl">
              <h2 className="text-2xl font-bold text-dark-brown uppercase tracking-tight">
                {customizingItem.category === "food" ? t("Add to Cart") : t("Customize")}
              </h2>
              <button onClick={() => setCustomizingItem(null)} className="text-dark-brown hover:text-light-brown text-2xl font-bold">✕</button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: customizingItem.bgColor }}>
                  <Image
                    src={getMenuItemImage(customizingItem.name, customizingItem.image_url, customizingItem.color)}
                    alt={customizingItem.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-dark-brown uppercase leading-tight">{customizingItem.name}</h3>
                  <p className="text-mid-brown font-bold text-sm mt-1">{t("Base:")} ₱{customizingItem.price}</p>
                </div>
              </div>

              {customizingItem.category !== "food" && (
              <>
              {/* Size */}
              <div className="mb-6">
                <h4 className="font-bold text-dark-brown mb-3 uppercase text-sm tracking-wide">{t("Size")}</h4>
                <div className="grid grid-cols-3 gap-2">
                  {sizeOptions.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setCustomSize(s.label)}
                      className={`py-2 px-1 rounded-xl border-2 text-sm font-bold transition-all flex flex-col items-center justify-center ${
                        customSize === s.label
                          ? "border-dark-brown bg-dark-brown text-milk"
                          : "border-dark-brown/20 text-dark-brown hover:border-dark-brown/50"
                      }`}
                    >
                      <span>{s.label}</span>
                      {s.price > 0 ? <span className="block text-xs opacity-70 font-normal">+₱{s.price}</span> : <span className="block text-xs opacity-70 font-normal">{t("Included")}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sugar Level */}
              <div className="mb-6">
                <h4 className="font-bold text-dark-brown mb-3 uppercase text-sm tracking-wide">{t("Sugar Level")}</h4>
                <div className="flex flex-wrap gap-2">
                  {sugarLevels.map((level) => (
                    <button
                      key={level}
                      onClick={() => setCustomSugar(level)}
                      className={`py-2 px-4 rounded-full border-2 text-sm font-bold transition-all ${
                        customSugar === level
                          ? "border-dark-brown bg-dark-brown text-milk"
                          : "border-dark-brown/20 text-dark-brown hover:border-dark-brown/50"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add-Ons */}
              <div className="mb-6">
                <h4 className="font-bold text-dark-brown mb-3 uppercase text-sm tracking-wide">{t("Add-Ons")}</h4>
                <div className="flex flex-col gap-2">
                  {[
                    { label: "Extra Protein", price: 30 },
                    { label: "Oat Milk Swap", price: 40 }
                  ].map((addon) => (
                    <label key={addon.label} className="flex items-center justify-between p-3 rounded-xl border-2 border-dark-brown/10 hover:border-dark-brown/30 cursor-pointer transition-all bg-white/30">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${customAddOns.includes(addon.label) ? "bg-dark-brown border-dark-brown" : "border-dark-brown/30 bg-white"}`}>
                          {customAddOns.includes(addon.label) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="font-bold text-dark-brown text-sm">{addon.label}</span>
                      </div>
                      <span className="text-mid-brown font-bold text-sm">+₱{addon.price}</span>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={customAddOns.includes(addon.label)}
                        onChange={(e) => {
                          if (e.target.checked) setCustomAddOns(prev => [...prev, addon.label]);
                          else setCustomAddOns(prev => prev.filter(a => a !== addon.label));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
              </>
              )}

              {/* Special Notes */}
              <div className="mb-6">
                <h4 className="font-bold text-dark-brown mb-2 uppercase text-sm tracking-wide">{t("Special Notes")}</h4>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder={t("Notes for barista...")}
                  className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown shadow-inner resize-none h-20"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-dark-brown/10 app-chip rounded-b-3xl">
              <button
                onClick={confirmAddToCart}
                className="w-full bg-dark-brown hover:bg-dark-brown-hover text-milk uppercase font-bold text-lg rounded-full py-4 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
              >
                {t("Confirm to Cart")} - ₱{getModalPrice().toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Confirmation + Payment Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (paymentStep === "done") setShowOrderModal(false);
            }}
          />
          <div
            className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] transition-all duration-300 pointer-events-none ${
              toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {toast && (
              <div className="bg-dark-brown text-milk px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10 backdrop-blur-md">
                <div className={`${toast.type === "success" ? "bg-green-500" : "bg-red-500"} rounded-full p-1`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {toast.type === "success" ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : (
                      <>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </>
                    )}
                  </svg>
                </div>
                <p className="font-bold uppercase text-xs tracking-widest">{toast.message}</p>
              </div>
            )}
          </div>

          <div className="relative bg-milk w-full max-w-md rounded-3xl shadow-2xl p-6 md:p-8 text-center max-h-[90vh] overflow-y-auto">
            <div className="w-16 h-16 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-dark-brown uppercase tracking-tight mb-1">
              {paymentStep === "done" ? "You're all set!" : "Order Placed!"}
            </h2>
            <p className="font-paragraph text-dark-brown/60 text-sm mb-4">
              {paymentStep === "choose" && "Choose how you want to pay."}
              {paymentStep === "confirm" && `Complete your ${selectedPayment?.toUpperCase()} payment.`}
              {paymentStep === "done" && (
                lastPaymentStatus === "paid"
                  ? "Payment confirmed. Your order is being prepared."
                  : selectedPayment === "cash"
                    ? "Please pay at the counter when you claim your order."
                    : "Payment recorded. Your order is being prepared."
              )}
            </p>

            <div className="bg-white/60 border-2 border-dashed border-dark-brown/30 rounded-2xl p-3 mb-4">
              <p className="font-paragraph text-dark-brown/50 text-xs uppercase mb-1">Order ID</p>
              <p className="text-xl font-bold text-dark-brown tracking-wider">{lastOrderId}</p>
              <p className="font-paragraph text-dark-brown/50 text-xs mt-1">
                Total ₱{lastOrderPrice.toFixed(2)} · {lastOrderItems} item{lastOrderItems === 1 ? "" : "s"}
              </p>
            </div>

            {lastOrderEta && paymentStep !== "choose" && (
              <div className="mb-4 text-left">
                <QueuePositionCard eta={lastOrderEta} />
              </div>
            )}

            {paymentStep === "choose" && (
              <div className="grid grid-cols-2 gap-3 mb-2 text-left">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isSavingPayment}
                    onClick={() => handleSelectPayment(opt.id)}
                    className={`rounded-2xl border-2 p-3 transition-all hover:border-light-brown hover:bg-light-brown/10 ${
                      selectedPayment === opt.id
                        ? "border-light-brown bg-light-brown/15"
                        : "border-dark-brown/15 app-chip"
                    }`}
                  >
                    <p className="font-bold text-dark-brown text-sm uppercase tracking-tight">{opt.label}</p>
                    <p className="font-paragraph text-dark-brown/50 text-xs mt-0.5">{opt.desc}</p>
                    {opt.cashless && (
                      <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-dark-brown bg-yellow-brown/20 rounded-full px-2 py-0.5">
                        Cashless
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {paymentStep === "confirm" && selectedPayment && selectedPayment !== "cash" && (() => {
              const meta = PAYMENT_OPTIONS.find((o) => o.id === selectedPayment)!;
              const expired = paymentSecondsLeft <= 0;
              // Deterministic-looking fake QR modules from payment ref
              const modules = Array.from({ length: 121 }, (_, i) => {
                const code = (paymentRef.charCodeAt(i % paymentRef.length) || 7) + i * 17;
                return code % 3 !== 0;
              });
              return (
                <div className="mb-2 text-left">
                  <div
                    className="rounded-2xl p-4 mb-4 text-white shadow-md"
                    style={{ background: `linear-gradient(145deg, ${meta.accent}, ${meta.accent}cc)` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Pay with</p>
                        <p className="text-lg font-bold uppercase tracking-tight">{meta.label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Amount due</p>
                        <p className="text-xl font-bold tabular-nums">₱{lastOrderPrice.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/20 pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider opacity-75">Merchant</p>
                        <p className="text-xs font-bold">Generation Bread</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider opacity-75">Reference</p>
                        <p className="text-xs font-bold tabular-nums">{paymentRef || "—"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mx-auto mb-3 flex w-fit flex-col items-center rounded-2xl border border-dark-brown/10 bg-white p-4 shadow-sm">
                    <div
                      className="grid grid-cols-11 gap-[2px] rounded-lg p-2"
                      style={{ background: "#fff" }}
                      aria-hidden
                    >
                      {modules.map((on, i) => (
                        <div
                          key={i}
                          className="h-2.5 w-2.5 sm:h-3 sm:w-3"
                          style={{ background: on ? meta.accent : "#f3f0ea" }}
                        />
                      ))}
                    </div>
                    <p className="mt-2 font-paragraph text-[11px] text-dark-brown/50">
                      Scan with {meta.label} app
                    </p>
                  </div>

                  <ol className="mb-3 space-y-1.5 rounded-2xl bg-dark-brown/5 px-4 py-3 font-paragraph text-xs text-dark-brown/70">
                    <li>1. Open your {meta.label} app</li>
                    <li>2. Tap Scan QR / Pay</li>
                    <li>3. Confirm ₱{lastOrderPrice.toFixed(2)} then return here</li>
                  </ol>

                  <div className="mb-3 flex items-center justify-between rounded-xl border border-dark-brown/10 bg-white/70 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-dark-brown/45">
                      Session expires in
                    </span>
                    <span className={`font-mono text-sm font-bold ${expired ? "text-red-600" : "text-dark-brown"}`}>
                      {formatPaymentTimer(paymentSecondsLeft)}
                    </span>
                  </div>

                  {expired ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentRef(makePaymentRef(selectedPayment));
                        setPaymentSecondsLeft(300);
                      }}
                      className="w-full bg-dark-brown hover:bg-dark-brown-hover text-milk uppercase font-bold text-sm rounded-full py-3 px-6 shadow-lg transition-all"
                    >
                      Generate new QR
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSavingPayment || isVerifyingPayment}
                      onClick={() => void handleConfirmCashlessPaid()}
                      className="w-full text-milk uppercase font-bold text-sm rounded-full py-3 px-6 shadow-lg transition-all disabled:opacity-60"
                      style={{ background: meta.accent }}
                    >
                      {isVerifyingPayment || isSavingPayment ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Verifying payment…
                        </span>
                      ) : (
                        "I have paid"
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isSavingPayment || isVerifyingPayment}
                    onClick={() => {
                      setSelectedPayment(null);
                      setPaymentStep("choose");
                      setIsVerifyingPayment(false);
                    }}
                    className="w-full mt-2 text-dark-brown/60 hover:text-dark-brown font-bold text-xs uppercase py-2"
                  >
                    Back to payment options
                  </button>
                </div>
              );
            })()}

            {paymentStep === "done" && (
              <div className="flex flex-col gap-3">
                {selectedPayment && (
                  <div className={`rounded-2xl border px-4 py-3 mb-1 ${
                    lastPaymentStatus === "paid"
                      ? "border-emerald-200 bg-emerald-50/80"
                      : "border-dark-brown/10 app-chip"
                  }`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/45">Payment</p>
                    <p className="font-bold text-dark-brown text-sm uppercase mt-0.5">
                      {selectedPayment}
                      <span className={`ml-2 font-paragraph text-xs normal-case ${
                        lastPaymentStatus === "paid" ? "text-emerald-700 font-bold" : "text-amber-700"
                      }`}>
                        {lastPaymentStatus === "paid" ? "· paid" : "· unpaid (counter)"}
                      </span>
                    </p>
                    {paymentRef && selectedPayment !== "cash" && lastPaymentStatus === "paid" && (
                      <p className="font-paragraph text-dark-brown/45 text-[11px] mt-1 tabular-nums">
                        Ref {paymentRef}
                      </p>
                    )}
                    {lastPaymentStatus !== "paid" && selectedPayment === "cash" && (
                      <p className="font-paragraph text-dark-brown/45 text-[11px] mt-1">
                        Waiting for staff to confirm payment at the counter…
                      </p>
                    )}
                  </div>
                )}
                <Link
                  href={`/track?id=${lastOrderId}`}
                  onClick={() => setShowOrderModal(false)}
                  className="w-full bg-dark-brown hover:bg-dark-brown-hover text-milk uppercase font-bold text-sm md:text-base rounded-full py-3 px-6 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Track Order
                </Link>
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="w-full app-chip hover:bg-milk text-dark-brown uppercase font-bold text-sm md:text-base rounded-full py-3 px-6 border border-dark-brown/20 transition-all"
                >
                  Continue Shopping
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviews Modal */}
      {reviewingItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setReviewingItem(null); setReviewText(""); setRatingVal(5); }}></div>
          <div className="relative bg-milk w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-dark-brown/10 flex justify-between items-center app-chip rounded-t-3xl">
              <h2 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight truncate pr-4">Reviews: {reviewingItem.name}</h2>
              <button onClick={() => { setReviewingItem(null); setReviewText(""); setRatingVal(5); }} className="text-dark-brown hover:text-light-brown text-2xl font-bold shrink-0">✕</button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-6">
              {/* Review Form */}
              {isLoggedIn ? (
                <div className="app-panel border rounded-2xl p-4 shadow-sm">
                  <h4 className="font-bold text-dark-brown uppercase text-sm mb-3 tracking-wide">Leave a Review</h4>
                  <div className="flex items-center gap-2 mb-3">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button 
                        key={star} 
                        onClick={() => setRatingVal(star)}
                        className={`text-2xl transition-colors hover:scale-110 ${star <= ratingVal ? "text-light-brown" : "text-dark-brown/20"}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value)}
                    placeholder="What did you think of this drink?"
                    className="w-full bg-white/60 border border-white/40 text-dark-brown font-paragraph rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-light-brown mb-3 resize-none h-24 placeholder:text-dark-brown/40"
                  />
                  <button
                    onClick={submitReview}
                    disabled={!reviewText.trim()}
                    className="bg-dark-brown hover:bg-dark-brown-hover disabled:opacity-50 disabled:hover:bg-dark-brown text-milk uppercase font-bold text-xs rounded-full py-2.5 px-6 shadow-md transition-all"
                  >
                    Submit Review
                  </button>
                </div>
              ) : (
                <div className="bg-light-brown/10 rounded-2xl p-6 text-center border border-light-brown/20">
                  <p className="font-paragraph text-dark-brown text-sm mb-3">Log in to leave a review</p>
                  <Link href="/login?redirect=/order" className="inline-block bg-dark-brown hover:bg-dark-brown-hover text-milk uppercase font-bold text-xs rounded-full py-2.5 px-8 shadow-md transition-all">
                    Login
                  </Link>
                </div>
              )}

              {/* Existing Reviews */}
              <div>
                <h4 className="font-bold text-dark-brown uppercase text-sm mb-4 tracking-wide">Customer Reviews ({(reviewsData[reviewingItem.name] || []).length})</h4>
                <div className="flex flex-col gap-4">
                  {(reviewsData[reviewingItem.name] || []).length === 0 ? (
                    <p className="font-paragraph text-dark-brown/50 text-sm italic">No reviews yet. Be the first!</p>
                  ) : (
                    (reviewsData[reviewingItem.name] || []).map(review => (
                      <div key={review.id} className="border-b border-dark-brown/10 pb-4 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-dark-brown text-sm">{review.userName}</span>
                          <span className="font-paragraph text-dark-brown/40 text-xs">{new Date(review.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex text-light-brown text-sm mb-2">
                          {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                        </div>
                        <p className="font-paragraph text-dark-brown/80 text-sm leading-relaxed">{review.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProductLightbox
        src={previewProduct?.src || ""}
        alt={previewProduct?.alt || ""}
        open={!!previewProduct}
        onClose={() => setPreviewProduct(null)}
      />
    </div>
  );
}
