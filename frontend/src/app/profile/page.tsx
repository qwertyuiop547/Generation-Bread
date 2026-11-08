"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authHeaders";
import { signOut } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import BrandLogo from "@/components/BrandLogo";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface StaffPayroll {
  total_display: string;
  regular_display: string;
  overtime_display: string;
  overtime_hours: number;
  overtime_multiplier: number;
  weighted_overtime_hours: number;
  weighted_overtime_display: string;
  overtime_days: number;
  shift_count: number;
  week_start: string;
  week_end: string;
  includes_active_shift: boolean;
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { ...opts, year: "numeric" };
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", yearOpts)}`;
  }
  return `${s.toLocaleDateString("en-US", yearOpts)} – ${e.toLocaleDateString("en-US", yearOpts)}`;
}

export default function ProfilePage() {
  const { isLoggedIn, isAuthLoading, isAdmin, isStaff, user, updateUser, changePassword } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  // Form states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  // Password states
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Photo states
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Weekly hours & overtime (staff/admin)
  const [staffPayroll, setStaffPayroll] = useState<StaffPayroll | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthLoading && !isLoggedIn) {
      router.push("/");
    }
  }, [mounted, isAuthLoading, isLoggedIn, router]);

  useEffect(() => {
    if (user) {
      setNameValue(user.name);
      if (user.image) setPhotoPreview(user.image);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.email || (!isStaff && !isAdmin)) return;

    let cancelled = false;

    const fetchPayroll = async () => {
      setPayrollLoading(true);
      try {
        const res = await authFetch(
          `${API_BASE_URL}/api/auth/shift/payroll/?email=${encodeURIComponent(user.email)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setStaffPayroll(data);
      } catch {
        if (!cancelled) setStaffPayroll(null);
      } finally {
        if (!cancelled) setPayrollLoading(false);
      }
    };

    fetchPayroll();
    const interval = setInterval(fetchPayroll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.email, isStaff, isAdmin]);

  if (!mounted || isAuthLoading || !isLoggedIn || !user) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    updateUser({ name: nameValue.trim() });
    setEditingName(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }

    setDeleteLoading(true);
    setDeleteError("");

    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/delete-account/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("spylt_access_token")}`,
        },
      });

      if (res.ok) {
        localStorage.removeItem("spylt_access_token");
        localStorage.removeItem("spylt_refresh_token");
        localStorage.removeItem("spylt_user");
        localStorage.removeItem("spylt_local_orders");
        localStorage.removeItem("spylt_users");
        localStorage.removeItem("spylt_lifetime_stats_" + user?.email);
        localStorage.removeItem("spylt_dismissed_notifs");

        await signOut({ redirect: false });
        window.location.href = "/";
      } else {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete account. Try again.");
      }
    } catch {
      setDeleteError("Failed to delete account. Check your connection.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all fields.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    const success = changePassword(currentPassword, newPassword);
    if (success) {
      setPasswordSuccess("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setPasswordSuccess("");
        setShowPasswordForm(false);
      }, 2500);
    } else {
      setPasswordError("Current password is incorrect.");
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      updateUser({ image: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    updateUser({ image: undefined as unknown as string });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const displayInitial = user.name?.charAt(0)?.toUpperCase() || "?";
  const isGoogleUser = user.provider === "google";

  return (
    <div className="min-h-screen app-canvas relative overflow-x-hidden pb-16">
      {/* Warm Ambient Backdrop Glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 8% 0%, rgba(227,164,88,0.18), transparent 55%), radial-gradient(ellipse 50% 35% at 95% 5%, rgba(82,49,34,0.06), transparent 50%)",
        }}
      />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 border-b border-dark-brown/10 app-header-bar backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-5 md:px-8 py-3.5">
          {/* Brand & Breadcrumbs */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <CroissantLogoIcon className="w-6 h-6 text-dark-brown" strokeWidth={18} />
              <span className="font-sans font-bold uppercase tracking-tight text-dark-brown text-lg hidden sm:inline-block">
                Generation Bread
              </span>
            </Link>
            <span className="text-dark-brown/30 font-bold">/</span>
            <span className="font-paragraph text-xs uppercase tracking-[0.2em] font-bold text-dark-brown/70">
              My Profile
            </span>
          </div>

          {/* Quick Navigation to Dashboard / Panels */}
          <div className="flex items-center gap-2">
            <Link
              href={isAdmin ? "/admin" : isStaff ? "/staff" : "/dashboard"}
              className="bg-dark-brown hover:bg-dark-brown-hover text-milk font-bold uppercase tracking-wider text-xs rounded-full py-2 px-4 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              {isAdmin ? "Admin Panel" : isStaff ? "Staff Kitchen" : "Dashboard"}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-3xl mx-auto px-5 md:px-8 py-8 space-y-6">

        {/* ─── Profile Hero Card ─── */}
        <section className="bg-white/90 backdrop-blur-md rounded-3xl border border-dark-brown/10 shadow-[0_8px_30px_rgba(82,49,34,0.06)] p-6 sm:p-8 transition-shadow">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar Stage */}
            <div className="relative flex-shrink-0">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border-2 border-light-brown/60 ring-4 ring-light-brown/15 bg-gradient-to-br from-light-brown/20 to-mid-brown/20 shadow-inner flex items-center justify-center">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt={user.name || "Profile"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-dark-brown via-mid-brown to-dark-brown flex items-center justify-center text-milk">
                    <span className="font-sans text-5xl font-extrabold uppercase">
                      {displayInitial}
                    </span>
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-dark-brown hover:bg-light-brown text-milk hover:text-dark-brown flex items-center justify-center shadow-lg transition-all hover:scale-105 cursor-pointer border-3 border-white"
                title="Change profile photo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            {/* Profile Details */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              {editingName ? (
                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="bg-milk/60 border-2 border-light-brown text-dark-brown font-bold text-xl rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-light-brown/30 w-full sm:w-auto transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") {
                        setEditingName(false);
                        setNameValue(user.name);
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveName}
                      className="bg-light-brown hover:bg-mid-brown text-dark-brown hover:text-milk font-bold text-xs uppercase tracking-wider rounded-xl py-2.5 px-4 transition-all shadow-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setNameValue(user.name);
                      }}
                      className="bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-xl py-2.5 px-4 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h2 className="font-sans text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-dark-brown leading-none">
                    {user.name}
                  </h2>
                  <button
                    onClick={() => setEditingName(true)}
                    className="w-8 h-8 rounded-xl bg-dark-brown/5 hover:bg-light-brown/30 text-dark-brown flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
                    title="Edit display name"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  {nameSaved && (
                    <span className="text-emerald-800 bg-emerald-100 font-bold text-xs px-3 py-1 rounded-full animate-pulse border border-emerald-200">
                      ✓ Saved
                    </span>
                  )}
                </div>
              )}

              <p className="font-paragraph text-dark-brown/70 text-sm mt-1.5 break-all font-medium">
                {user.email}
              </p>

              {/* Status & Role Badges */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3.5">
                {(user.role === "admin" || user.role === "staff") && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      user.role === "admin"
                        ? "bg-light-brown/25 text-dark-brown border border-light-brown/50"
                        : "bg-red-brown/15 text-red-brown border border-red-brown/30"
                    }`}
                  >
                    {user.role === "admin" ? "👑 Admin" : "⭐ Staff"}
                  </span>
                )}

                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-dark-brown/5 text-dark-brown/80 border border-dark-brown/10">
                  {isGoogleUser ? "Google Auth" : "Email & Password"}
                </span>
              </div>

              {/* Photo Upload & Remove Buttons */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-5 pt-4 border-t border-dark-brown/10">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-dark-brown/5 hover:bg-light-brown/30 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-xl py-2 px-3.5 transition-all border border-dark-brown/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>Upload Photo</span>
                </button>

                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="flex items-center gap-1.5 bg-red-brown/10 hover:bg-red-brown hover:text-milk text-red-brown font-bold text-xs uppercase tracking-wider rounded-xl py-2 px-3.5 transition-all border border-red-brown/20"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Remove</span>
                  </button>
                )}

                <span className="text-dark-brown/40 text-[11px] font-medium ml-1">
                  PNG, JPG up to 2MB
                </span>
              </div>
            </div>
          </div>

          {/* ─── Staff Shift / Payroll Panel (For Staff & Admin) ─── */}
          {(isStaff || isAdmin) && (
            <div className="mt-6 pt-6 border-t border-dark-brown/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-gradient-to-r from-light-brown/15 via-[#fffbf6] to-mid-brown/10 border border-light-brown/30 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-light-brown/30 text-dark-brown flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div>
                    <p className="font-sans text-xs font-bold text-dark-brown uppercase tracking-wider">
                      Weekly Shift Hours
                    </p>
                    {staffPayroll?.week_start && staffPayroll?.week_end && (
                      <p className="font-paragraph text-dark-brown/60 text-xs mt-0.5">
                        {formatWeekRange(staffPayroll.week_start, staffPayroll.week_end)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-center sm:text-right">
                  {payrollLoading ? (
                    <div className="h-8 w-20 bg-light-brown/20 rounded-lg animate-pulse mx-auto sm:mx-0 sm:ml-auto" />
                  ) : (
                    <>
                      <p className="font-sans text-3xl font-extrabold text-dark-brown tabular-nums leading-none">
                        {staffPayroll?.total_display ?? "—"}
                      </p>
                      {staffPayroll && (
                        <p className="font-paragraph text-dark-brown/60 text-xs mt-1">
                          {staffPayroll.shift_count} shift{staffPayroll.shift_count === 1 ? "" : "s"} logged
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {staffPayroll && !payrollLoading && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/80 border border-dark-brown/10 px-4 py-3 text-center sm:text-left shadow-sm">
                    <p className="font-paragraph text-[10px] font-bold text-dark-brown/60 uppercase tracking-wider">
                      Regular
                    </p>
                    <p className="font-sans text-xl font-bold text-dark-brown tabular-nums mt-0.5">
                      {staffPayroll.regular_display}
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-center sm:text-left shadow-sm ${
                      staffPayroll.overtime_hours > 0
                        ? "bg-light-brown/20 border-light-brown/50"
                        : "bg-white/80 border-dark-brown/10"
                    }`}
                  >
                    <p className="font-paragraph text-[10px] font-bold text-dark-brown uppercase tracking-wider">
                      Overtime
                    </p>
                    <p className="font-sans text-xl font-bold text-dark-brown tabular-nums mt-0.5">
                      {staffPayroll.overtime_display}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/80 border border-dark-brown/10 px-4 py-3 text-center sm:text-left shadow-sm">
                    <p className="font-paragraph text-[10px] font-bold text-dark-brown/60 uppercase tracking-wider">
                      OT × {staffPayroll.overtime_multiplier}
                    </p>
                    <p className="font-sans text-xl font-bold text-dark-brown tabular-nums mt-0.5">
                      {staffPayroll.weighted_overtime_display}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─── Account Details Section ─── */}
        <section className="bg-white/90 backdrop-blur-md rounded-3xl border border-dark-brown/10 shadow-[0_8px_30px_rgba(82,49,34,0.06)] p-6 sm:p-7">
          <h3 className="font-sans text-xl font-bold uppercase tracking-tight text-dark-brown mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-mid-brown">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Account Details
          </h3>

          <div className="divide-y divide-dark-brown/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5">
              <div>
                <p className="font-paragraph text-[11px] font-bold text-dark-brown/60 uppercase tracking-wider">
                  Display Name
                </p>
                <p className="font-paragraph font-bold text-dark-brown mt-0.5 text-base">
                  {user.name}
                </p>
              </div>
              <button
                onClick={() => setEditingName(true)}
                className="self-start sm:self-auto text-mid-brown hover:text-dark-brown font-bold text-xs uppercase tracking-wider mt-2 sm:mt-0 transition-colors"
              >
                Edit
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5">
              <div>
                <p className="font-paragraph text-[11px] font-bold text-dark-brown/60 uppercase tracking-wider">
                  Email Address
                </p>
                <p className="font-paragraph font-bold text-dark-brown mt-0.5 text-base">
                  {user.email}
                </p>
              </div>
              <span className="self-start sm:self-auto bg-emerald-100/90 text-emerald-800 border border-emerald-200 font-bold text-xs px-3 py-1 rounded-full mt-2 sm:mt-0">
                ✓ Verified
              </span>
            </div>

            {(user.role === "admin" || user.role === "staff") && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5">
                <div>
                  <p className="font-paragraph text-[11px] font-bold text-dark-brown/60 uppercase tracking-wider">
                    Role & Permissions
                  </p>
                  <p className="font-paragraph font-bold text-dark-brown capitalize mt-0.5 text-base">
                    {user.role}
                  </p>
                </div>
                <span
                  className={`self-start sm:self-auto font-bold text-xs px-3 py-1 rounded-full mt-2 sm:mt-0 uppercase tracking-wider ${
                    user.role === "admin"
                      ? "bg-light-brown/25 text-dark-brown border border-light-brown/50"
                      : "bg-red-brown/15 text-red-brown border border-red-brown/30"
                  }`}
                >
                  {user.role === "admin" ? "⭐ Admin" : "Staff"}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5">
              <div>
                <p className="font-paragraph text-[11px] font-bold text-dark-brown/60 uppercase tracking-wider">
                  Sign-In Provider
                </p>
                <p className="font-paragraph font-bold text-dark-brown capitalize mt-0.5 text-base">
                  {user.provider === "google" ? "Google OAuth" : "Email & Password"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Preferences Section ─── */}
        <section className="bg-white/90 backdrop-blur-md rounded-3xl border border-dark-brown/10 shadow-[0_8px_30px_rgba(82,49,34,0.06)] p-6 sm:p-7">
          <h3 className="font-sans text-xl font-bold uppercase tracking-tight text-dark-brown mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-mid-brown">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Preferences
          </h3>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-milk/50 rounded-2xl border border-dark-brown/10">
            <div>
              <p className="font-paragraph text-[11px] font-bold text-dark-brown/60 uppercase tracking-wider">
                Color Mode
              </p>
              <p className="font-paragraph font-bold text-dark-brown text-sm mt-0.5">
                Warm Café / Cool Sky Theme
              </p>
            </div>
            <ThemeToggle className="self-start sm:self-auto flex-shrink-0" />
          </div>
        </section>

        {/* ─── Security / Password Section ─── */}
        <section className="bg-white/90 backdrop-blur-md rounded-3xl border border-dark-brown/10 shadow-[0_8px_30px_rgba(82,49,34,0.06)] p-6 sm:p-7">
          <h3 className="font-sans text-xl font-bold uppercase tracking-tight text-dark-brown mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-mid-brown">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Security & Login
          </h3>

          {isGoogleUser ? (
            <div className="bg-milk/50 rounded-2xl p-4 flex items-start gap-3 border border-dark-brown/10">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div>
                <p className="font-paragraph font-bold text-dark-brown text-sm">Managed via Google</p>
                <p className="font-paragraph text-dark-brown/65 text-xs mt-0.5">
                  Your credentials and authentication are handled securely through your Google Account.
                </p>
              </div>
            </div>
          ) : (
            <>
              {!showPasswordForm ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(true)}
                  className="flex items-center justify-between bg-milk/50 hover:bg-milk text-dark-brown font-bold text-xs uppercase tracking-wider rounded-2xl py-3.5 px-4 transition-all w-full border border-dark-brown/10 hover:border-dark-brown/20"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mid-brown">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <span>Change Account Password</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6"></path>
                  </svg>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="flex flex-col gap-4 bg-milk/40 p-5 rounded-2xl border border-dark-brown/10">
                  {passwordError && (
                    <div className="bg-red-brown/10 border border-red-brown/25 text-red-brown rounded-xl px-4 py-2.5 text-xs font-bold text-center">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2.5 text-xs font-bold text-center">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="font-paragraph text-[11px] font-bold text-dark-brown/70 uppercase tracking-wider">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white border border-dark-brown/15 focus:border-light-brown focus:ring-2 focus:ring-light-brown/20 text-dark-brown rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-dark-brown/30 text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-paragraph text-[11px] font-bold text-dark-brown/70 uppercase tracking-wider">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white border border-dark-brown/15 focus:border-light-brown focus:ring-2 focus:ring-light-brown/20 text-dark-brown rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-dark-brown/30 text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-paragraph text-[11px] font-bold text-dark-brown/70 uppercase tracking-wider">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white border border-dark-brown/15 focus:border-light-brown focus:ring-2 focus:ring-light-brown/20 text-dark-brown rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-dark-brown/30 text-sm"
                    />
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-dark-brown hover:bg-dark-brown-hover text-milk font-bold text-xs uppercase tracking-wider rounded-xl py-3 transition-all shadow-md"
                    >
                      Update Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setPasswordError("");
                        setPasswordSuccess("");
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }}
                      className="bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-xl py-3 px-4 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        {/* ─── Quick Actions ─── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href={isAdmin ? "/admin" : isStaff ? "/staff" : "/dashboard"}
            className="group bg-gradient-to-br from-dark-brown via-[#3d2419] to-dark-brown text-milk rounded-3xl p-5 sm:p-6 transition-all hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-between"
          >
            <div>
              <p className="font-sans font-extrabold uppercase text-xl tracking-tight text-white">
                {isAdmin ? "Admin Panel" : isStaff ? "Staff Kitchen" : "My Dashboard"}
              </p>
              <p className="font-paragraph text-milk/75 text-xs mt-1">
                {isAdmin || isStaff ? "Access management & operations" : "View your orders & history"}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-light-brown group-hover:text-dark-brown transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </Link>

          <Link
            href="/order"
            className="group bg-gradient-to-br from-light-brown to-mid-brown text-dark-brown rounded-3xl p-5 sm:p-6 transition-all hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-between"
          >
            <div>
              <p className="font-sans font-extrabold uppercase text-xl tracking-tight text-dark-brown">
                Order Bakes Now
              </p>
              <p className="font-paragraph text-dark-brown/85 text-xs mt-1">
                Browse our fresh bread & specialty coffee
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-dark-brown/10 flex items-center justify-center group-hover:bg-dark-brown group-hover:text-milk transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </Link>
        </section>

        {/* ─── Danger Zone: Delete Account ─── */}
        <section className="bg-red-brown/10 border border-red-brown/20 rounded-3xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-sans text-lg font-bold uppercase tracking-tight text-red-brown flex items-center gap-2">
                <span>⚠️</span>
                <span>Delete Account</span>
              </h3>
              <p className="font-paragraph text-red-brown/80 text-xs sm:text-sm mt-1">
                Permanently delete your account and all associated order history. This action cannot be reversed.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="self-start sm:self-auto bg-red-brown hover:bg-red-brown/90 text-milk font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all shadow-sm"
            >
              Delete Account
            </button>
          </div>
        </section>

      </main>

      {/* ─── Delete Account Confirmation Modal ─── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white border border-red-brown/25 rounded-3xl shadow-2xl p-6 sm:p-7 w-full max-w-md">
            <div className="w-12 h-12 rounded-2xl bg-red-brown/15 text-red-brown flex items-center justify-center mx-auto mb-4 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h3 className="font-sans text-2xl font-black uppercase tracking-tight text-red-brown text-center mb-2">
              Delete Account?
            </h3>
            <p className="font-paragraph text-dark-brown/80 text-xs sm:text-sm text-center mb-4">
              This will permanently delete your profile and active order records. Please type{" "}
              <strong className="font-mono bg-red-brown/15 px-2 py-0.5 rounded text-red-brown font-bold">
                DELETE
              </strong>{" "}
              to proceed.
            </p>
            {deleteError && (
              <p className="text-red-brown text-xs font-bold text-center mb-3 bg-red-brown/10 py-2 rounded-xl border border-red-brown/20">
                {deleteError}
              </p>
            )}
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="w-full bg-milk/50 border-2 border-red-brown/30 focus:border-red-brown focus:ring-2 focus:ring-red-brown/20 text-red-brown font-bold rounded-xl px-4 py-3 focus:outline-none transition-all placeholder:text-red-brown/30 mb-4 text-center uppercase tracking-wider"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirm("");
                  setDeleteError("");
                }}
                className="flex-1 bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-xl py-3 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 bg-red-brown hover:bg-red-brown/90 disabled:bg-red-brown/40 disabled:cursor-not-allowed text-milk font-bold text-xs uppercase tracking-wider rounded-xl py-3 transition-all shadow-md"
              >
                {deleteLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
