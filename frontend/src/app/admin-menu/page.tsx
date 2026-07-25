"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import ProductLightbox from "@/components/ProductLightbox";
import { getMenuItemImage } from "@/constants";
import { extractDominantColorFromImage } from "@/lib/extractDominantColor";
import { prepareMenuImage } from "@/lib/prepareMenuImage";

gsap.registerPlugin(useGSAP);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

function formatApiError(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as Record<string, unknown>;
  if (typeof e.error === "string" && e.error.trim()) return e.error;
  if (typeof e.detail === "string" && e.detail.trim()) return e.detail;
  if (Array.isArray(e.detail)) {
    const joined = e.detail
      .map((d) => (typeof d === "string" ? d : JSON.stringify(d)))
      .filter(Boolean)
      .join(" ");
    if (joined) return joined;
  }
  const parts: string[] = [];
  for (const [key, val] of Object.entries(e)) {
    if (key === "error" || key === "detail") continue;
    if (Array.isArray(val)) {
      const msg = val.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
      if (msg) parts.push(`${key}: ${msg}`);
    } else if (typeof val === "string" && val.trim()) {
      parts.push(`${key}: ${val}`);
    }
  }
  return parts.length ? parts.join(" · ") : fallback;
}

interface MenuItem {
  id?: number | string;
  name: string;
  category: "drink" | "food";
  color: string;
  price: number;
  description: string;
  bg_color: string;
  image_url?: string | null;
  is_hidden: boolean;
  stock?: number;
  track_stock?: boolean;
}

const defaultMenu: MenuItem[] = [
  {
    name: "Ube Cheese Pandesal",
    category: "food",
    color: "purple",
    price: 65,
    description: "Soft ube pandesal with that melty cheese pull — purple, warm, and baked fresh daily.",
    bg_color: "#5b2c6f",
    is_hidden: false,
  },
  {
    name: "Pork Floss Ensaymada",
    category: "food",
    color: "orange",
    price: 75,
    description: "Buttery ensaymada topped with savory pork floss — soft, fluffy, and filling.",
    bg_color: "#c47a2c",
    is_hidden: false,
  },
  {
    name: "Matcha Latte",
    category: "drink",
    color: "green",
    price: 149,
    description: "Smooth matcha latte with creamy milk — earthy, lightly sweet, and refreshing.",
    bg_color: "#2f5d50",
    is_hidden: false,
  },
  {
    name: "Sausage Croissant",
    category: "food",
    color: "brown",
    price: 95,
    description: "Flaky croissant wrapped around a savory sausage — golden and freshly baked.",
    bg_color: "#6b3e26",
    is_hidden: false,
  },
  {
    name: "Ham & Cheese Croissant",
    category: "food",
    color: "gold",
    price: 99,
    description: "Classic ham and cheese in a buttery croissant — melty, flaky, and satisfying.",
    bg_color: "#8a6a2f",
    is_hidden: false,
  },
  {
    name: "Pistachio Pain au Chocolat",
    category: "food",
    color: "olive",
    price: 120,
    description: "Chocolate-filled pastry with pistachio — crisp layers and a rich finish.",
    bg_color: "#6b7c3a",
    is_hidden: false,
  },
];

export default function AdminMenuPage() {
  const { isLoggedIn, isAdmin, isStaff, user, accessToken, apiFetch } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<MenuItem>({ name: "", category: "drink", color: "brown", price: 100, description: "", bg_color: "#523122", image_url: null, is_hidden: false, stock: 0, track_stock: false });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [previewProduct, setPreviewProduct] = useState<{ src: string; alt: string } | null>(null);
  const [colorMatching, setColorMatching] = useState(false);
  const [aiColorMatched, setAiColorMatched] = useState(false);
  const [aiColorAlts, setAiColorAlts] = useState<string[]>([]);
  const [justAddedId, setJustAddedId] = useState<string | number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const deleteOverlayRef = useRef<HTMLDivElement>(null);
  const deletePanelRef = useRef<HTMLDivElement>(null);
  const menuGridRef = useRef<HTMLDivElement>(null);
  const closingModalRef = useRef(false);
  const closingDeleteRef = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP({ scope: pageRef });

  const closeModal = contextSafe((afterClose?: () => void) => {
    if (!isModalOpen || closingModalRef.current) return;
    closingModalRef.current = true;

    const overlay = modalOverlayRef.current;
    const panel = modalPanelRef.current;
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

    const finish = () => {
      setIsModalOpen(false);
      closingModalRef.current = false;
      afterClose?.();
    };

    if (!overlay || !panel) {
      finish();
      return;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      finish();
      return;
    }

    const tl = gsap.timeline({ onComplete: finish });
    tl.to(overlay, { opacity: 0, duration: 0.2, ease: "power1.in" }, 0);
    tl.to(
      panel,
      {
        y: isMobile ? "100%" : 24,
        opacity: isMobile ? 1 : 0,
        scale: isMobile ? 1 : 0.96,
        duration: 0.28,
        ease: "power2.in",
      },
      0
    );
  });

  useGSAP(
    () => {
      if (!isModalOpen) return;
      closingModalRef.current = false;

      const overlay = modalOverlayRef.current;
      const panel = modalPanelRef.current;
      if (!overlay || !panel) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isMobile = window.matchMedia("(max-width: 639px)").matches;

      if (prefersReduced) {
        gsap.set(overlay, { opacity: 1 });
        gsap.set(panel, { clearProps: "all" });
        return;
      }

      gsap.set(overlay, { opacity: 0 });
      gsap.set(panel, {
        y: isMobile ? "110%" : 28,
        opacity: isMobile ? 1 : 0,
        scale: isMobile ? 1 : 0.94,
        transformOrigin: isMobile ? "center bottom" : "center center",
      });

      const blocks = panel.querySelectorAll(".menu-form-block");
      gsap.set(blocks, { opacity: 0, y: 14 });

      const tl = gsap.timeline();
      tl.to(overlay, { opacity: 1, duration: 0.28, ease: "power1.out" }, 0);
      tl.to(
        panel,
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.45,
          ease: isMobile ? "power3.out" : "back.out(1.35)",
        },
        0.02
      );
      tl.to(
        blocks,
        {
          opacity: 1,
          y: 0,
          duration: 0.32,
          stagger: 0.045,
          ease: "power2.out",
        },
        0.16
      );
    },
    { dependencies: [isModalOpen], scope: pageRef }
  );

  // Celebrate newly added menu card (after modal closes)
  useGSAP(
    () => {
      if (justAddedId == null || !menuGridRef.current) return;

      const card = menuGridRef.current.querySelector(
        `[data-menu-id="${String(justAddedId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`
      ) as HTMLElement | null;

      if (!card) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      card.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });

      if (prefersReduced) {
        setJustAddedId(null);
        return;
      }

      const tl = gsap.timeline({
        onComplete: () => setJustAddedId(null),
      });

      tl.fromTo(
        card,
        { opacity: 0, y: 40, scale: 0.88, rotate: -1.5 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          rotate: 0,
          duration: 0.65,
          ease: "back.out(1.7)",
        }
      );
      tl.fromTo(
        card,
        { boxShadow: "0 0 0 0 rgba(227,164,88,0.55)" },
        {
          boxShadow: "0 0 0 10px rgba(227,164,88,0)",
          duration: 0.7,
          ease: "power1.out",
        },
        "-=0.25"
      );
      tl.to(
        card,
        {
          clearProps: "transform,boxShadow",
          duration: 0.01,
        }
      );
    },
    { dependencies: [justAddedId, menuItems], scope: menuGridRef }
  );

  const closeDeleteModal = contextSafe((afterClose?: () => void) => {
    if (!deleteTarget || closingDeleteRef.current) return;
    closingDeleteRef.current = true;

    const overlay = deleteOverlayRef.current;
    const panel = deletePanelRef.current;

    const finish = () => {
      setDeleteTarget(null);
      setIsDeleting(false);
      closingDeleteRef.current = false;
      afterClose?.();
    };

    if (!overlay || !panel) {
      finish();
      return;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      finish();
      return;
    }

    const tl = gsap.timeline({ onComplete: finish });
    tl.to(overlay, { opacity: 0, duration: 0.18, ease: "power1.in" }, 0);
    tl.to(
      panel,
      { opacity: 0, y: 16, scale: 0.94, duration: 0.22, ease: "power2.in" },
      0
    );
  });

  useGSAP(
    () => {
      if (!deleteTarget) return;
      closingDeleteRef.current = false;

      const overlay = deleteOverlayRef.current;
      const panel = deletePanelRef.current;
      if (!overlay || !panel) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReduced) {
        gsap.set(overlay, { opacity: 1 });
        gsap.set(panel, { clearProps: "all" });
        return;
      }

      gsap.set(overlay, { opacity: 0 });
      gsap.set(panel, { opacity: 0, y: 24, scale: 0.92, transformOrigin: "center center" });

      const tl = gsap.timeline();
      tl.to(overlay, { opacity: 1, duration: 0.25, ease: "power1.out" }, 0);
      tl.to(
        panel,
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.5)" },
        0.04
      );
    },
    { dependencies: [deleteTarget], scope: pageRef }
  );

  useEffect(() => {
    if (!isModalOpen && !deleteTarget) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModalOpen, deleteTarget]);

  const safeBg =
    /^#[0-9A-Fa-f]{6}$/i.test(formData.bg_color) ? formData.bg_color : "#523122";

  const handlePhotoSelected = async (file: File | null) => {
    if (!file) {
      setImageFile(null);
      setImagePreview(editingItem?.image_url || null);
      setAiColorMatched(false);
      setAiColorAlts([]);
      return;
    }

    try {
      const prepared = await prepareMenuImage(file);
      setImageFile(prepared);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        void applyAiColorFromSource(prepared);
      };
      reader.readAsDataURL(prepared);
    } catch (err) {
      setImageFile(null);
      setImagePreview(editingItem?.image_url || null);
      setSaveError(err instanceof Error ? err.message : "Could not use that photo. Try JPEG or PNG.");
    }
  };

  const applyAiColorFromSource = async (source: File | string) => {
    setColorMatching(true);
    setAiColorMatched(false);
    try {
      const result = await extractDominantColorFromImage(source);
      setFormData((prev) => ({ ...prev, bg_color: result.hex }));
      setAiColorAlts(result.alternatives);
      setAiColorMatched(true);
    } catch {
      setAiColorAlts([]);
      setAiColorMatched(false);
    } finally {
      setColorMatching(false);
    }
  };

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && (!isLoggedIn || !isAdmin)) {
      router.push(isStaff ? "/staff" : "/");
    }
  }, [mounted, isLoggedIn, isAdmin, isStaff, router]);

  const fetchMenu = async () => {
    if (!user?.email || !accessToken) return;
    try {
      const res = await apiFetch(
        `${API_BASE_URL}/api/auth/admin/menu/?admin_email=${encodeURIComponent(user.email)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setMenuItems(data.map((d: MenuItem) => ({ ...d, category: d.category || "drink" })));
        } else {
          // If DB is empty, initialize it with defaults
          await seedDefaultMenu();
        }
      } else if (res.status === 401 || res.status === 403) {
        setSaveError("Session expired. Please log in again as admin.");
      } else {
        fallbackToLocal();
      }
    } catch {
      fallbackToLocal();
    } finally {
      setLoading(false);
    }
  };

  const seedDefaultMenu = async () => {
    try {
      for (const item of defaultMenu) {
        await apiFetch(`${API_BASE_URL}/api/auth/admin/menu/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item, admin_email: user?.email }),
        });
      }
      // Re-fetch
      const res = await apiFetch(
        `${API_BASE_URL}/api/auth/admin/menu/?admin_email=${encodeURIComponent(user?.email || "")}`
      );
      if (res.ok) setMenuItems(await res.json());
    } catch {
      fallbackToLocal();
    }
  };

  const fallbackToLocal = () => {
    const localRaw = localStorage.getItem("spylt_menu");
    if (localRaw) {
      setMenuItems(JSON.parse(localRaw));
    } else {
      setMenuItems(defaultMenu);
      localStorage.setItem("spylt_menu", JSON.stringify(defaultMenu));
    }
  };

  useEffect(() => {
    if (mounted && isLoggedIn && isAdmin && accessToken) {
      void fetchMenu();
    }
  }, [mounted, isLoggedIn, isAdmin, accessToken, user?.email]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    setSaveError(null);

    const price = Number(formData.price);
    if (!Number.isFinite(price) || price < 0) {
      setSaveError("Enter a valid price.");
      return;
    }
    if (!formData.name.trim()) {
      setSaveError("Item name is required.");
      return;
    }
    if (!formData.description.trim()) {
      setSaveError("Description is required.");
      return;
    }

    const formPayload = new FormData();
    formPayload.append("name", formData.name.trim());
    formPayload.append("category", formData.category);
    formPayload.append("color", formData.color || "brown");
    formPayload.append("price", String(price));
    formPayload.append("description", formData.description.trim());
    formPayload.append("bg_color", /^#[0-9A-Fa-f]{6}$/i.test(formData.bg_color) ? formData.bg_color : "#523122");
    formPayload.append("is_hidden", formData.is_hidden ? "true" : "false");
    formPayload.append("track_stock", formData.track_stock ? "true" : "false");
    formPayload.append("stock", String(Math.max(0, Number(formData.stock) || 0)));
    formPayload.append("admin_email", user.email);
    if (imageFile) {
      formPayload.append("image", imageFile);
    }

    try {
      if (editingItem && editingItem.id) {
        // UPDATE
        const res = await apiFetch(`${API_BASE_URL}/api/auth/admin/menu/${editingItem.id}/`, {
          method: "PUT",
          body: formPayload,
        });
        if (res.ok) {
          const updated = await res.json();
          setMenuItems(prev => prev.map(m => m.id === updated.id ? updated : m));
          closeModal();
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setSaveError("Session expired. Please log in again as admin.");
          return;
        }
        if (res.status === 429) {
          setSaveError("Too many requests. Wait a moment, then try again.");
          return;
        }
        const err = await res.json().catch(() => ({}));
        setSaveError(formatApiError(err, "Failed to update menu item."));
        return;
      }

      // CREATE
      const res = await apiFetch(`${API_BASE_URL}/api/auth/admin/menu/`, {
        method: "POST",
        body: formPayload,
      });
      if (res.ok) {
        const created = await res.json();
        const newId = created.id ?? created.name;
        // Close modal first, then reveal + animate the new card
        closeModal(() => {
          setMenuItems((prev) => [...prev, created]);
          // Next frame so the new card is in the DOM before GSAP runs
          window.requestAnimationFrame(() => setJustAddedId(newId));
        });
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setSaveError("Session expired. Please log in again as admin.");
        return;
      }
      if (res.status === 429) {
        setSaveError("Too many requests. Wait a moment, then try again.");
        return;
      }
      const err = await res.json().catch(() => ({}));
      setSaveError(formatApiError(err, "Failed to create menu item."));
    } catch {
      setSaveError("Network error. Check if the API is running.");
    }
  };

  const requestDelete = (item: MenuItem) => {
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !user?.email || isDeleting) return;
    const id = deleteTarget.id;
    if (id == null) return;

    setIsDeleting(true);
    const card = menuGridRef.current?.querySelector(
      `[data-menu-id="${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`
    ) as HTMLElement | null;

    const removeLocally = () => {
      const updated = menuItems.filter((m) => m.id !== id);
      setMenuItems(updated);
      localStorage.setItem("spylt_menu", JSON.stringify(updated));
    };

    try {
      if (typeof id === "number") {
        const res = await apiFetch(`${API_BASE_URL}/api/auth/admin/menu/${id}/`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_email: user.email }),
        });
        if (res.status === 401 || res.status === 403) {
          setIsDeleting(false);
          setSaveError("Session expired. Please log in again as admin.");
          closeDeleteModal();
          return;
        }
      }

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      closeDeleteModal(() => {
        if (card && !prefersReduced) {
          gsap.to(card, {
            opacity: 0,
            y: -18,
            scale: 0.92,
            duration: 0.35,
            ease: "power2.in",
            onComplete: removeLocally,
          });
        } else {
          removeLocally();
        }
      });
    } catch {
      closeDeleteModal(() => removeLocally());
    }
  };

  const handleToggleHide = async (item: MenuItem) => {
    if (!user?.email) return;
    const newStatus = !item.is_hidden;
    
    try {
      if (typeof item.id === "number") {
        const res = await apiFetch(`${API_BASE_URL}/api/auth/admin/menu/${item.id}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item, is_hidden: newStatus, admin_email: user.email }),
        });
        if (res.ok) {
          const updated = await res.json();
          setMenuItems(prev => prev.map(m => m.id === updated.id ? updated : m));
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setSaveError("Session expired. Please log in again as admin.");
          return;
        }
      }
      updateLocal(item.id!, { ...item, is_hidden: newStatus });
    } catch {
      updateLocal(item.id!, { ...item, is_hidden: newStatus });
    }
  };

  const updateLocal = (id: string | number, data: MenuItem) => {
    const updated = menuItems.map(m => m.id === id ? { ...m, ...data } : m);
    setMenuItems(updated);
    localStorage.setItem("spylt_menu", JSON.stringify(updated));
  };

  const openNewModal = () => {
    setEditingItem(null);
    setFormData({ name: "", category: "drink", color: "brown", price: 150, description: "", bg_color: "#523122", image_url: null, is_hidden: false, stock: 0, track_stock: false });
    setImageFile(null);
    setImagePreview(null);
    setSaveError(null);
    setColorMatching(false);
    setAiColorMatched(false);
    setAiColorAlts([]);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({ ...item, category: item.category || "drink" });
    setImageFile(null);
    setImagePreview(item.image_url || null);
    setSaveError(null);
    setColorMatching(false);
    setAiColorMatched(false);
    setAiColorAlts([]);
    setIsModalOpen(true);
  };

  if (!mounted || !isLoggedIn || !isAdmin) return null;

  return (
    <div ref={pageRef} className="min-h-screen app-canvas relative overflow-x-hidden pb-20">
      {/* Background blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      {/* Header */}
      <div className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight">Menu Manager</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <NotificationBell userEmail={user?.email} />
            <Link
              href="/admin"
              className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-3 md:px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform"><path d="m15 18-6-6 6-6" /></svg>
              <span className="hidden sm:inline">Admin Panel</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <Link href="/admin-dashboard" className="group hidden sm:flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Analytics
            </Link>
            <Link href="/admin-sales" className="group hidden sm:flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Sales
            </Link>
            <Link href="/admin-tables" className="group hidden md:flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Tables
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-10 py-8 relative z-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold uppercase tracking-tighter text-dark-brown sm:text-3xl">Menu Items</h2>
            <p className="font-paragraph text-sm text-dark-brown/60 sm:text-base">Manage your drinks, food, prices, and visibility.</p>
          </div>
          <button 
            onClick={openNewModal}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-dark-brown px-5 py-3 text-sm font-bold uppercase text-milk shadow-lg transition-all hover:bg-dark-brown-hover hover:shadow-xl sm:w-auto sm:px-6"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Drink & Food
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" /></div>
        ) : (
          <div ref={menuGridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item, idx) => (
              <div
                key={item.id || idx}
                data-menu-id={item.id ?? item.name}
                className={`menu-item-card app-panel border ${item.is_hidden ? "border-red-300 opacity-70" : "border-white/60"} ${
                  justAddedId != null && String(justAddedId) === String(item.id ?? item.name)
                    ? "ring-2 ring-light-brown/80"
                    : ""
                } rounded-3xl p-6 shadow-lg relative overflow-hidden transition-shadow hover:shadow-xl`}
              >
                <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: item.bg_color }}></div>
                <button
                  type="button"
                  className="group/img relative mb-4 mt-2 aspect-[5/4] w-full cursor-zoom-in overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-light-brown"
                  style={{ backgroundColor: item.bg_color }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewProduct({
                      src: getMenuItemImage(item.name, item.image_url, item.color),
                      alt: item.name,
                    });
                  }}
                  aria-label={`View ${item.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getMenuItemImage(item.name, item.image_url, item.color)}
                    alt={item.name}
                    className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 pointer-events-none group-hover/img:scale-105"
                    draggable={false}
                  />
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-milk backdrop-blur-sm">
                    View
                  </span>
                </button>
                <div className="flex justify-between items-start mt-2 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${(item.category || "drink") === "food" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                        {(item.category || "drink") === "food" ? "🥐 Food" : "☕ Drink"}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-dark-brown uppercase leading-tight">{item.name}</h3>
                    <p className="text-lg font-bold text-light-brown mt-1">₱{Number(item.price).toFixed(2)}</p>
                  </div>
                  {item.is_hidden && (
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded uppercase">Hidden</span>
                  )}
                </div>
                
                <p className="font-paragraph text-dark-brown/70 text-sm mb-3 line-clamp-2">{item.description}</p>
                {item.track_stock && (
                  <p className={`text-xs font-bold mb-4 ${Number(item.stock) > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    Stock: {item.stock} {Number(item.stock) === 0 && '(Out of stock)'}
                  </p>
                )}
                
                <div className="flex items-center justify-between border-t border-dark-brown/10 pt-4 mt-auto">
                  <button 
                    onClick={() => handleToggleHide(item)}
                    className={`text-xs font-bold uppercase flex items-center gap-1 ${item.is_hidden ? 'text-green-600 hover:text-green-800' : 'text-dark-brown/50 hover:text-dark-brown'}`}
                  >
                    {item.is_hidden ? '👁️ Show' : '🙈 Hide'}
                  </button>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => openEditModal(item)}
                      className="bg-light-brown/20 hover:bg-light-brown/40 text-dark-brown font-bold text-xs uppercase px-4 py-2 rounded-full transition-colors"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => requestDelete(item)}
                      className="bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs uppercase px-4 py-2 rounded-full transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Redesigned product editor — photo-first, bakery card preview */}
      {isModalOpen && (
        <div
          ref={modalOverlayRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2a1810]/75 backdrop-blur-[6px] sm:items-center sm:p-5"
          style={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={modalPanelRef}
            className="relative flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-[#fff8f1] shadow-2xl will-change-transform sm:max-h-[min(90dvh,820px)] sm:rounded-[1.75rem]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-menu-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Soft wash */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90"
              style={{
                background: `linear-gradient(180deg, ${safeBg}33 0%, transparent 100%)`,
              }}
            />

            <div className="relative flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-[max(1.1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-dark-brown/45">
                  Menu Manager
                </p>
                <h2
                  id="admin-menu-modal-title"
                  className="truncate text-[1.35rem] font-bold uppercase leading-none tracking-tight text-dark-brown sm:text-2xl"
                >
                  {editingItem ? "Edit item" : "New item"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => closeModal()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dark-brown/8 text-dark-brown/60 transition hover:bg-dark-brown/12 hover:text-dark-brown"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="relative flex min-h-0 flex-1 flex-col">
              {/* Pinned live preview — stays visible while the form scrolls (esp. mobile) */}
              <div className="menu-form-block relative z-10 shrink-0 border-b border-dark-brown/8 bg-[#fff8f1]/95 px-5 pb-3 pt-1 shadow-[0_10px_24px_-18px_rgba(82,49,34,0.55)] backdrop-blur-sm sm:px-6">
                <div
                  className="overflow-hidden rounded-2xl border border-dark-brown/8 shadow-[0_12px_40px_-18px_rgba(82,49,34,0.45)]"
                  style={{ backgroundColor: safeBg }}
                >
                  <div className="relative aspect-[5/2] bg-black/10 sm:aspect-[16/10]">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreview}
                        alt="Product preview"
                        className="absolute inset-0 h-full w-full object-cover object-center"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center text-milk/85">
                        <span className="text-2xl opacity-80">{formData.category === "food" ? "🥐" : "☕"}</span>
                        <span className="text-[11px] font-bold uppercase tracking-wider">Photo preview</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3.5 pb-2.5 pt-6 sm:pb-3 sm:pt-8">
                      <p className="truncate text-sm font-bold uppercase tracking-wide text-milk">
                        {formData.name.trim() || "Untitled item"}
                      </p>
                      <p className="text-xs font-bold text-light-brown">
                        ₱{Number(formData.price || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4 pt-4 sm:px-6">
                {/* Category segmented control */}
                <div className="menu-form-block grid grid-cols-2 gap-1 rounded-2xl bg-dark-brown/[0.06] p-1">
                  {([
                    { key: "drink" as const, label: "Drink", icon: "☕" },
                    { key: "food" as const, label: "Food", icon: "🥐" },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: opt.key })}
                      className={`rounded-xl py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                        formData.category === opt.key
                          ? "bg-white text-dark-brown shadow-sm"
                          : "text-dark-brown/45 hover:text-dark-brown/70"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {/* Name + price */}
                <div className="menu-form-block space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-dark-brown/50">
                      Item name
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Ube Cheese Pandesal"
                      className="w-full rounded-2xl border border-dark-brown/10 bg-white px-4 py-3.5 font-paragraph text-dark-brown placeholder:text-dark-brown/30 focus:border-light-brown focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-dark-brown/50">
                      Price
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-dark-brown/35">
                        ₱
                      </span>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const next = raw === "" ? 0 : Number(raw);
                          setFormData({
                            ...formData,
                            price: Number.isFinite(next) ? next : formData.price,
                          });
                        }}
                        className="w-full rounded-2xl border border-dark-brown/10 bg-white py-3.5 pl-9 pr-4 font-paragraph text-dark-brown focus:border-light-brown focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Photo upload zone */}
                <div className="menu-form-block">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-dark-brown/50">
                      Product photo
                    </label>
                    {colorMatching && (
                      <span className="animate-pulse text-[10px] font-bold uppercase tracking-wide text-mid-brown">
                        Matching color…
                      </span>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => handlePhotoSelected(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-dark-brown/20 bg-white/70 px-4 py-6 text-center transition hover:border-light-brown hover:bg-white"
                  >
                    {imagePreview ? (
                      <div className="flex w-full items-center gap-3 text-left">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-dark-brown/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-dark-brown">
                            {imageFile?.name || "Current photo"}
                          </p>
                          <p className="text-[11px] text-dark-brown/45">Tap to replace photo</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-light-brown/25 text-lg text-dark-brown transition group-hover:bg-light-brown/40">
                          +
                        </span>
                        <div>
                          <p className="text-sm font-bold text-dark-brown">Add product photo</p>
                          <p className="mt-0.5 text-[11px] text-dark-brown/45">
                            AI will pick a matching card color
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                  {imagePreview && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handlePhotoSelected(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="text-[11px] font-bold uppercase tracking-wide text-red-brown/80 hover:text-red-brown"
                      >
                        Remove photo
                      </button>
                      {aiColorMatched && !colorMatching && (
                        <span className="rounded-full bg-emerald-100/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Color matched
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card color */}
                <div className="menu-form-block">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-dark-brown/50">
                      Card color
                    </label>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-dark-brown/10 bg-white p-2.5">
                    <label
                      className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl shadow-inner ring-1 ring-dark-brown/10"
                      style={{ backgroundColor: safeBg }}
                      title="Open color picker"
                    >
                      <input
                        type="color"
                        value={safeBg}
                        onChange={(e) => {
                          setAiColorMatched(false);
                          setFormData({ ...formData, bg_color: e.target.value });
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Pick card color"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-dark-brown/40">Hex</p>
                      <input
                        type="text"
                        value={formData.bg_color}
                        onChange={(e) => {
                          setAiColorMatched(false);
                          setFormData({ ...formData, bg_color: e.target.value });
                        }}
                        placeholder="#523122"
                        className="w-full bg-transparent font-paragraph text-sm font-bold uppercase tracking-wide text-dark-brown focus:outline-none"
                      />
                    </div>
                    {imagePreview && (
                      <button
                        type="button"
                        disabled={colorMatching}
                        onClick={() => void applyAiColorFromSource(imageFile || imagePreview)}
                        className="shrink-0 rounded-xl bg-dark-brown/8 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-dark-brown transition hover:bg-dark-brown/12 disabled:opacity-50"
                      >
                        {colorMatching ? "…" : "AI match"}
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                      {aiColorAlts.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-dark-brown/40">
                            From photo
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {aiColorAlts.map((hex) => (
                              <button
                                key={`ai-${hex}`}
                                type="button"
                                title={hex}
                                onClick={() => {
                                  setFormData({ ...formData, bg_color: hex });
                                  setAiColorMatched(true);
                                }}
                                className={`h-9 w-9 rounded-full border-2 transition ${
                                  formData.bg_color.toLowerCase() === hex.toLowerCase()
                                    ? "border-dark-brown scale-105"
                                    : "border-white shadow-sm hover:scale-105"
                                }`}
                                style={{ backgroundColor: hex }}
                                aria-label={`AI color ${hex}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-dark-brown/40">
                          Bakery palette
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {["#5b2c6f", "#c47a2c", "#2f5d50", "#6b3e26", "#8a6a2f", "#6b7c3a", "#523122", "#c45c26"].map(
                            (hex) => (
                              <button
                                key={hex}
                                type="button"
                                title={hex}
                                onClick={() => {
                                  setAiColorMatched(false);
                                  setFormData({ ...formData, bg_color: hex });
                                }}
                                className={`h-9 w-9 rounded-full border-2 transition ${
                                  formData.bg_color.toLowerCase() === hex
                                    ? "border-dark-brown scale-105"
                                    : "border-white shadow-sm hover:scale-105"
                                }`}
                                style={{ backgroundColor: hex }}
                                aria-label={`Use color ${hex}`}
                              />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                </div>

                <div className="menu-form-block">
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-dark-brown/50">
                    Description
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short, warm description for the menu card"
                    className="w-full resize-none rounded-2xl border border-dark-brown/10 bg-white px-4 py-3.5 font-paragraph text-dark-brown placeholder:text-dark-brown/30 focus:border-light-brown focus:outline-none"
                  />
                </div>

                <div className="menu-form-block space-y-2 rounded-2xl border border-dark-brown/8 bg-white/60 p-3.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_hidden}
                      onChange={(e) => setFormData({ ...formData, is_hidden: e.target.checked })}
                      className="h-4 w-4 accent-dark-brown"
                    />
                    <span className="text-sm font-bold text-dark-brown">Hide from public menu</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.track_stock || false}
                      onChange={(e) => setFormData({ ...formData, track_stock: e.target.checked })}
                      className="h-4 w-4 accent-dark-brown"
                    />
                    <span className="text-sm font-bold text-dark-brown">Track inventory</span>
                  </label>
                  {formData.track_stock && (
                    <div className="pt-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-dark-brown/50">
                        Stock quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.stock || 0}
                        onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-dark-brown/10 bg-white px-4 py-3 font-paragraph text-dark-brown focus:border-light-brown focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {saveError && (
                  <div className="rounded-2xl border border-red-brown/25 bg-red-brown/10 px-4 py-3 font-paragraph text-sm text-red-brown">
                    {saveError}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-2.5 border-t border-dark-brown/8 bg-[#fff8f1]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:px-6 sm:pb-5">
                <button
                  type="button"
                  onClick={() => closeModal()}
                  className="flex-1 rounded-full bg-dark-brown/8 py-3.5 text-xs font-bold uppercase tracking-wide text-dark-brown transition hover:bg-dark-brown/12"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[1.4] rounded-full bg-dark-brown py-3.5 text-xs font-bold uppercase tracking-wide text-milk shadow-lg shadow-dark-brown/20 transition hover:bg-dark-brown-hover"
                >
                  {editingItem ? "Save changes" : "Add to menu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom delete confirmation modal */}
      {deleteTarget && (
        <div
          ref={deleteOverlayRef}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2a1810]/70 p-4 backdrop-blur-[6px]"
          style={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) closeDeleteModal();
          }}
        >
          <div
            ref={deletePanelRef}
            className="w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-[#fff8f1] shadow-2xl will-change-transform"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-menu-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-5 pt-5 sm:px-6 sm:pt-6">
              <div
                className="overflow-hidden rounded-2xl"
                style={{ backgroundColor: deleteTarget.bg_color || "#523122" }}
              >
                <div className="relative aspect-[16/10]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getMenuItemImage(deleteTarget.name, deleteTarget.image_url, deleteTarget.color)}
                    alt={deleteTarget.name}
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="truncate text-sm font-bold uppercase tracking-wide text-milk">
                      {deleteTarget.name}
                    </p>
                    <p className="text-xs font-bold text-light-brown">
                      ₱{Number(deleteTarget.price).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-5 text-center sm:px-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-700">
                ✕
              </div>
              <h3
                id="delete-menu-title"
                className="text-xl font-bold uppercase tracking-tight text-dark-brown"
              >
                Delete this item?
              </h3>
              <p className="mt-2 font-paragraph text-sm leading-relaxed text-dark-brown/60">
                <span className="font-bold text-dark-brown">{deleteTarget.name}</span> will be
                removed from the menu. This can’t be undone.
              </p>
            </div>

            <div className="flex gap-2.5 border-t border-dark-brown/8 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => closeDeleteModal()}
                className="flex-1 rounded-full bg-dark-brown/8 py-3.5 text-xs font-bold uppercase tracking-wide text-dark-brown transition hover:bg-dark-brown/12 disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void confirmDelete()}
                className="flex-[1.2] rounded-full bg-red-brown py-3.5 text-xs font-bold uppercase tracking-wide text-milk shadow-lg transition hover:bg-red-800 disabled:opacity-60"
              >
                {isDeleting ? "Deleting…" : "Yes, delete"}
              </button>
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
