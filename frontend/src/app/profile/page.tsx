"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authHeaders } from "@/lib/authHeaders";
import { signOut } from "next-auth/react";

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
        const res = await fetch(
          `${API_BASE_URL}/api/auth/shift/payroll/?email=${encodeURIComponent(user.email)}`,
          { headers: authHeaders() }
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
      <div className="min-h-screen bg-milk flex items-center justify-center">
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
      const res = await fetch(`${API_BASE_URL}/api/auth/delete-account/`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("spylt_access_token")}`,
        },
      });

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
    <div className="min-h-screen bg-milk relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] right-[-15%] w-[45vw] h-[45vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-[-15%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-15"></div>
      <div className="absolute top-[40%] left-[50%] w-[30vw] h-[30vw] bg-dark-brown rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-milk/80 backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight">My Profile</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={isAdmin ? "/admin" : isStaff ? "/staff" : "/dashboard"}
              className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-12 relative z-10">

        {/* Profile Photo & Name Header */}
        <div className="bg-white/50 backdrop-blur-sm border border-white/60 rounded-3xl p-6 md:p-10 shadow-lg mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white shadow-xl ring-4 ring-light-brown/20">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-light-brown to-mid-brown flex items-center justify-center">
                    <span className="text-milk text-4xl md:text-5xl font-bold uppercase">{displayInitial}</span>
                  </div>
                )}
              </div>
              {/* Photo overlay */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 w-28 h-28 md:w-32 md:h-32 rounded-full bg-dark-brown/0 group-hover:bg-dark-brown/50 flex items-center justify-center transition-all duration-300 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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

            {/* Name & Email */}
            <div className="flex-1 text-center sm:text-left">
              {editingName ? (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="bg-white/60 border border-white/40 text-dark-brown font-bold text-2xl md:text-3xl uppercase tracking-tighter rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-light-brown focus:bg-white transition-all w-full sm:w-auto"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") { setEditingName(false); setNameValue(user.name); } }}
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveName} className="bg-dark-brown hover:bg-[#3a2218] text-milk font-bold text-xs uppercase rounded-full py-2 px-5 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">Save</button>
                    <button onClick={() => { setEditingName(false); setNameValue(user.name); }} className="bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold text-xs uppercase rounded-full py-2 px-5 transition-all">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <h2 className="text-3xl md:text-4xl font-bold text-dark-brown uppercase tracking-tighter">{user.name}</h2>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-dark-brown/40 hover:text-dark-brown transition-colors p-1"
                    title="Edit name"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  {nameSaved && (
                    <span className="text-green-600 font-paragraph text-sm font-semibold animate-pulse">✓ Saved!</span>
                  )}
                </div>
              )}
              <p className="font-paragraph text-dark-brown/60 mt-1 text-base md:text-lg">{user.email}</p>
              {isGoogleUser && (
                <span className="inline-flex items-center gap-1.5 mt-2 bg-white/70 border border-dark-brown/10 rounded-full px-3 py-1 text-xs font-paragraph font-semibold text-dark-brown/60">
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google Account
                </span>
              )}
            </div>
          </div>

          {(isStaff || isAdmin) && (
            <div className="mt-6 pt-6 border-t border-dark-brown/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-gradient-to-br from-dark-brown/5 to-light-brown/10 border border-dark-brown/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-dark-brown/10 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dark-brown">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/50">Total Hours This Week</p>
                    {staffPayroll?.week_start && staffPayroll?.week_end && (
                      <p className="font-paragraph text-dark-brown/45 text-xs mt-0.5">
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
                      <p className="text-3xl md:text-4xl font-bold text-dark-brown tracking-tight tabular-nums">
                        {staffPayroll?.total_display ?? "—"}
                      </p>
                      {staffPayroll && (
                        <p className="font-paragraph text-dark-brown/45 text-xs mt-1">
                          {staffPayroll.shift_count} shift{staffPayroll.shift_count === 1 ? "" : "s"}
                          {staffPayroll.includes_active_shift && " · includes active shift"}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              {staffPayroll && !payrollLoading && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/60 border border-dark-brown/10 px-4 py-3 text-center sm:text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/45">Regular</p>
                    <p className="text-lg font-bold text-dark-brown tabular-nums">{staffPayroll.regular_display}</p>
                  </div>
                  <div className={`rounded-xl border px-4 py-3 text-center sm:text-left ${staffPayroll.overtime_hours > 0 ? "bg-orange-50/80 border-orange-200/70" : "bg-white/60 border-dark-brown/10"}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700/70">Overtime</p>
                    <p className={`text-lg font-bold tabular-nums ${staffPayroll.overtime_hours > 0 ? "text-orange-700" : "text-dark-brown"}`}>
                      {staffPayroll.overtime_display}
                    </p>
                    {staffPayroll.overtime_hours > 0 && (
                      <p className="text-[10px] text-orange-600/70 font-paragraph mt-0.5">
                        {staffPayroll.overtime_days} day{staffPayroll.overtime_days === 1 ? "" : "s"} over 8h
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-dark-brown/5 border border-dark-brown/10 px-4 py-3 text-center sm:text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark-brown/45">
                      OT × {staffPayroll.overtime_multiplier}
                    </p>
                    <p className="text-lg font-bold text-dark-brown tabular-nums">{staffPayroll.weighted_overtime_display}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Photo actions */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-5 sm:ml-36 md:ml-40">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-light-brown/20 hover:bg-light-brown/40 text-dark-brown font-bold text-xs uppercase rounded-full py-2 px-4 transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Upload Photo
            </button>
            {photoPreview && (
              <button
                onClick={handleRemovePhoto}
                className="flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown/20 text-red-brown font-bold text-xs uppercase rounded-full py-2 px-4 transition-all duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Remove
              </button>
            )}
            <span className="font-paragraph text-dark-brown/40 text-xs">JPG, PNG • Max 2MB</span>
          </div>
        </div>

        {/* Account Details Card */}
        <div className="bg-white/50 backdrop-blur-sm border border-white/60 rounded-3xl p-6 md:p-8 shadow-lg mb-6 md:mb-8">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight mb-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-light-brown/20 rounded-xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dark-brown">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            Account Details
          </h3>

          <div className="divide-y divide-dark-brown/10">
            {/* Name row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-2">
              <div>
                <p className="font-paragraph text-dark-brown/50 text-sm">Display Name</p>
                <p className="font-bold text-dark-brown text-lg">{user.name}</p>
              </div>
              <button
                onClick={() => setEditingName(true)}
                className="self-start sm:self-auto bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown font-bold text-xs uppercase rounded-full py-2 px-4 transition-all"
              >
                Edit
              </button>
            </div>

            {/* Email row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-2">
              <div>
                <p className="font-paragraph text-dark-brown/50 text-sm">Email Address</p>
                <p className="font-bold text-dark-brown text-lg">{user.email}</p>
              </div>
              <span className="self-start sm:self-auto bg-light-brown/15 text-dark-brown/60 font-bold text-xs uppercase rounded-full py-2 px-4">
                {isGoogleUser ? "Google" : "Verified"}
              </span>
            </div>

            {/* Role row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-2">
              <div>
                <p className="font-paragraph text-dark-brown/50 text-sm">Account Role</p>
                <p className="font-bold text-dark-brown text-lg capitalize">{user.role}</p>
              </div>
              <span className={`self-start sm:self-auto font-bold text-xs uppercase rounded-full py-2 px-4 ${user.role === "admin" ? "bg-mid-brown/20 text-mid-brown" : "bg-light-brown/15 text-dark-brown/60"}`}>
                {user.role === "admin" ? "⭐ Admin" : "Member"}
              </span>
            </div>

            {/* Provider row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-2">
              <div>
                <p className="font-paragraph text-dark-brown/50 text-sm">Sign-in Method</p>
                <p className="font-bold text-dark-brown text-lg capitalize">{user.provider || "local"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security / Change Password Card */}
        <div className="bg-white/50 backdrop-blur-sm border border-white/60 rounded-3xl p-6 md:p-8 shadow-lg mb-6 md:mb-8">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight mb-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-red-brown/15 rounded-xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-brown">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            Security
          </h3>

          {isGoogleUser ? (
            <div className="bg-light-brown/10 border border-light-brown/20 rounded-2xl p-5">
              <p className="font-paragraph text-dark-brown/70 text-sm">
                Your account is managed by Google. Password changes are handled through your Google account settings.
              </p>
            </div>
          ) : (
            <>
              {!showPasswordForm ? (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="group flex items-center gap-3 bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown font-bold text-sm uppercase rounded-2xl py-4 px-6 transition-all w-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  Change Password
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto group-hover:translate-x-1 transition-transform">
                    <path d="m9 18 6-6-6-6"></path>
                  </svg>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                  {passwordError && (
                    <div className="bg-red-brown/10 border border-red-brown/30 text-red-brown rounded-xl px-4 py-3 font-paragraph text-sm text-center">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="bg-green-100 border border-green-300 text-green-700 rounded-xl px-4 py-3 font-paragraph text-sm text-center">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="font-paragraph text-dark-brown font-semibold text-sm">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white/60 border border-white/40 text-dark-brown font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-light-brown focus:bg-white transition-all placeholder:font-normal placeholder:text-dark-brown/40 !text-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-paragraph text-dark-brown font-semibold text-sm">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white/60 border border-white/40 text-dark-brown font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-light-brown focus:bg-white transition-all placeholder:font-normal placeholder:text-dark-brown/40 !text-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-paragraph text-dark-brown font-semibold text-sm">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white/60 border border-white/40 text-dark-brown font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-light-brown focus:bg-white transition-all placeholder:font-normal placeholder:text-dark-brown/40 !text-lg"
                    />
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-dark-brown hover:bg-[#3a2218] text-milk uppercase font-bold text-sm rounded-full py-3 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
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
                      className="bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown uppercase font-bold text-sm rounded-full py-3 px-6 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href={isAdmin ? "/admin" : isStaff ? "/staff" : "/dashboard"} className="group bg-dark-brown hover:bg-[#3a2218] text-milk rounded-3xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-all flex items-center justify-between">
            <div>
              <p className="font-bold uppercase text-lg">{isAdmin ? "Admin Panel" : isStaff ? "Staff Panel" : "Dashboard"}</p>
              <p className="font-paragraph text-milk/60 text-sm mt-1">{isAdmin || isStaff ? "Manage orders & operations" : "View your orders & activity"}</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <Link href="/order" className="group bg-light-brown hover:bg-mid-brown text-dark-brown hover:text-milk rounded-3xl p-5 md:p-6 shadow-lg hover:shadow-xl transition-all flex items-center justify-between">
            <div>
              <p className="font-bold uppercase text-lg">Order Now</p>
              <p className="font-paragraph text-dark-brown/70 group-hover:text-milk/70 text-sm mt-1">Browse the menu</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Delete Account Section */}
        <div className="mt-8 bg-red-50/50 border border-red-200 rounded-3xl p-5 md:p-6">
          <h3 className="text-xl font-bold text-red-800 uppercase tracking-tight mb-2">Delete Account</h3>
          <p className="font-paragraph text-red-700 text-sm mb-4">
            Permanently delete your account and all associated data (orders, cart, settings). This action cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-sm py-2 px-5 rounded-full shadow-md hover:shadow-lg transition-all"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 w-[90%] max-w-md">
            <h3 className="text-xl font-bold text-red-800 uppercase tracking-tight mb-2">Delete Account</h3>
            <p className="font-paragraph text-red-700 text-sm mb-4">
              This will permanently delete your account and all data. Type <strong>DELETE</strong> to confirm.
            </p>
            {deleteError && (
              <p className="text-red-600 text-sm font-bold mb-3">{deleteError}</p>
            )}
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="w-full bg-red-50 border border-red-200 text-red-900 font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-red-400 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirm("");
                  setDeleteError("");
                }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold uppercase py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold uppercase py-3 rounded-xl transition-colors"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
