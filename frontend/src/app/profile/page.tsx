"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authHeaders";
import { signOut } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";

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
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
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
          "Authorization": `Bearer ${localStorage.getItem("spylt_access_token")}`}});

      if (res.ok) {
        // Clear all localStorage data
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
    } catch (err) {
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

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return;
    }

    // Validate file size (max 2MB)
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
    <div className="min-h-screen app-canvas relative overflow-hidden pb-16">
      {/* Ambient background glows */}
      <div className="absolute top-[-10%] right-[-15%] w-[45vw] h-[45vw] bg-light-brown/20 rounded-full mix-blend-multiply filter blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-15%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown/15 rounded-full mix-blend-multiply filter blur-3xl pointer-events-none"></div>
      <div className="absolute top-[35%] left-[45%] w-[35vw] h-[35vw] bg-dark-brown/8 rounded-full mix-blend-multiply filter blur-3xl pointer-events-none"></div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-5 md:px-8 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-dark-brown hover:opacity-85 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-dark-brown flex items-center justify-center shadow-xs">
                <CroissantLogoIcon className="w-4 h-4 text-milk" />
              </div>
              <span className="font-extrabold uppercase tracking-tight text-dark-brown text-base hidden sm:inline-block">
                Generation Bread
              </span>
            </Link>
            <span className="text-dark-brown/30 font-bold hidden sm:inline-block">/</span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-dark-brown/8 text-dark-brown text-xs font-bold uppercase tracking-wider">
              <span>👤</span>
              <span>My Profile</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={isAdmin ? "/admin" : isStaff ? "/staff" : "/dashboard"}
              className="group flex items-center gap-2 bg-[#523122] hover:bg-[#381F14] text-[#FAEADE] hover:text-white font-bold text-xs uppercase tracking-wider rounded-full py-2 px-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
              <span>{isAdmin ? "Admin" : isStaff ? "Staff" : "Dashboard"}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-8 py-8 md:py-10 relative z-10 space-y-6">

        {/* 1. HERO MEMBER CARD */}
        <section className="relative overflow-hidden rounded-[32px] bg-[#FFFDF9] border border-[#EBE3D7] shadow-[0_8px_30px_rgba(82,49,34,0.06)] p-6 sm:p-8 md:p-10 transition-all duration-300">
          {/* Subtle background ambient banner */}
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-r from-light-brown/15 via-[#FAF0E4] to-mid-brown/10 pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
            {/* Avatar Stage */}
            <div className="relative flex-shrink-0 group">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-white shadow-xl ring-4 ring-light-brown/30 bg-[#F7F2EC]">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt={user.name || "Profile"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#E3A458] via-[#C98A3C] to-[#8C532B] flex items-center justify-center text-white">
                    <span className="text-4xl sm:text-5xl font-extrabold uppercase drop-shadow-sm">
                      {displayInitial}
                    </span>
                  </div>
                )}
              </div>

              {/* Camera Action Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#523122] hover:bg-[#381F14] text-[#FAEADE] hover:text-white flex items-center justify-center shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer border-2 border-white"
                title="Change profile photo"
                aria-label="Upload photo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

            {/* Profile Identity Details */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              {editingName ? (
                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="bg-white border-2 border-light-brown text-dark-brown font-extrabold text-2xl uppercase tracking-tight rounded-xl px-4 py-2 focus:outline-none focus:ring-4 focus:ring-light-brown/20 transition-all w-full sm:w-auto shadow-inner"
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
                      className="bg-[#523122] hover:bg-[#381F14] text-[#FAEADE] font-bold text-xs uppercase tracking-wider rounded-full py-2.5 px-5 shadow-sm hover:shadow-md transition-all active:scale-95"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setNameValue(user.name);
                      }}
                      className="bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-full py-2.5 px-4 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-dark-brown uppercase tracking-tight">
                    {user.name}
                  </h2>
                  <button
                    onClick={() => setEditingName(true)}
                    className="w-8 h-8 rounded-full bg-dark-brown/8 hover:bg-dark-brown/15 text-dark-brown flex items-center justify-center transition-colors cursor-pointer"
                    title="Edit display name"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  {nameSaved && (
                    <span className="text-emerald-700 bg-emerald-100 border border-emerald-300/60 font-bold text-xs px-2.5 py-1 rounded-full animate-pulse">
                      ✓ Saved!
                    </span>
                  )}
                </div>
              )}

              <p className="font-paragraph text-dark-brown/65 text-sm sm:text-base mt-1 break-all">
                {user.email}
              </p>

              {/* Status Badges */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3.5">
                {(user.role === "admin" || user.role === "staff") && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-2xs ${
                    user.role === "admin"
                      ? "bg-amber-100/90 text-amber-900 border-amber-300/70"
                      : "bg-sky-100/90 text-sky-900 border-sky-300/70"
                  }`}>
                    <span>{user.role === "admin" ? "👑" : "⭐"}</span>
                    <span>{user.role === "admin" ? "Administrator" : "Bakery Staff"}</span>
                  </span>
                )}

                {isGoogleUser ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white border border-dark-brown/15 text-dark-brown/80 shadow-2xs">
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Google SSO</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white border border-dark-brown/15 text-dark-brown/80 shadow-2xs">
                    <span>🔑</span>
                    <span>Local Account</span>
                  </span>
                )}
              </div>

              {/* Photo Upload Actions */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mt-5 pt-4 border-t border-dark-brown/10">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-[#FAF0E4] hover:bg-[#F3E2D0] border border-[#E3A458]/40 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-full py-2 px-4 transition-all duration-200 shadow-2xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                    className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 font-bold text-xs uppercase tracking-wider rounded-full py-2 px-3.5 transition-all duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Remove</span>
                  </button>
                )}
                <span className="font-paragraph text-dark-brown/45 text-[11px]">
                  JPG, PNG • Max 2MB
                </span>
              </div>
            </div>
          </div>

          {/* Staff Payroll Card (if applicable) */}
          {(isStaff || isAdmin) && (
            <div className="mt-6 pt-6 border-t border-dark-brown/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-gradient-to-br from-[#FAF0E4] to-[#F3E2D0] border border-[#E3A458]/30 px-5 py-4 shadow-2xs">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-dark-brown text-milk flex items-center justify-center flex-shrink-0 shadow-xs">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/60">
                      Total Hours This Week
                    </p>
                    {staffPayroll?.week_start && staffPayroll?.week_end && (
                      <p className="font-paragraph text-dark-brown/70 text-xs mt-0.5">
                        {formatWeekRange(staffPayroll.week_start, staffPayroll.week_end)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-center sm:text-right">
                  {payrollLoading ? (
                    <div className="h-9 w-24 bg-dark-brown/10 rounded-lg animate-pulse mx-auto sm:mx-0 sm:ml-auto" />
                  ) : (
                    <>
                      <p className="text-3xl md:text-4xl font-extrabold text-dark-brown tracking-tight tabular-nums">
                        {staffPayroll?.total_display ?? "—"}
                      </p>
                      {staffPayroll && (
                        <p className="font-paragraph text-dark-brown/60 text-xs mt-0.5">
                          {staffPayroll.shift_count} shift{staffPayroll.shift_count === 1 ? "" : "s"}
                          {staffPayroll.includes_active_shift && " · active shift in progress"}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              {staffPayroll && !payrollLoading && (
                <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white border border-[#EBE3D7] px-4 py-3 text-center sm:text-left shadow-2xs">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/50">Regular</p>
                    <p className="text-lg font-extrabold text-dark-brown tabular-nums mt-0.5">{staffPayroll.regular_display}</p>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 text-center sm:text-left shadow-2xs ${staffPayroll.overtime_hours > 0 ? "bg-amber-50 border-amber-300" : "bg-white border-[#EBE3D7]"}`}>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-800">Overtime</p>
                    <p className="text-lg font-extrabold text-amber-900 tabular-nums mt-0.5">
                      {staffPayroll.overtime_display}
                    </p>
                    {staffPayroll.overtime_hours > 0 && (
                      <p className="text-[10px] text-amber-800 font-paragraph mt-0.5">
                        {staffPayroll.overtime_days} day{staffPayroll.overtime_days === 1 ? "" : "s"} over 8h
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl bg-white border border-[#EBE3D7] px-4 py-3 text-center sm:text-left shadow-2xs">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/50">
                      OT × {staffPayroll.overtime_multiplier}
                    </p>
                    <p className="text-lg font-extrabold text-dark-brown tabular-nums mt-0.5">{staffPayroll.weighted_overtime_display}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. ACCOUNT DETAILS CARD */}
        <section className="rounded-[28px] bg-[#FFFDF9] border border-[#EBE3D7] shadow-[0_4px_20px_rgba(82,49,34,0.05)] p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-dark-brown/10">
            <h3 className="text-lg sm:text-xl font-extrabold text-dark-brown uppercase tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 bg-light-brown/25 rounded-xl flex items-center justify-center text-dark-brown shadow-2xs">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <span>Account Details</span>
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-dark-brown/40">
              Personal Information
            </span>
          </div>

          <div className="divide-y divide-dark-brown/8">
            {/* Display Name */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2 group hover:bg-[#FAF6EE]/70 rounded-xl px-2.5 -mx-2.5 transition-colors">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/45">Display Name</p>
                <p className="font-extrabold text-dark-brown text-base sm:text-lg mt-0.5">{user.name}</p>
              </div>
              <button
                onClick={() => setEditingName(true)}
                className="self-start sm:self-auto bg-dark-brown/8 hover:bg-dark-brown/15 text-dark-brown font-bold text-xs uppercase tracking-wider rounded-full py-1.5 px-4 transition-all"
              >
                Edit
              </button>
            </div>

            {/* Email */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2 group hover:bg-[#FAF6EE]/70 rounded-xl px-2.5 -mx-2.5 transition-colors">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/45">Email Address</p>
                <p className="font-extrabold text-dark-brown text-base sm:text-lg mt-0.5">{user.email}</p>
              </div>
              <span className="self-start sm:self-auto bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-[11px] uppercase tracking-wider rounded-full py-1 px-3.5 shadow-2xs flex items-center gap-1">
                <span>✓</span>
                <span>Verified</span>
              </span>
            </div>

            {/* Role (Only for Staff or Admin) */}
            {(user.role === "admin" || user.role === "staff") && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2 group hover:bg-[#FAF6EE]/70 rounded-xl px-2.5 -mx-2.5 transition-colors">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/45">Account Role</p>
                  <p className="font-extrabold text-dark-brown text-base sm:text-lg capitalize mt-0.5">{user.role}</p>
                </div>
                <span className={`self-start sm:self-auto font-bold text-[11px] uppercase tracking-wider rounded-full py-1 px-3.5 shadow-2xs border ${
                  user.role === "admin"
                    ? "bg-amber-100 border-amber-300 text-amber-900"
                    : "bg-sky-100 border-sky-300 text-sky-900"
                }`}>
                  {user.role === "admin" ? "⭐ Admin" : "Staff"}
                </span>
              </div>
            )}

            {/* Sign-in Method */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2 group hover:bg-[#FAF6EE]/70 rounded-xl px-2.5 -mx-2.5 transition-colors">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/45">Sign-in Method</p>
                <p className="font-extrabold text-dark-brown text-base sm:text-lg capitalize mt-0.5">
                  {user.provider === "google" ? "Google SSO Account" : "Email & Password"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. SETTINGS & THEME */}
        <section className="rounded-[28px] bg-[#FFFDF9] border border-[#EBE3D7] shadow-[0_4px_20px_rgba(82,49,34,0.05)] p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-dark-brown/10">
            <h3 className="text-lg sm:text-xl font-extrabold text-dark-brown uppercase tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 bg-light-brown/25 rounded-xl flex items-center justify-center text-dark-brown shadow-2xs">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <span>Preferences</span>
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-dark-brown/40">
              Appearance
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-[#FAF6EE] rounded-2xl border border-[#EBE3D7]">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-dark-brown/50">Theme Mode</p>
              <p className="font-extrabold text-dark-brown text-base mt-0.5">Warm Cream or Sky Blue</p>
              <p className="font-paragraph text-dark-brown/60 text-xs mt-1">
                Warm = café cream aesthetic. Sky = cool navy surfaces with gold accents.
              </p>
            </div>
            <ThemeToggle className="self-start sm:self-auto flex-shrink-0" />
          </div>
        </section>

        {/* 4. SECURITY & CREDENTIALS */}
        <section className="rounded-[28px] bg-[#FFFDF9] border border-[#EBE3D7] shadow-[0_4px_20px_rgba(82,49,34,0.05)] p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-dark-brown/10">
            <h3 className="text-lg sm:text-xl font-extrabold text-dark-brown uppercase tracking-tight flex items-center gap-2.5">
              <div className="w-8 h-8 bg-red-brown/15 rounded-xl flex items-center justify-center text-red-brown shadow-2xs">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <span>Security</span>
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-dark-brown/40">
              Credentials
            </span>
          </div>

          {isGoogleUser ? (
            <div className="bg-[#FAF6EE] border border-light-brown/30 rounded-2xl p-5 flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-xs flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="font-extrabold text-dark-brown text-sm">Managed by Google</p>
                <p className="font-paragraph text-dark-brown/70 text-xs mt-0.5">
                  Your login is securely handled through your Google Account. Password updates are managed via Google settings.
                </p>
              </div>
            </div>
          ) : (
            <>
              {!showPasswordForm ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(true)}
                  className="group flex items-center justify-between bg-[#FAF6EE] hover:bg-[#F3E2D0] border border-[#EBE3D7] hover:border-[#D4A373] text-dark-brown font-extrabold text-sm uppercase tracking-wider rounded-2xl py-4 px-5 sm:px-6 transition-all duration-200 w-full shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-dark-brown/70">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <span>Change Password</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-xs group-hover:translate-x-1 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6"></path>
                    </svg>
                  </div>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="flex flex-col gap-4 bg-[#FAF6EE] p-5 sm:p-6 rounded-2xl border border-[#EBE3D7]">
                  {passwordError && (
                    <div className="bg-red-100 border border-red-300 text-red-800 rounded-xl px-4 py-2.5 font-paragraph text-xs font-bold text-center">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl px-4 py-2.5 font-paragraph text-xs font-bold text-center">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="font-paragraph text-dark-brown font-extrabold text-xs uppercase tracking-wider">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white border border-[#EBE3D7] focus:border-light-brown focus:ring-2 focus:ring-light-brown/20 text-dark-brown font-paragraph rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-dark-brown/30 text-base"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-paragraph text-dark-brown font-extrabold text-xs uppercase tracking-wider">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white border border-[#EBE3D7] focus:border-light-brown focus:ring-2 focus:ring-light-brown/20 text-dark-brown font-paragraph rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-dark-brown/30 text-base"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-paragraph text-dark-brown font-extrabold text-xs uppercase tracking-wider">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white border border-[#EBE3D7] focus:border-light-brown focus:ring-2 focus:ring-light-brown/20 text-dark-brown font-paragraph rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-dark-brown/30 text-base"
                    />
                  </div>

                  <div className="flex gap-2.5 mt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-[#523122] hover:bg-[#381F14] text-[#FAEADE] hover:text-white uppercase font-extrabold text-xs tracking-wider rounded-full py-3 shadow-md hover:shadow-lg transition-all active:scale-95"
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
                      className="bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown uppercase font-extrabold text-xs tracking-wider rounded-full py-3 px-5 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        {/* 5. QUICK NAVIGATION HUB */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href={isAdmin ? "/admin" : isStaff ? "/staff" : "/dashboard"}
            className="group relative overflow-hidden bg-gradient-to-br from-[#381F14] via-[#4A2B1D] to-[#25150D] text-[#FAEADE] rounded-[24px] p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">{isAdmin ? "👑" : isStaff ? "⭐" : "📊"}</span>
                <p className="font-extrabold uppercase text-lg tracking-tight text-white">
                  {isAdmin ? "Admin Panel" : isStaff ? "Staff Panel" : "Dashboard"}
                </p>
              </div>
              <p className="font-paragraph text-[#FAEADE]/70 text-xs mt-1">
                {isAdmin || isStaff ? "Manage bakery operations & orders" : "View your orders, history & points"}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-dark-brown transition-all duration-300 group-hover:scale-110 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </Link>

          <Link
            href="/order"
            className="group relative overflow-hidden bg-gradient-to-br from-[#E3A458] via-[#DA984B] to-[#C78739] text-[#25150D] rounded-[24px] p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">🥐</span>
                <p className="font-extrabold uppercase text-lg tracking-tight text-[#25150D]">
                  Order Now
                </p>
              </div>
              <p className="font-paragraph text-[#25150D]/75 text-xs mt-1">
                Browse artisanal bakes & handcrafted sips
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center group-hover:bg-[#25150D] group-hover:text-white transition-all duration-300 group-hover:scale-110 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </Link>
        </section>

        {/* 6. DANGER ZONE (DELETE ACCOUNT) */}
        <section className="bg-red-50/70 border border-red-200/80 rounded-[28px] p-6 sm:p-7 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-red-900 uppercase tracking-tight flex items-center gap-2">
                <span>⚠️</span>
                <span>Danger Zone • Delete Account</span>
              </h3>
              <p className="font-paragraph text-red-700/80 text-xs sm:text-sm mt-1 max-w-xl">
                Permanently delete your account and all associated order history. This action cannot be reversed.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="self-start sm:self-auto bg-red-600 hover:bg-red-700 text-white font-extrabold uppercase text-xs tracking-wider py-2.5 px-5 rounded-full shadow-sm hover:shadow-md transition-all active:scale-95 flex-shrink-0"
            >
              Delete Account
            </button>
          </div>
        </section>

      </main>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#FFFDF9] border border-red-200 rounded-[32px] shadow-2xl p-6 sm:p-8 w-full max-w-md">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-4 text-2xl shadow-xs">
              ⚠️
            </div>
            <h3 className="text-xl font-extrabold text-red-900 uppercase tracking-tight text-center mb-2">
              Delete Account?
            </h3>
            <p className="font-paragraph text-red-700 text-xs sm:text-sm text-center mb-4">
              This will permanently wipe your account and all data. Type <strong className="font-mono bg-red-100 px-1.5 py-0.5 rounded text-red-900">DELETE</strong> to confirm.
            </p>
            {deleteError && (
              <p className="text-red-600 text-xs font-bold text-center mb-3 bg-red-50 py-1.5 rounded-lg border border-red-200">{deleteError}</p>
            )}
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="w-full bg-white border-2 border-red-200 focus:border-red-500 text-red-900 font-bold font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-4 focus:ring-red-100 placeholder:text-red-300 mb-5 text-center uppercase tracking-wider"
            />
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirm("");
                  setDeleteError("");
                }}
                className="flex-1 bg-dark-brown/8 hover:bg-dark-brown/15 text-dark-brown font-extrabold uppercase text-xs tracking-wider py-3 rounded-full transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-extrabold uppercase text-xs tracking-wider py-3 rounded-full transition-all shadow-md active:scale-95"
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
