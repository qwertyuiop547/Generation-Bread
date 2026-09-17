"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch, getAccessToken } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import { useLanguage } from "@/context/LanguageContext";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import { STAFF_POSITIONS } from "@/constants";
import { useStaffOrdersRealtime } from "@/hooks/useStaffOrdersRealtime";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const ATTENDANCE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: "Pending", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
  clocked_in: { label: "On Time", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  late: { label: "Late", color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-500" },
  on_break: { label: "On Break", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
  clocked_out: { label: "Clocked Out", color: "text-dark-brown/60", bg: "bg-dark-brown/5", dot: "bg-dark-brown/30" },
  not_clocked_in: { label: "Not Clocked In", color: "text-gray-600", bg: "bg-gray-50", dot: "bg-gray-400" },
  absent: { label: "Marked Absent", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
  absent_today: { label: "Absent Today", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
  planned_absent: { label: "Planned Absence", color: "text-indigo-700", bg: "bg-indigo-50", dot: "bg-indigo-500" },
  within_grace: { label: "Grace Period", color: "text-yellow-700", bg: "bg-yellow-50", dot: "bg-yellow-500" }};

function getAttendanceStatusConfig(entry: { display_status?: string; status: string }) {
  const key = entry.display_status || entry.status;
  return ATTENDANCE_STATUS_CONFIG[key] || ATTENDANCE_STATUS_CONFIG.not_clocked_in;
}

interface OrderItem {
  name: string;
  price: number;
  qty: number;
  notes?: string;
}

interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  totalItems: number;
  date: string;
  userEmail: string;
  userName: string;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  orderType?: "Dine-In" | "Takeout" | "Scheduled";
  tableNumber?: string | null;
  pickupTime?: string | null;
  voidReason?: string;
  isArchived?: boolean;
  rating?: number | null;
  ratingComment?: string;
  servedByEmail?: string | null;
  servedByName?: string | null;
  paymentMethod?: string;
  paymentStatus?: "unpaid" | "paid" | "";
}

interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: string;
  employee_id: string | null;
  phone: string;
  position: string;
  shift_start: string | null;
  shift_end: string | null;
  bio: string;
  avatar: string | null;
  is_email_verified: boolean;
  is_active: boolean;
  date_joined: string;
}

interface AttendanceHistoryLog {
  id: number;
  date: string;
  clock_in: string;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_duration: string | null;
  duration: string | null;
  status: string;
  attendance_mark: string | null;
  mark_label: string;
  minutes_late: number | null;
  is_approved: boolean;
  approved_by_name: string | null;
  approved_at: string | null;
}

interface AttendanceHistoryData {
  staff: StaffUser;
  summary: {
    total_logs: number;
    on_time: number;
    late: number;
    absent: number;
    pending: number;
    with_break: number;
  };
  logs: AttendanceHistoryLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

function formatHistoryTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHistoryDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function getWeekMondayISO(d = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

function shiftWeekStartISO(mondayIso: string, deltaWeeks: number): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function getWeekEndISO(mondayIso: string): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function formatShiftTime(t: string): string {
  return new Date(`1970-01-01T${t}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderStarRating(rating: number, size = 12) {
  return (
    <span className="inline-flex items-center gap-0.5 text-yellow-500">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={star <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

function getHistoryMarkConfig(log: AttendanceHistoryLog) {
  if (log.attendance_mark === "on_time") return { label: "On Time", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" };
  if (log.attendance_mark === "late") return { label: "Late", color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-500" };
  if (log.attendance_mark === "absent") return { label: "Absent", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" };
  if (log.status === "pending") return { label: "Pending", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" };
  if (log.status === "on_break") return { label: "On Break", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" };
  if (log.status === "clocked_out") return { label: "Completed", color: "text-dark-brown/60", bg: "bg-dark-brown/5", dot: "bg-dark-brown/30" };
  return { label: log.mark_label || "Clocked In", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" };
}

type CalendarDayStatus = "present" | "late" | "absent" | "planned_absent" | "pending" | "no_record" | "future";

interface MonthlyCalendarDay {
  date: string;
  day: number;
  weekday: number;
  weekday_label: string;
  status: CalendarDayStatus;
  shift: {
    shift_id: number;
    clock_in: string | null;
    clock_out: string | null;
    break_start: string | null;
    break_end: string | null;
    minutes_late: number | null;
    attendance_mark: string | null;
    is_approved: boolean;
  } | null;
  absence_request?: {
    id: number;
    reason: string;
    absence_date: string;
    created_by_name: string | null;
  } | null;
  shift_assignment?: {
    id: number;
    start_time: string;
    end_time: string;
    station: string;
    station_display: string;
  } | null;
}

interface MonthlyCalendarData {
  staff: { id: number; name: string; email: string; employee_id: string | null; position: string; avatar: string | null };
  year: number;
  month: number;
  month_label: string;
  calendar_start_offset: number;
  weekday_headers: string[];
  days: MonthlyCalendarDay[];
  summary: {
    present: number;
    late: number;
    absent: number;
    planned_absent: number;
    pending: number;
    no_record: number;
    future: number;
    scheduled_days: number;
    attendance_rate: number;
  };
}

const CALENDAR_STATUS: Record<CalendarDayStatus, { cell: string; text: string; label: string }> = {
  present: { cell: "bg-emerald-500 border-emerald-600 text-white", text: "text-emerald-700", label: "Present" },
  late: { cell: "bg-yellow-400 border-yellow-500 text-dark-brown", text: "text-yellow-700", label: "Late" },
  absent: { cell: "bg-red-500 border-red-600 text-white", text: "text-red-700", label: "Unexpected Absent" },
  planned_absent: { cell: "bg-indigo-500 border-indigo-600 text-white", text: "text-indigo-700", label: "Planned Absence" },
  pending: { cell: "bg-blue-400 border-blue-500 text-white", text: "text-blue-700", label: "Pending" },
  no_record: { cell: "bg-dark-brown/8 border-dark-brown/15 text-dark-brown/40", text: "text-dark-brown/50", label: "No Record" },
  future: { cell: "bg-white border-dark-brown/10 text-dark-brown/25", text: "text-dark-brown/30", label: "Future" }};

function formatCalendarTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MonthlyCalendarGrid({
  data,
  loading,
  selectedDay,
  onSelectDay,
  onPrevMonth,
  onNextMonth}: {
  data: MonthlyCalendarData | null;
  loading: boolean;
  selectedDay: MonthlyCalendarDay | null;
  onSelectDay: (day: MonthlyCalendarDay | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center">
        <p className="font-paragraph text-dark-brown/50">Select a staff member to view calendar</p>
      </div>
    );
  }

  const emptyCells = Array.from({ length: data.calendar_start_offset }, (_, i) => i);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={onPrevMonth} className="p-2 rounded-xl bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown transition-all" aria-label="Previous month">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-dark-brown uppercase tracking-tight">{data.month_label}</p>
          <p className="text-[10px] text-dark-brown/45 font-paragraph">{data.staff.name}</p>
        </div>
        <button type="button" onClick={onNextMonth} className="p-2 rounded-xl bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown transition-all" aria-label="Next month">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {(["present", "late", "absent", "planned_absent"] as CalendarDayStatus[]).map((key) => (
          <div key={key} className="rounded-xl border border-dark-brown/10 bg-white/60 px-3 py-2 text-center">
            <p className={`text-xl font-bold tabular-nums ${CALENDAR_STATUS[key].text}`}>{data.summary[key] ?? 0}</p>
            <p className="text-[9px] font-bold uppercase text-dark-brown/45">{CALENDAR_STATUS[key].label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dark-brown/10 bg-dark-brown/5 px-3 py-2 text-center mb-4">
        <p className="text-xl font-bold text-dark-brown tabular-nums">{data.summary.attendance_rate}%</p>
        <p className="text-[9px] font-bold uppercase text-dark-brown/45">Attendance Rate (Present + Late)</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 text-[10px] font-bold uppercase">
        {(["present", "late", "absent", "planned_absent", "no_record", "future"] as CalendarDayStatus[]).map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-dark-brown/60">
            <span className={`w-3 h-3 rounded-sm border ${CALENDAR_STATUS[key].cell.split(" ").slice(0, 2).join(" ")}`} />
            {CALENDAR_STATUS[key].label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {data.weekday_headers.map((h) => (
          <div key={h} className="text-center text-[10px] font-bold uppercase text-dark-brown/40 py-1">{h}</div>
        ))}
        {emptyCells.map((i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}
        {data.days.map((day) => {
          const style = CALENDAR_STATUS[day.status];
          const isSelected = selectedDay?.date === day.date;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : day)}
              title={`${day.date}: ${style.label}`}
              className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-all hover:scale-105 hover:shadow-md ${style.cell} ${isSelected ? "ring-2 ring-dark-brown ring-offset-2" : ""}`}
            >
              <span className="text-sm font-bold leading-none">{day.day}</span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 rounded-2xl border border-dark-brown/10 bg-dark-brown/[0.03] p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-bold text-dark-brown">
              {new Date(`${selectedDay.date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${CALENDAR_STATUS[selectedDay.status].cell}`}>
              {CALENDAR_STATUS[selectedDay.status].label}
            </span>
          </div>
          {selectedDay.shift_assignment ? (
            <div className="rounded-xl bg-amber-50/80 border border-amber-200/60 p-3 mb-3">
              <p className="text-[10px] font-bold uppercase text-amber-800/70 mb-1">Assigned Shift</p>
              <p className="text-sm text-amber-950 font-paragraph">
                {formatShiftTime(selectedDay.shift_assignment.start_time)} – {formatShiftTime(selectedDay.shift_assignment.end_time)}
                {" · "}{selectedDay.shift_assignment.station_display}
              </p>
            </div>
          ) : null}
          {selectedDay.absence_request ? (
            <div className="rounded-xl bg-indigo-50/80 border border-indigo-200/60 p-3 mb-3">
              <p className="text-[10px] font-bold uppercase text-indigo-700/70 mb-1">Planned Absence Reason</p>
              <p className="text-sm text-indigo-900 font-paragraph">{selectedDay.absence_request.reason}</p>
              {selectedDay.absence_request.created_by_name && (
                <p className="text-[10px] text-indigo-600/60 mt-1">Logged by {selectedDay.absence_request.created_by_name}</p>
              )}
            </div>
          ) : null}
          {selectedDay.shift ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-dark-brown/60 font-paragraph">
              <div><span className="block text-dark-brown/35 uppercase font-bold text-[9px]">Clock In</span>{formatCalendarTime(selectedDay.shift.clock_in)}</div>
              <div><span className="block text-dark-brown/35 uppercase font-bold text-[9px]">Clock Out</span>{formatCalendarTime(selectedDay.shift.clock_out)}</div>
              <div><span className="block text-dark-brown/35 uppercase font-bold text-[9px]">Break</span>{selectedDay.shift.break_start ? `${formatCalendarTime(selectedDay.shift.break_start)}${selectedDay.shift.break_end ? ` – ${formatCalendarTime(selectedDay.shift.break_end)}` : ""}` : "—"}</div>
              <div><span className="block text-dark-brown/35 uppercase font-bold text-[9px]">Late</span>{selectedDay.shift.minutes_late ? `+${selectedDay.shift.minutes_late}m` : "—"}</div>
            </div>
          ) : !selectedDay.absence_request ? (
            <p className="text-xs text-dark-brown/45 font-paragraph">No clock-in record for this day.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { isLoggedIn, isAuthLoading, isAdmin, isStaff, user, logout, accessToken } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | Order["status"]>("all");
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [voidModalOrderId, setVoidModalOrderId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [viewReasonData, setViewReasonData] = useState<{ orderId: string; reason: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [adminSection, setAdminSection] = useState<"orders" | "staff" | "roles" | "contacts" | "attendance" | "activity">("orders");
  const [staffForm, setStaffForm] = useState({ name: "", role: "staff", phone: "", position: "", shift_start: "", shift_end: "", bio: "", is_active: true });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<{ attendance: any[]; summary: any } | null>(null);
  const [payrollData, setPayrollData] = useState<any>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [otMultiplier, setOtMultiplier] = useState("1.25");
  const [expandedPayrollEmail, setExpandedPayrollEmail] = useState<string | null>(null);
  const [historyStaff, setHistoryStaff] = useState<StaffUser | null>(null);
  const [historyData, setHistoryData] = useState<AttendanceHistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMarkFilter, setHistoryMarkFilter] = useState<"all" | "on_time" | "late" | "absent" | "pending">("all");
  const [historyTab, setHistoryTab] = useState<"list" | "calendar">("list");
  const [calendarData, setCalendarData] = useState<MonthlyCalendarData | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);
  const [calendarStaffEmail, setCalendarStaffEmail] = useState("");
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<MonthlyCalendarDay | null>(null);
  const [absenceFormStaff, setAbsenceFormStaff] = useState("");
  const [absenceFormDate, setAbsenceFormDate] = useState("");
  const [absenceFormReason, setAbsenceFormReason] = useState("");
  const [absenceFormLoading, setAbsenceFormLoading] = useState(false);
  const [absenceRequests, setAbsenceRequests] = useState<any[]>([]);
  const [shiftWeekStart, setShiftWeekStart] = useState(() => getWeekMondayISO());
  const [shiftAssignments, setShiftAssignments] = useState<any[]>([]);
  const [shiftAssignLoading, setShiftAssignLoading] = useState(false);
  const [shiftFormStaff, setShiftFormStaff] = useState("");
  const [shiftFormDate, setShiftFormDate] = useState("");
  const [shiftFormStart, setShiftFormStart] = useState("09:00");
  const [shiftFormEnd, setShiftFormEnd] = useState("20:30");
  const [shiftFormStation, setShiftFormStation] = useState("barista");
  const [shiftFormLoading, setShiftFormLoading] = useState(false);
  const [shiftExportLoading, setShiftExportLoading] = useState(false);
  const [feedbackData, setFeedbackData] = useState<any | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackDays, setFeedbackDays] = useState<30 | 90 | 180>(90);
  const [taggingOrderId, setTaggingOrderId] = useState<number | null>(null);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuTlRef = useRef<gsap.core.Timeline | null>(null);
  const lastCancelOverdueAtRef = useRef(0);

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      return;
    }
    setShowMobileMenu(true);
    setIsMobileMenuOpen(true);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auth guard: check localStorage as fallback to prevent redirect during auth rehydration
  const storedUserRaw = typeof window !== "undefined" ? localStorage.getItem("spylt_user") : null;
  const storedRole = storedUserRaw ? (() => { try { return JSON.parse(storedUserRaw).role; } catch { return null; } })() : null;
  const isStoredAdmin = storedRole === "admin";
  const isStoredStaff = storedRole === "staff" || storedRole === "admin";

  useEffect(() => {
    if (!mounted || isAuthLoading) return;
    if (!isLoggedIn && !storedUserRaw) { router.push("/"); return; }
    if (!isAdmin && !isStoredAdmin) { router.push(isStaff || isStoredStaff ? "/staff" : "/dashboard"); return; }
  }, [mounted, isAuthLoading, isLoggedIn, isAdmin, isStaff, router]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, viewTab]);

  useGSAP(
    () => {
      const top = containerRef.current?.querySelector(".ham-top");
      const mid = containerRef.current?.querySelector(".ham-mid");
      const bot = containerRef.current?.querySelector(".ham-bot");
      if (!top || !mid || !bot) return;

      if (isMobileMenuOpen) {
        gsap.to(top, { y: 6, rotation: 45, transformOrigin: "50% 50%", duration: 0.35, ease: "power3.out" });
        gsap.to(mid, { autoAlpha: 0, scaleX: 0.35, duration: 0.18, ease: "power2.in" });
        gsap.to(bot, { y: -6, rotation: -45, transformOrigin: "50% 50%", duration: 0.35, ease: "power3.out" });
      } else {
        gsap.to(top, { y: 0, rotation: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "power3.out" });
        gsap.to(mid, { autoAlpha: 1, scaleX: 1, duration: 0.25, ease: "power2.out", delay: 0.04 });
        gsap.to(bot, { y: 0, rotation: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "power3.out" });
      }
    },
    { dependencies: [isMobileMenuOpen], scope: containerRef }
  );

  useGSAP(
    () => {
      if (!showMobileMenu || !mobileMenuRef.current) return;

      const menu = mobileMenuRef.current;
      const items = gsap.utils.toArray<HTMLElement>(".mobile-nav-item", menu);
      menuTlRef.current?.kill();

      if (isMobileMenuOpen) {
        gsap.set(menu, {
          display: "flex",
          autoAlpha: 0,
          y: -18,
          clipPath: "inset(0% 0% 100% 0%)"});
        gsap.set(items, { autoAlpha: 0, y: -14, scale: 0.96 });

        menuTlRef.current = gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .to(menu, {
            autoAlpha: 1,
            y: 0,
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 0.42})
          .to(
            items,
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.38,
              stagger: { each: 0.07, from: "start" },
              ease: "power2.out"},
            "-=0.22"
          );
      } else {
        menuTlRef.current = gsap
          .timeline({
            defaults: { ease: "power2.in" },
            onComplete: () => setShowMobileMenu(false)})
          .to(items, {
            autoAlpha: 0,
            y: -10,
            scale: 0.97,
            duration: 0.18,
            stagger: { each: 0.04, from: "end" }})
          .to(
            menu,
            {
              autoAlpha: 0,
              y: -14,
              clipPath: "inset(0% 0% 100% 0%)",
              duration: 0.28},
            "-=0.06"
          );
      }
    },
    { dependencies: [isMobileMenuOpen, showMobileMenu], scope: containerRef }
  );

  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => {
      const targets = document.querySelectorAll(".paginated-order");
      if (targets.length > 0) {
        gsap.fromTo(targets, 
          { opacity: 0, y: 15 }, 
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: "power2.out", overwrite: true }
        );
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [currentPage, filter, viewTab, mounted, adminSection]);

  const fetchOrders = useCallback(async () => {
    if (!user?.email) return;
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      const localOrders: Order[] = localOrdersRaw ? JSON.parse(localOrdersRaw) : [];

      let mapped: Order[] = [];
      try {
        if (!getAccessToken()) {
          setOrders(localOrders);
          return;
        }
        const url = `${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}&limit=500`;
        const res = await authFetch(url);
        if (res.ok) {
          const data = unwrapListResponse<any>(await res.json());
          mapped = data.map((d: any) => ({
            id: `ORD-${d.id.toString().padStart(4, "0")}`,
            items: d.items.map((i: any) => ({
              name: i.name,
              price: Number(i.price),
              qty: i.quantity,
              notes: i.notes})),
            total: Number(d.total_price),
            totalItems: d.items.reduce((sum: number, i: any) => sum + i.quantity, 0),
            date: d.created_at,
            userEmail: d.user_email,
            userName: d.customer_name || d.user_name || d.user_email,
            status: d.status,
            orderType: d.order_type === "dine_in" ? "Dine-In" : d.order_type === "scheduled" ? "Scheduled" : "Takeout",
            tableNumber: d.table_number,
            pickupTime: d.pickup_time,
            voidReason: d.void_reason || undefined,
            isArchived: d.is_archived || false,
            rating: d.rating ?? null,
            ratingComment: d.rating_comment || "",
            servedByEmail: d.served_by_email || null,
            servedByName: d.served_by_name || null,
            paymentMethod: d.payment_method || "",
            paymentStatus: d.payment_status || "unpaid"}));
        } else if (res.status === 401 || res.status === 403) {
          setToast({
            message: "Session expired — sign in again to see kitchen orders.",
            type: "error"});
          setTimeout(() => setToast(null), 4000);
        } else if (res.status === 429) {
          setToast({
            message: "Too many requests — kitchen list will retry shortly.",
            type: "error"});
          setTimeout(() => setToast(null), 4000);
        }
      } catch (backendErr) {
        // ignore backend failure
      }

      const allOrders = [...mapped, ...localOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(allOrders);

      // Auto-cancel overdue scheduled orders (at most once every 5 min — avoid 429 spam)
      const now = Date.now();
      if (now - lastCancelOverdueAtRef.current > 5 * 60 * 1000) {
        lastCancelOverdueAtRef.current = now;
        authFetch(`${API_BASE_URL}/api/auth/admin/cancel-overdue-scheduled/`, { method: "POST" }).catch(() => {});
      }
    } catch (err) {
      setOrders([]);
    }
  }, [user?.email]);

  useStaffOrdersRealtime(
    mounted && isLoggedIn && isAdmin && !!user?.email && !!accessToken,
    fetchOrders
  );

  useEffect(() => {
    const usersRaw = localStorage.getItem("spylt_users") || "[]";
    const users = JSON.parse(usersRaw);
    setTotalUsers(users.filter((u: { role?: string }) => u.role !== "admin").length);
  }, []);

  useGSAP(() => {
    if (!mounted || isAuthLoading || !isLoggedIn || !isAdmin) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Keep nav controls visible if a tween is interrupted (HMR / auth rehydrate).
    gsap.set(".admin-nav-item", { opacity: 1, y: 0, clearProps: "transform" });

    if (prefersReduced) {
      gsap.set([".admin-header", ".admin-stagger-item"], { opacity: 1, y: 0, clearProps: "transform" });
      return;
    }

    gsap.fromTo(
      ".admin-header",
      { y: -50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
    );

    gsap.fromTo(
      ".admin-nav-item",
      { y: -20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.08,
        ease: "back.out(1.5)",
        delay: 0.25,
        onComplete: () => {
          gsap.set(".admin-nav-item", { opacity: 1, y: 0, clearProps: "transform" });
        }}
    );

    gsap.fromTo(
      ".admin-stagger-item",
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "back.out(1.2)", delay: 0.2 }
    );
  }, { scope: containerRef, dependencies: [mounted, isAuthLoading, isLoggedIn, isAdmin] });

  const updateStatus = async (id: string, status: Order["status"]) => {
    if (!user?.email) return;

    try {
      // If it's a local order, update locally
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === id);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].status = status;
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
          return;
        }
      }

      // Extract raw ID for backend (removing 'ORD-' prefix)
      const numericId = id.replace('ORD-', '').replace(/^0+/, '');
      
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/status/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email, status })});

      if (!res.ok) throw new Error("Failed to update order status");

      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    } catch (err) {
      console.error(err);
      showToast("Failed to update status. Please try again.", "error");
    }
  };

  const markOrderPaid = async (id: string) => {
    if (!user?.email) return;

    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === id);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].paymentStatus = "paid";
          if (!localOrders[localOrderIndex].paymentMethod) {
            localOrders[localOrderIndex].paymentMethod = "cash";
          }
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders((prev) =>
            prev.map((o) =>
              o.id === id
                ? { ...o, paymentStatus: "paid", paymentMethod: o.paymentMethod || "cash" }
                : o
            )
          );
          showToast("Payment marked as paid.", "success");
          return;
        }
      }

      const numericId = id.replace("ORD-", "").replace(/^0+/, "");
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/payment/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email, payment_status: "paid" })});

      if (!res.ok) throw new Error("Failed to mark payment");

      const data = await res.json();
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                paymentStatus: (data.payment_status as Order["paymentStatus"]) || "paid",
                paymentMethod: data.payment_method || o.paymentMethod || "cash"}
            : o
        )
      );
      showToast("Payment marked as paid.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to mark payment. Please try again.", "error");
    }
  };

  const voidOrder = async (id: string, reason: string) => {
    if (!user?.email || !reason.trim()) return;

    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === id);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].status = "cancelled";
          localOrders[localOrderIndex].voidReason = reason.trim();
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" as const, voidReason: reason.trim() } : o)));
          setVoidModalOrderId(null);
          setVoidReason("");
          return;
        }
      }

      const numericId = id.replace('ORD-', '').replace(/^0+/, '');

      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/void/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email, void_reason: reason.trim() })});

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to void order");
      }

      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" as const, voidReason: reason.trim() } : o)));
      setVoidModalOrderId(null);
      setVoidReason("");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to void order. Please try again.", "error");
    }
  };

  const filteredOrders = (filter === "all" ? orders : orders.filter((o) => o.status === filter))
    .filter((o) => viewTab === "archived" ? o.isArchived : !o.isArchived);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const displayedOrders = filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const archiveOrder = async (id: string, archive: boolean) => {
    if (!user?.email) return;
    try {
      const localOrdersRaw = localStorage.getItem("spylt_local_orders");
      if (localOrdersRaw) {
        const localOrders = JSON.parse(localOrdersRaw);
        const localOrderIndex = localOrders.findIndex((o: any) => o.id === id);
        if (localOrderIndex !== -1) {
          localOrders[localOrderIndex].isArchived = archive;
          localStorage.setItem("spylt_local_orders", JSON.stringify(localOrders));
          setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, isArchived: archive } : o)));
          return;
        }
      }

      const numericId = id.replace('ORD-', '').replace(/^0+/, '');
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/archive/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email, archive })});
      if (!res.ok) throw new Error("Failed to archive order");
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, isArchived: archive } : o)));
    } catch (err) {
      console.error(err);
      showToast("Failed to archive order. Please try again.", "error");
    }
  };

  const autoArchive = async () => {
    if (!user?.email) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/orders/auto-archive/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email })});
      if (!res.ok) throw new Error("Failed to auto-archive");
      const data = await res.json();
      showToast(data.message || "Auto-archive complete.", "success");
      // Refresh orders
      fetchOrders();
    } catch (err) {
      console.error(err);
      showToast("Failed to auto-archive. Please try again.", "error");
    }
  };

  // Staff management
  const fetchStaff = async () => {
    if (!user?.email) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff/?admin_email=${encodeURIComponent(user.email)}`);
      if (res.ok) {
        const data = await res.json();
        setStaffUsers(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (mounted && isLoggedIn && isAdmin && user?.email) fetchStaff();
  }, [mounted, isLoggedIn, isAdmin, user?.email]);

  const fetchStaffFeedback = async () => {
    if (!user?.email) return;
    setFeedbackLoading(true);
    try {
      const params = new URLSearchParams({
        admin_email: user.email,
        days: String(feedbackDays)});
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff-feedback/?${params}`);
      if (res.ok) {
        setFeedbackData(await res.json());
      } else {
        setFeedbackData(null);
      }
    } catch {
      setFeedbackData(null);
    } finally {
      setFeedbackLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email || adminSection !== "staff") return;
    fetchStaffFeedback();
  }, [mounted, isLoggedIn, isAdmin, user?.email, adminSection, feedbackDays]);

  const tagOrderStaff = async (orderId: number, staffEmail: string | null) => {
    if (!user?.email) return;
    setTaggingOrderId(orderId);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/orders/${orderId}/served-by/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_email: user.email,
          staff_email: staffEmail})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to tag staff");
      showToast(staffEmail ? "Staff tagged on review" : "Staff tag removed", "success");
      fetchStaffFeedback();
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || "Failed to tag staff", "error");
    } finally {
      setTaggingOrderId(null);
    }
  };

  // Fetch today's attendance
  const fetchAttendance = async () => {
    if (!user?.email) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/today-attendance/?admin_email=${encodeURIComponent(user.email)}`);
      if (res.ok) {
        const data = await res.json();
        setAttendanceData(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email) return;
    fetchAttendance();
    const interval = setInterval(fetchAttendance, 15000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isAdmin, user?.email]);

  const fetchPayrollSummary = async () => {
    if (!user?.email) return;
    setPayrollLoading(true);
    try {
      const mult = parseFloat(otMultiplier) || 1.25;
      const res = await authFetch(
          `${API_BASE_URL}/api/auth/admin/payroll-summary/?admin_email=${encodeURIComponent(user.email)}&multiplier=${mult}`
        );
      if (res.ok) setPayrollData(await res.json());
    } catch {
      setPayrollData(null);
    } finally {
      setPayrollLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email || adminSection !== "attendance") return;
    fetchPayrollSummary();
    const interval = setInterval(fetchPayrollSummary, 60000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isAdmin, user?.email, adminSection]);

  const fetchActivityFeed = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/activity-feed/?hours=24`);
      if (res.ok) {
        const data = await res.json();
        setActivityFeed(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email) return;
    fetchActivityFeed();
    const interval = setInterval(fetchActivityFeed, 10000);
    return () => clearInterval(interval);
  }, [mounted, isLoggedIn, isAdmin, user?.email]);

  const openEditStaff = (s: StaffUser) => {
    setEditingStaff(s);
    setStaffForm({ name: s.name, role: s.role, phone: s.phone, position: s.position, shift_start: s.shift_start || "", shift_end: s.shift_end || "", bio: s.bio, is_active: s.is_active });
    setAvatarFile(null);
    setAvatarPreview(s.avatar || null);
  };

  const fetchAttendanceHistory = async (staff: StaffUser, page = 1, mark = historyMarkFilter) => {
    if (!user?.email) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        admin_email: user.email,
        staff_email: staff.email,
        page: String(page),
        limit: "25"});
      if (mark !== "all") params.set("mark", mark);
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff-attendance-history/?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data);
        setHistoryPage(page);
      } else {
        setHistoryData(null);
        showToast("Failed to load attendance history", "error");
      }
    } catch {
      setHistoryData(null);
      showToast("Failed to load attendance history", "error");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openAttendanceHistory = (staff: Pick<StaffUser, "id" | "name" | "email" | "employee_id" | "position" | "avatar" | "shift_start" | "shift_end" | "role">) => {
    const fullStaff: StaffUser = {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role || "staff",
      employee_id: staff.employee_id ?? null,
      phone: "",
      position: staff.position || "",
      shift_start: staff.shift_start ?? null,
      shift_end: staff.shift_end ?? null,
      bio: "",
      avatar: staff.avatar ?? null,
      is_email_verified: true,
      is_active: true,
      date_joined: ""};
    setHistoryStaff(fullStaff);
    setHistoryMarkFilter("all");
    setHistoryPage(1);
    setHistoryTab("list");
    setCalendarYear(new Date().getFullYear());
    setCalendarMonth(new Date().getMonth() + 1);
    fetchAttendanceHistory(fullStaff, 1, "all");
  };

  const closeAttendanceHistory = () => {
    setHistoryStaff(null);
    setHistoryData(null);
    setHistoryPage(1);
    setHistoryMarkFilter("all");
    setHistoryTab("list");
    setCalendarData(null);
    setSelectedCalendarDay(null);
  };

  const fetchMonthlyCalendar = async (staffEmail: string, year: number, month: number) => {
    if (!user?.email || !staffEmail) return;
    setCalendarLoading(true);
    try {
      const params = new URLSearchParams({
        admin_email: user.email,
        staff_email: staffEmail,
        year: String(year),
        month: String(month)});
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/monthly-attendance/?${params}`);
      if (res.ok) {
        setCalendarData(await res.json());
        setSelectedCalendarDay(null);
      } else {
        setCalendarData(null);
        showToast("Failed to load monthly calendar", "error");
      }
    } catch {
      setCalendarData(null);
      showToast("Failed to load monthly calendar", "error");
    } finally {
      setCalendarLoading(false);
    }
  };

  const shiftCalendarMonth = (delta: number, staffEmail?: string) => {
    let y = calendarYear;
    let m = calendarMonth + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalendarYear(y);
    setCalendarMonth(m);
    const email = staffEmail || historyStaff?.email || calendarStaffEmail;
    if (email) fetchMonthlyCalendar(email, y, m);
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || adminSection !== "attendance") return;
    if (!calendarStaffEmail && staffUsers.length > 0) {
      setCalendarStaffEmail(staffUsers[0].email);
      setAbsenceFormStaff(staffUsers[0].email);
      setShiftFormStaff(staffUsers[0].email);
    }
  }, [mounted, isLoggedIn, isAdmin, adminSection, staffUsers, calendarStaffEmail]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email || adminSection !== "attendance") return;
    if (calendarStaffEmail) fetchMonthlyCalendar(calendarStaffEmail, calendarYear, calendarMonth);
  }, [calendarStaffEmail, adminSection]);

  const fetchAbsenceRequests = async () => {
    if (!user?.email) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/absence-requests/?admin_email=${encodeURIComponent(user.email)}&status=approved`);
      if (res.ok) setAbsenceRequests(await res.json());
    } catch {
      setAbsenceRequests([]);
    }
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email || adminSection !== "attendance") return;
    fetchAbsenceRequests();
  }, [mounted, isLoggedIn, isAdmin, user?.email, adminSection]);

  const fetchShiftAssignments = async () => {
    if (!user?.email) return;
    setShiftAssignLoading(true);
    try {
      const params = new URLSearchParams({
        admin_email: user.email,
        week_start: shiftWeekStart});
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/?${params}`);
      if (res.ok) {
        const data = await res.json();
        setShiftAssignments(data.assignments || []);
      } else {
        setShiftAssignments([]);
      }
    } catch {
      setShiftAssignments([]);
    } finally {
      setShiftAssignLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isAdmin || !user?.email || adminSection !== "attendance") return;
    fetchShiftAssignments();
  }, [mounted, isLoggedIn, isAdmin, user?.email, adminSection, shiftWeekStart]);

  const submitShiftAssignment = async () => {
    if (!user?.email || !shiftFormStaff || !shiftFormDate || !shiftFormStart || !shiftFormEnd || !shiftFormStation) {
      showToast("Fill in staff, date, times, and station.", "error");
      return;
    }
    setShiftFormLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_email: user.email,
          staff_email: shiftFormStaff,
          shift_date: shiftFormDate,
          start_time: shiftFormStart,
          end_time: shiftFormEnd,
          station: shiftFormStation})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign shift");
      showToast("Shift assigned", "success");
      setShiftFormDate("");
      fetchShiftAssignments();
      fetchAttendance();
      if (calendarStaffEmail === shiftFormStaff) {
        fetchMonthlyCalendar(shiftFormStaff, calendarYear, calendarMonth);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to assign shift", "error");
    } finally {
      setShiftFormLoading(false);
    }
  };

  const deleteShiftAssignment = async (id: number) => {
    if (!user?.email) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/${id}/?admin_email=${encodeURIComponent(user.email)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email })});
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove shift");
      }
      showToast("Shift assignment removed", "success");
      fetchShiftAssignments();
      fetchAttendance();
    } catch (err: any) {
      showToast(err.message || "Failed to remove shift", "error");
    }
  };

  const exportShiftScheduleCsv = async () => {
    if (!user?.email) return;
    setShiftExportLoading(true);
    try {
      const params = new URLSearchParams({
        admin_email: user.email,
        week_start: shiftWeekStart});
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/export/?${params}`);
      if (!res.ok) {
        let message = "Failed to export schedule";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // CSV error responses may not be JSON
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `shift-schedule-${shiftWeekStart}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Weekly schedule exported", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to export schedule", "error");
    } finally {
      setShiftExportLoading(false);
    }
  };

  const submitAbsenceRequest = async () => {
    if (!user?.email || !absenceFormStaff || !absenceFormDate || !absenceFormReason.trim()) {
      showToast("Fill in staff, date, and reason.", "error");
      return;
    }
    setAbsenceFormLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/absence-requests/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          staff_email: absenceFormStaff,
          absence_date: absenceFormDate,
          reason: absenceFormReason.trim()})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log absence");
      showToast("Planned absence logged", "success");
      setAbsenceFormDate("");
      setAbsenceFormReason("");
      fetchAbsenceRequests();
      fetchAttendance();
      if (calendarStaffEmail === absenceFormStaff) {
        fetchMonthlyCalendar(absenceFormStaff, calendarYear, calendarMonth);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to log absence", "error");
    } finally {
      setAbsenceFormLoading(false);
    }
  };

  const cancelAbsenceRequest = async (id: number) => {
    if (!user?.email) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/absence-requests/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email })});
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      showToast("Planned absence cancelled", "success");
      fetchAbsenceRequests();
      fetchAttendance();
      if (calendarStaffEmail) fetchMonthlyCalendar(calendarStaffEmail, calendarYear, calendarMonth);
    } catch (err: any) {
      showToast(err.message || "Failed to cancel", "error");
    }
  };

  const saveStaff = async () => {
    if (!user?.email || !editingStaff) return;
    try {
      let res: Response;
      if (avatarFile) {
        const formData = new FormData();
        formData.append("admin_email", user.email);
        formData.append("name", staffForm.name);
        formData.append("role", staffForm.role);
        formData.append("phone", staffForm.phone);
        formData.append("position", staffForm.position);
        formData.append("shift_start", staffForm.shift_start || "");
        formData.append("shift_end", staffForm.shift_end || "");
        formData.append("bio", staffForm.bio);
        formData.append("is_active", String(staffForm.is_active));
        formData.append("avatar", avatarFile);
        res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff/${editingStaff.id}/`, {
          method: "PATCH",
          
          body: formData});
      } else if (!avatarPreview && editingStaff.avatar) {
        const formData = new FormData();
        formData.append("admin_email", user.email);
        formData.append("name", staffForm.name);
        formData.append("role", staffForm.role);
        formData.append("phone", staffForm.phone);
        formData.append("position", staffForm.position);
        formData.append("shift_start", staffForm.shift_start || "");
        formData.append("shift_end", staffForm.shift_end || "");
        formData.append("bio", staffForm.bio);
        formData.append("is_active", String(staffForm.is_active));
        formData.append("avatar", "");
        res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff/${editingStaff.id}/`, {
          method: "PATCH",
          
          body: formData});
      } else {
        res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff/${editingStaff.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_email: user.email, name: staffForm.name, role: staffForm.role, phone: staffForm.phone, position: staffForm.position, shift_start: staffForm.shift_start || null, shift_end: staffForm.shift_end || null, bio: staffForm.bio, is_active: staffForm.is_active })});
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update staff");
      }
      const updated = data;
      setStaffUsers((prev) => prev.map((s) => (s.id === editingStaff.id ? { ...s, name: updated.name, role: updated.role, phone: updated.phone, position: updated.position, shift_start: updated.shift_start || null, shift_end: updated.shift_end || null, bio: updated.bio, avatar: updated.avatar || null, is_active: updated.is_active } : s)));
      setEditingStaff(null);
      showToast("Staff profile updated successfully.", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to update staff profile.", "error");
    }
  };

  const assignStaffRole = async (id: number, position: string) => {
    if (!user?.email) return;
    const pos = STAFF_POSITIONS.find(p => p.key === position);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/staff/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: user.email, position })});
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to assign role");
      setStaffUsers((prev) => prev.map((s) => (s.id === id ? { ...s, position: data.position } : s)));
      showToast(position ? `${pos?.icon || ""} ${pos?.label || position} role assigned` : "Role removed", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to assign staff role.", "error");
    }
  };

  const activeOrders = orders.filter((o) => !o.isArchived);
  const archivedOrders = orders.filter((o) => o.isArchived);
  const totalRevenue = activeOrders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const totalOrders = activeOrders.length;
  const pendingOrders = activeOrders.filter((o) => o.status === "pending").length;
  const completedOrders = activeOrders.filter((o) => o.status === "completed").length;

  const isConfirmedAdmin = isAdmin || isStoredAdmin;
  if (!mounted || (isAuthLoading && !isConfirmedAdmin) || (!isLoggedIn && !storedUserRaw)) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen app-canvas relative overflow-hidden">
      {/* Background blobs */}
      <div className="admin-stagger-item absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="admin-stagger-item absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      {/* Header */}
      <div className="admin-header sticky top-0 z-40 bg-[#FFFDF9]/85 backdrop-blur-xl border-b border-[#EBE3D7] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            {/* Brand Title */}
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/admin" className="flex items-center gap-3 group">
                <div className="w-11 h-11 rounded-2xl bg-[#2A1810] border border-[#E3A458]/40 flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
                  <CroissantLogoIcon className="w-6 h-6 text-[#FAEADE] transition-transform duration-300 group-hover:rotate-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold tracking-tight text-[#2A1810] text-sm uppercase">GENERATION</span>
                    <span className="font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#E3A458] to-[#A26833] text-sm uppercase">
                      BREAD
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A26833] truncate">
                      Operations & Kitchen Portal
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 justify-end relative shrink-0">
              <div className="admin-nav-item">
                <NotificationBell userEmail={user?.email} />
              </div>
              <button
                onClick={toggleLanguage}
                className="admin-nav-item bg-[#F5EFE6] hover:bg-[#EBE3D7] border border-[#EBE3D7] text-[#2A1810] font-extrabold text-xs rounded-full py-1.5 px-3.5 transition-all uppercase"
              >
                {language}
              </button>
              
              {/* Hamburger Button for Mobile */}
              <button
                type="button"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
                className="admin-nav-item xl:hidden p-2 text-[#2A1810] hover:bg-[#2A1810]/5 rounded-2xl transition-colors"
                onClick={toggleMobileMenu}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  className="overflow-visible"
                >
                  <line className="ham-top" x1="3" y1="6" x2="21" y2="6" />
                  <line className="ham-mid" x1="3" y1="12" x2="21" y2="12" />
                  <line className="ham-bot" x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              {/* Desktop Navigation */}
              <div className="hidden xl:flex items-center gap-2">
                <Link
                  href="/admin-dashboard"
                  className="admin-nav-item flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                  <span>Analytics</span>
                </Link>
                <Link
                  href="/admin-menu"
                  className="admin-nav-item flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                  <span>Menu</span>
                </Link>
                <Link
                  href="/admin-sales"
                  className="admin-nav-item flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span>Sales Ledger</span>
                </Link>
                <Link
                  href="/admin-tables"
                  className="admin-nav-item flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  <span>Tables</span>
                </Link>
                <Link
                  href="/staff"
                  className="admin-nav-item flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                  title="Switch to Kitchen Station Live Order Display"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>
                  <span>Kitchen View</span>
                </Link>
                <Link
                  href="/profile"
                  className="admin-nav-item flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  <span>Profile</span>
                </Link>
                <button
                  onClick={() => { void performLogout(signOut); }}
                  className="admin-nav-item flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#7F3B2D] hover:text-white bg-red-50 hover:bg-[#7F3B2D] border border-red-200 hover:border-transparent transition-all shadow-xs"
                >
                  <span>{t("Logout")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {showMobileMenu && (
          <div
            ref={mobileMenuRef}
            className="mobile-nav-menu xl:hidden absolute top-[100%] right-0 w-full app-header-bar backdrop-blur-md border-b border-dark-brown/10 shadow-lg flex flex-col items-center py-4 gap-3 z-50 will-change-transform"
          >
            <Link
              href="/profile"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              {t("Profile") || "Profile"}
            </Link>
            <Link
              href="/admin-dashboard"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              Analytics
            </Link>
            <Link
              href="/admin-menu"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              Menu
            </Link>
            <Link
              href="/admin-sales"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              {t("Sales")}
            </Link>
            <Link
              href="/admin-tables"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              Tables
            </Link>
            <Link
              href="/staff"
              onClick={closeMobileMenu}
              className="mobile-nav-item flex items-center gap-3 w-[90%] bg-white hover:bg-dark-brown/5 text-dark-brown font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <span>🍳 Kitchen View</span>
            </Link>
            <button
              onClick={() => { void performLogout(signOut); }}
              className="mobile-nav-item flex items-center justify-between gap-3 w-[90%] bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm uppercase rounded-xl py-3 px-5 transition-all shadow-sm active:scale-[0.98]"
            >
              <span>{t("Logout")}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Welcome Hero */}
        <div className="admin-stagger-item flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBE3D7]/70 text-[#A26833] text-[11px] font-extrabold uppercase tracking-widest mb-2 border border-[#EBE3D7]">
              <span>👑 Operations Command Hub</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#2A1810] tracking-tight uppercase">
              {t("Hello,")} {user?.name || "Administrator"}
            </h1>
            <p className="font-paragraph text-[#2A1810]/60 text-sm sm:text-base mt-1">
              {t("Manage orders and monitor store performance.")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin-dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2A1810] text-[#FAEADE] font-extrabold text-xs uppercase tracking-wider transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <span>📊 Executive Analytics</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* 4 Luxury KPI Stat Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Orders */}
          <div className="admin-stagger-item bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                {t("Total Orders")}
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#2A1810]/5 text-[#2A1810] flex items-center justify-center text-base font-bold border border-[#EBE3D7]">
                📦
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              {totalOrders}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Active order records</p>
          </div>

          {/* Gross Sales */}
          <div className="admin-stagger-item bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                {t("Sales")}
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-extrabold text-sm border border-emerald-200">
                ₱
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              ₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Fulfilled store revenue</p>
          </div>

          {/* Pending Queue */}
          <div className="admin-stagger-item bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                {t("Pending")}
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold text-sm border border-amber-200">
                ⏳
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
                {pendingOrders}
              </p>
              {pendingOrders > 0 && (
                <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Kitchen prep queue</p>
          </div>

          {/* Registered Customers */}
          <div className="admin-stagger-item bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                {t("Customer")}
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#2A1810]/5 text-[#A26833] flex items-center justify-center font-bold text-sm border border-[#EBE3D7]">
                👥
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              {totalUsers}
            </p>
            <p className="text-[11px] text-[#2A1810]/50 font-paragraph mt-1">Registered patron accounts</p>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="admin-stagger-item flex flex-wrap items-center gap-1.5 p-1.5 rounded-full bg-[#EBE3D7]/60 border border-[#EBE3D7] w-fit mb-8 shadow-inner">
          {[
            { key: "orders", label: "Orders & Kitchen", icon: "📦" },
            { key: "staff", label: "Staff Accounts", icon: "👥" },
            { key: "roles", label: "Staff Roles", icon: "⭐" },
            { key: "contacts", label: "Staff Directory", icon: "📞" },
            { key: "attendance", label: "Attendance", icon: "⏱️" },
            { key: "activity", label: "Activity Feed", icon: "⚡" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setAdminSection(s.key as any)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all duration-200 ${
                adminSection === s.key
                  ? "bg-[#2A1810] text-[#FAEADE] shadow-md -translate-y-0.5"
                  : "text-[#2A1810]/70 hover:text-[#2A1810] hover:bg-white/60"
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {adminSection === "orders" && (<>
        {/* Orders Command & Filter Bar */}
        <div className="admin-stagger-item flex flex-wrap items-center justify-between gap-3 mb-6">
          {/* Active / Archived Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-[#EBE3D7]/60 border border-[#EBE3D7] rounded-full p-1 shadow-inner">
              <button
                onClick={() => { setViewTab("active"); setFilter("all"); }}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                  viewTab === "active"
                    ? "bg-[#2A1810] text-[#FAEADE] shadow-sm"
                    : "text-[#2A1810]/70 hover:text-[#2A1810]"
                }`}
              >
                Active Orders
              </button>
              <button
                onClick={() => { setViewTab("archived"); setFilter("all"); }}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                  viewTab === "archived"
                    ? "bg-[#2A1810] text-[#FAEADE] shadow-sm"
                    : "text-[#2A1810]/70 hover:text-[#2A1810]"
                }`}
              >
                Archive <span className="ml-1 text-[10px] opacity-75 font-mono">({archivedOrders.length})</span>
              </button>
            </div>

            {/* Status Filter Pills */}
            {viewTab === "active" && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(["all", "pending", "preparing", "ready", "completed", "cancelled"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                      filter === f
                        ? "bg-[#2A1810] text-[#FAEADE] shadow-xs"
                        : "bg-[#FFFDF9] text-[#2A1810]/70 hover:bg-[#F5EFE6] hover:text-[#2A1810] border border-[#EBE3D7]"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {viewTab === "active" && (
            <button
              onClick={autoArchive}
              className="flex items-center gap-1.5 bg-[#FFFDF9] hover:bg-[#F5EFE6] text-[#2A1810]/70 hover:text-[#2A1810] font-extrabold text-xs uppercase tracking-wider rounded-full py-2 px-4 transition-all border border-[#EBE3D7] shadow-xs"
              title="Auto-archive completed/cancelled orders older than 30 days"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              <span>Auto-Archive 30d</span>
            </button>
          )}
        </div>

        {/* Orders Ledger Card */}
        <div className="admin-stagger-item bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_4px_24px_rgba(42,24,16,0.06)] overflow-hidden mb-8">
          <div className="p-6 border-b border-[#EBE3D7]/70 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-[#2A1810] uppercase tracking-tight">
                {viewTab === "archived" ? "Archived Orders Record" : "Live Store Orders"}
              </h3>
              <p className="text-xs text-[#2A1810]/50 font-paragraph mt-0.5">
                Real-time tracking of dine-in, takeout, and advance pre-order requests
              </p>
            </div>
            <span className="font-extrabold text-xs uppercase px-3 py-1 rounded-full bg-[#2A1810]/5 text-[#2A1810]/70 border border-[#EBE3D7]">
              {filteredOrders.length} result{filteredOrders.length !== 1 ? "s" : ""}
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-4xl mb-2">📋</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">No orders found</p>
              <p className="font-paragraph text-xs text-[#2A1810]/50 mt-1">There are no orders matching your current filter selection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF6F0] text-[11px] font-extrabold uppercase text-[#2A1810]/60 border-b border-[#EBE3D7]">
                    <th className="px-6 py-4">{t("Order ID")}</th>
                    <th className="px-6 py-4 hidden md:table-cell">{t("Customer")}</th>
                    <th className="px-6 py-4">{t("Items")}</th>
                    <th className="px-6 py-4">{t("Total")}</th>
                    <th className="px-6 py-4 hidden sm:table-cell">{t("Date")}</th>
                    <th className="px-6 py-4">{t("Status")}</th>
                    <th className="px-6 py-4">{t("Action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE3D7]/60 text-sm">
                  {displayedOrders.map((order) => (
                    <tr key={order.id} className="paginated-order hover:bg-[#FAF6F0] transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-extrabold font-mono text-[#2A1810] text-sm uppercase mb-1.5">{order.id}</p>
                        {order.orderType && (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase border shadow-2xs ${
                            order.orderType === "Dine-In"
                              ? "bg-[#2A1810] text-[#FAEADE] border-[#2A1810]" 
                              : order.orderType === "Scheduled"
                              ? "bg-blue-50 text-blue-800 border-blue-200" 
                              : "bg-[#E3A458]/15 text-[#A26833] border-[#E3A458]/40"
                          }`}>
                            {order.orderType === "Dine-In" 
                              ? `🍽️ Dine-In${order.tableNumber ? ` (T-${order.tableNumber})` : ""}` 
                              : order.orderType === "Scheduled" 
                                ? `⏰ Pre-Order${order.pickupTime ? ` @ ${(() => { try { const d = new Date(order.pickupTime); return isNaN(d.getTime()) ? order.pickupTime : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return order.pickupTime; } })()}` : ""}` 
                                : "🛍️ Takeout"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <p className="font-bold text-[#2A1810] text-sm">{order.userName}</p>
                        <p className="font-paragraph text-[#2A1810]/45 text-xs truncate max-w-xs">{order.userEmail}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-xs text-[#2A1810] bg-[#2A1810]/5 px-2 py-0.5 rounded-md w-fit mb-1.5">
                          {order.totalItems} item{order.totalItems > 1 ? "s" : ""}
                        </p>
                        <div className="flex flex-col gap-1">
                          {order.items.map((i, idx) => (
                            <div key={idx} className="group/item relative">
                              <p className="font-paragraph text-[#2A1810]/80 text-xs truncate max-w-[220px]">
                                <span className="font-extrabold text-[#A26833]">{i.qty}x</span> {i.name}
                              </p>
                              {i.notes && (
                                <p className="text-[10px] bg-amber-50 border border-amber-200/60 text-amber-900 px-2 py-0.5 rounded-md italic font-bold w-fit mt-0.5">
                                  &ldquo;{i.notes}&rdquo;
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-black text-[#2A1810] font-mono text-base">₱{order.total.toFixed(2)}</p>
                        {order.paymentMethod ? (
                          <span className={`inline-block mt-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                            order.paymentStatus === "paid"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}>
                            {order.paymentMethod}
                            {order.paymentStatus === "paid" ? " · paid" : " · unpaid"}
                          </span>
                        ) : (
                          <span className="inline-block mt-1 text-[10px] font-extrabold uppercase text-[#2A1810]/40">
                            Unspecified
                          </span>
                        )}
                        {!order.isArchived && order.status !== "cancelled" && order.paymentStatus !== "paid" && (
                          <div>
                            <button
                              type="button"
                              onClick={() => markOrderPaid(order.id)}
                              className="mt-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[10px] uppercase rounded-lg px-2.5 py-1 transition-all shadow-2xs active:scale-95"
                            >
                              Mark Paid
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <p className="font-extrabold text-[#2A1810] text-xs">{new Date(order.date).toLocaleDateString()}</p>
                        <p className="font-paragraph text-[#2A1810]/40 text-xs mt-0.5 font-mono">{new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-extrabold uppercase border shadow-2xs ${
                            order.status === "completed"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : order.status === "ready"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : order.status === "preparing"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : order.status === "cancelled"
                              ? "bg-red-50 text-red-800 border-red-200"
                              : "bg-gray-50 text-gray-800 border-gray-200"
                          }`}
                        >
                          {order.status}
                        </span>
                        {order.rating != null && (
                          <div className="mt-1.5">
                            {renderStarRating(order.rating, 10)}
                            {order.servedByName && (
                              <p className="text-[9px] text-[#2A1810]/50 font-paragraph mt-0.5">Served by {order.servedByName}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {!order.isArchived && (
                            <select
                              value={order.status}
                              onChange={(e) => updateStatus(order.id, e.target.value as Order["status"])}
                              className="bg-[#FAF6F0] border border-[#EBE3D7] text-[#2A1810] font-extrabold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#A26833]/40 cursor-pointer shadow-2xs"
                            >
                              <option value="pending">Pending</option>
                              <option value="preparing">Preparing</option>
                              <option value="ready">Ready</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          )}
                          {!order.isArchived && order.status !== "cancelled" && order.status !== "ready" && order.status !== "completed" && (
                            <button
                              onClick={() => { setVoidModalOrderId(order.id); setVoidReason(""); }}
                              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-extrabold text-[10px] uppercase rounded-xl px-2.5 py-1.5 transition-all shadow-2xs"
                              title="Void this order"
                            >
                              Void
                            </button>
                          )}
                          <button
                            onClick={() => archiveOrder(order.id, !order.isArchived)}
                            className={`font-extrabold text-[10px] uppercase rounded-xl px-2.5 py-1.5 transition-all shadow-2xs border ${
                              order.isArchived
                                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810]/70 hover:text-[#2A1810] border-[#EBE3D7]"
                            }`}
                            title={order.isArchived ? "Unarchive order" : "Archive order"}
                          >
                            {order.isArchived ? "↩ Unarchive" : "📦 Archive"}
                          </button>
                        </div>
                        {order.voidReason && (
                          <button
                            onClick={() => setViewReasonData({ orderId: order.id, reason: order.voidReason! })}
                            className="flex items-center gap-1 text-[10px] text-red-600 mt-1.5 italic font-extrabold hover:text-red-800 hover:underline transition-colors cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span>View Void Reason</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {totalPages > 1 && (
            <div className="p-6 border-t border-[#EBE3D7]/70 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="bg-[#FAF6F0] hover:bg-[#F5EFE6] border border-[#EBE3D7] disabled:opacity-40 text-[#2A1810] font-extrabold text-xs uppercase tracking-wider rounded-full py-2 px-5 transition-all shadow-xs"
              >
                Previous
              </button>
              <span className="text-[#2A1810] font-extrabold text-xs uppercase tracking-wider font-mono">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="bg-[#FAF6F0] hover:bg-[#F5EFE6] border border-[#EBE3D7] disabled:opacity-40 text-[#2A1810] font-extrabold text-xs uppercase tracking-wider rounded-full py-2 px-5 transition-all shadow-xs"
              >
                Next
              </button>
            </div>
          )}
        </div>
        </>)}

        {adminSection === "staff" && (<>
        {/* Staff Management Section */}
        <div className="admin-stagger-item mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Staff Accounts</h3>
              <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
                {staffUsers.length} staff member{staffUsers.length !== 1 ? "s" : ""} · click a card to view detailed attendance history
              </p>
            </div>
          </div>

          {staffUsers.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-12 text-center shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <p className="text-4xl mb-2">👥</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">No staff accounts found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffUsers.map((s) => (
                <div
                  key={s.id}
                  onClick={() => openAttendanceHistory(s)}
                  className="bg-[#FFFDF9] border border-[#EBE3D7] hover:border-[#A26833]/40 rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all group hover:-translate-y-0.5 cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    {s.avatar ? (
                      <Image src={s.avatar} alt={s.name || s.email} width={48} height={48} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 border border-[#EBE3D7]" />
                    ) : (
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-base font-extrabold uppercase border border-[#EBE3D7] ${
                        s.role === "admin" ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#F5EFE6] text-[#2A1810]"
                      }`}>
                        {(s.name || s.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-extrabold text-[#2A1810] text-sm uppercase truncate">{s.name || s.email.split("@")[0]}</p>
                        {s.employee_id && (
                          <span className="px-2 py-0.5 rounded-md bg-[#2A1810]/5 text-[#2A1810]/60 text-[9px] font-mono font-extrabold tracking-wider border border-[#EBE3D7]">{s.employee_id}</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                          s.role === "admin" ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#E3A458]/15 text-[#A26833] border border-[#E3A458]/30"
                        }`}>
                          {s.role}
                        </span>
                      </div>
                      <p className="font-paragraph text-[#2A1810]/50 text-xs truncate mt-0.5">{s.email}</p>
                      {s.position && (() => {
                        const pos = STAFF_POSITIONS.find(p => p.key === s.position);
                        return pos ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase mt-1.5 shadow-2xs ${pos.badge} ${pos.badgeText}`}>
                            <span>{pos.icon}</span>
                            {pos.label}
                          </span>
                        ) : null;
                      })()}
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`flex items-center gap-1 text-[10px] font-extrabold uppercase ${
                          s.is_active ? "text-emerald-700" : "text-red-600"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-emerald-500" : "bg-red-400"}`}></span>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                        {s.is_email_verified && (
                          <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase text-blue-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Verified
                          </span>
                        )}
                        {s.phone && (
                          <span className="flex items-center gap-1 text-[10px] font-extrabold text-[#2A1810]/50">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            {s.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#EBE3D7]/70">
                    <button
                      onClick={(e) => { e.stopPropagation(); openAttendanceHistory(s); }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold text-[10px] uppercase rounded-xl py-2 transition-all border border-[#EBE3D7] shadow-2xs"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span>History</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditStaff(s); }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#2A1810]/5 hover:bg-[#2A1810]/10 text-[#2A1810] font-extrabold text-[10px] uppercase rounded-xl py-2 transition-all border border-[#EBE3D7] shadow-2xs"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      <span>Edit Profile</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Feedback Tied to Staff */}
        <div className="admin-stagger-item mt-12">
          <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Customer Feedback by Staff</h3>
              <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
                Tag which staff served rated orders — aggregated performance metrics per staff member
              </p>
            </div>
            <div className="flex gap-2">
              {([30, 90, 180] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFeedbackDays(d)}
                  className={`px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                    feedbackDays === d
                      ? "bg-[#2A1810] text-[#FAEADE] shadow-sm"
                      : "bg-[#FFFDF9] text-[#2A1810]/70 hover:bg-[#F5EFE6] hover:text-[#2A1810] border border-[#EBE3D7]"
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          {feedbackLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin" />
            </div>
          ) : !feedbackData ? (
            <p className="font-paragraph text-[#2A1810]/45 text-sm">Unable to load feedback data.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl bg-amber-50/80 border border-amber-200/60 p-4 text-center">
                  <p className="text-2xl font-black text-amber-900 font-mono">{feedbackData.summary.overall_avg_label}</p>
                  <p className="text-[10px] font-extrabold uppercase text-amber-800/70 mt-0.5">Overall Avg</p>
                </div>
                <div className="rounded-2xl bg-[#F5EFE6] border border-[#EBE3D7] p-4 text-center">
                  <p className="text-2xl font-black text-[#2A1810] font-mono">{feedbackData.summary.total_ratings}</p>
                  <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/60 mt-0.5">Total Reviews</p>
                </div>
                <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200/60 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-900 font-mono">{feedbackData.summary.tagged_ratings}</p>
                  <p className="text-[10px] font-extrabold uppercase text-emerald-800/70 mt-0.5">Tagged</p>
                </div>
                <div className="rounded-2xl bg-indigo-50/80 border border-indigo-200/60 p-4 text-center">
                  <p className="text-2xl font-black text-indigo-900 font-mono">{feedbackData.summary.untagged_ratings}</p>
                  <p className="text-[10px] font-extrabold uppercase text-indigo-800/70 mt-0.5">Needs Tagging</p>
                </div>
              </div>

              {feedbackData.staff.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  {feedbackData.staff.map((s: any) => (
                    <div key={s.user_id} className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)]">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-extrabold text-[#2A1810] uppercase">{s.name}</p>
                          <p className="text-[10px] text-[#2A1810]/45 font-mono">{s.employee_id || s.email}</p>
                          <p className="text-[10px] text-[#2A1810]/55 uppercase font-extrabold mt-1">{s.position_display}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-amber-700 font-mono">{s.avg_rating_label}</p>
                          <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/45">{s.review_count} review{s.review_count !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[9px] font-extrabold uppercase">
                        <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">5★ {s.five_star}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">4★ {s.four_star}</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800">3★ {s.three_star}</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">≤2★ {s.two_star + s.one_star}</span>
                      </div>
                      {s.recent_reviews?.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-[#EBE3D7]/70 pt-3">
                          {s.recent_reviews.slice(0, 2).map((r: any) => (
                            <div key={`${s.user_id}-${r.order_id}`} className="text-xs">
                              <div className="flex items-center gap-2">
                                {renderStarRating(r.rating, 10)}
                                <span className="font-extrabold text-[#2A1810]/60">{r.order_label}</span>
                              </div>
                              {r.comment && <p className="text-[#2A1810]/65 font-paragraph mt-0.5 line-clamp-2">&ldquo;{r.comment}&rdquo;</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
                <p className="text-xs font-extrabold uppercase text-[#2A1810]/60 mb-4 tracking-wider">Tag Staff on Customer Reviews</p>
                {feedbackData.untagged_reviews.length === 0 && feedbackData.summary.total_ratings === 0 ? (
                  <p className="font-paragraph text-[#2A1810]/45 text-sm">No customer reviews yet. Ratings appear after customers rate completed orders.</p>
                ) : feedbackData.untagged_reviews.length === 0 ? (
                  <p className="font-paragraph text-[#2A1810]/45 text-sm">All reviews in this period are tagged to staff.</p>
                ) : (
                  <div className="space-y-3">
                    {feedbackData.untagged_reviews.map((review: any) => (
                      <div key={review.order_id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-[#FAF6F0] border border-[#EBE3D7]">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-[#2A1810] uppercase text-xs">{review.order_label}</span>
                            {renderStarRating(review.rating, 12)}
                            <span className="text-[10px] text-[#2A1810]/45 font-paragraph">{review.customer_name}</span>
                          </div>
                          {review.rating_comment && (
                            <p className="text-sm text-[#2A1810]/70 font-paragraph mt-1">&ldquo;{review.rating_comment}&rdquo;</p>
                          )}
                          <p className="text-[10px] text-[#2A1810]/40 mt-1 font-mono">
                            {review.rated_at ? new Date(review.rated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </div>
                        <select
                          defaultValue=""
                          disabled={taggingOrderId === review.order_id}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) tagOrderStaff(review.order_id, val);
                          }}
                          className="bg-white border border-[#EBE3D7] rounded-xl px-3 py-2 text-xs font-extrabold text-[#2A1810] min-w-[180px] shadow-2xs"
                        >
                          <option value="" disabled>Tag staff who served…</option>
                          {staffUsers.map((s) => (
                            <option key={s.email} value={s.email}>{s.name || s.email}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        </>)}

        {adminSection === "roles" && (<>
        {/* Staff Role Assignment Section */}
        <div className="admin-stagger-item mt-8">
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Staff Role Assignment</h3>
            <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">Assign a role to each staff member — roles appear as colored badges</p>
          </div>

          {staffUsers.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-12 text-center shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <p className="text-4xl mb-2">📋</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">No staff accounts to assign roles</p>
            </div>
          ) : (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_4px_24px_rgba(42,24,16,0.06)] overflow-hidden">
              {/* Header */}
              <div className="hidden md:grid grid-cols-[1fr_1fr_1fr] gap-4 px-6 py-4 bg-[#FAF6F0] border-b border-[#EBE3D7] text-[11px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider">
                <span>Staff Member</span>
                <span>Current Station Role</span>
                <span>Assign Station Role</span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-[#EBE3D7]/60">
                {staffUsers.map((s) => {
                  const currentPos = STAFF_POSITIONS.find(p => p.key === s.position);
                  return (
                    <div key={s.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-3 md:gap-4 px-6 py-4 items-center hover:bg-[#FAF6F0] transition-colors">
                      {/* Staff info */}
                      <div className="flex items-center gap-3">
                        {s.avatar ? (
                          <Image src={s.avatar} alt={s.name || s.email} width={36} height={36} className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-[#EBE3D7]" />
                        ) : (
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-extrabold uppercase border border-[#EBE3D7] ${
                            s.role === "admin" ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#F5EFE6] text-[#2A1810]"
                          }`}>
                            {(s.name || s.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => openAttendanceHistory(s)} className="font-extrabold text-[#2A1810] text-xs uppercase truncate hover:underline text-left">
                              {s.name || s.email.split("@")[0]}
                            </button>
                            {s.employee_id && (
                              <span className="px-1.5 py-0.5 rounded bg-[#2A1810]/5 text-[#2A1810]/50 text-[9px] font-mono font-extrabold tracking-wider border border-[#EBE3D7] flex-shrink-0">{s.employee_id}</span>
                            )}
                          </div>
                          <p className="font-paragraph text-[#2A1810]/40 text-[10px] truncate">{s.email}</p>
                        </div>
                      </div>
                      {/* Current role badge */}
                      <div className="flex items-center">
                        {currentPos ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase shadow-2xs ${currentPos.badge} ${currentPos.badgeText}`}>
                            <span>{currentPos.icon}</span>
                            {currentPos.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-gray-100 text-gray-500 border border-gray-200">
                            <span>—</span>
                            No Role
                          </span>
                        )}
                      </div>
                      {/* Role selector */}
                      <div className="flex flex-wrap gap-1.5">
                        {STAFF_POSITIONS.map((pos) => (
                          <button
                            key={pos.key}
                            onClick={() => {
                              if (s.position !== pos.key) {
                                setStaffForm({ name: s.name, role: s.role, phone: s.phone, position: pos.key, shift_start: s.shift_start || "", shift_end: s.shift_end || "", bio: s.bio, is_active: s.is_active });
                                setEditingStaff(s);
                                assignStaffRole(s.id, pos.key);
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all border shadow-2xs ${
                              s.position === pos.key
                                ? `${pos.badge} ${pos.badgeText} border-current shadow-xs`
                                : "bg-white border-[#EBE3D7] text-[#2A1810]/60 hover:border-[#A26833]/40 hover:text-[#2A1810]"
                            }`}
                          >
                            {pos.icon} {pos.label}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            if (s.position !== "") {
                              setStaffForm({ name: s.name, role: s.role, phone: s.phone, position: "", shift_start: s.shift_start || "", shift_end: s.shift_end || "", bio: s.bio, is_active: s.is_active });
                              setEditingStaff(s);
                              assignStaffRole(s.id, "");
                            }
                          }}
                          className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all border shadow-2xs ${
                            s.position === ""
                              ? "bg-gray-100 text-gray-700 border-gray-300"
                              : "bg-white border-[#EBE3D7] text-[#2A1810]/50 hover:border-[#A26833]/40 hover:text-[#2A1810]"
                          }`}
                        >
                          — None
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        </>)}

        {adminSection === "contacts" && (<>
        {/* Staff Contact Directory */}
        <div className="admin-stagger-item mt-8">
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Staff Contact Directory</h3>
            <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">All staff phone numbers and emails in one place — tap to call or copy</p>
          </div>

          {staffUsers.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-12 text-center shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <p className="text-4xl mb-2">📞</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">No staff contacts to display</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffUsers.map((s) => {
                const pos = STAFF_POSITIONS.find(p => p.key === s.position);
                return (
                  <div
                    key={s.id}
                    className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 shadow-[0_4px_20px_rgba(42,24,16,0.05)] hover:shadow-md transition-all group"
                  >
                    {/* Top: Avatar + Name + Role */}
                    <div className="flex items-center gap-3 mb-4">
                      {s.avatar ? (
                        <Image src={s.avatar} alt={s.name || s.email} width={44} height={44} className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border border-[#EBE3D7]" />
                      ) : (
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-extrabold uppercase border border-[#EBE3D7] ${
                          s.role === "admin" ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#F5EFE6] text-[#2A1810]"
                        }`}>
                          {(s.name || s.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-extrabold text-[#2A1810] text-sm uppercase truncate">{s.name || s.email.split("@")[0]}</p>
                          {s.employee_id && (
                            <span className="px-1.5 py-0.5 rounded bg-[#2A1810]/5 text-[#2A1810]/50 text-[9px] font-mono font-extrabold tracking-wider border border-[#EBE3D7] flex-shrink-0">{s.employee_id}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {pos && (
                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase shadow-2xs ${pos.badge} ${pos.badgeText}`}>
                              <span>{pos.icon}</span>{pos.label}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            s.role === "admin" ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#E3A458]/15 text-[#A26833] border border-[#E3A458]/30"
                          }`}>
                            {s.role}
                          </span>
                          <span className={`flex items-center gap-0.5 text-[9px] font-extrabold uppercase ${
                            s.is_active ? "text-emerald-700" : "text-red-500"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${s.is_active ? "bg-emerald-500" : "bg-red-400"}`}></span>
                            {s.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contact Actions */}
                    <div className="space-y-2">
                      {/* Email */}
                      <div className="flex items-center gap-2 bg-[#FAF6F0] rounded-2xl px-3 py-2.5 group/email border border-[#EBE3D7]">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0 border border-blue-200">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        </div>
                        <span className="flex-1 text-[#2A1810]/70 text-xs font-paragraph truncate">{s.email}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(s.email); showToast("Email copied!", "success"); }}
                          className="opacity-0 group-hover/email:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all flex-shrink-0 border border-blue-200"
                          title="Copy email"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                      </div>

                      {/* Phone */}
                      {s.phone ? (
                        <div className="flex items-center gap-2 bg-[#FAF6F0] rounded-2xl px-3 py-2.5 group/phone border border-[#EBE3D7]">
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </div>
                          <span className="flex-1 text-[#2A1810]/70 text-xs font-paragraph truncate font-mono">{s.phone}</span>
                          <a
                            href={`tel:${s.phone}`}
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-all flex-shrink-0 border border-emerald-200"
                            title="Call"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(s.phone!); showToast("Phone number copied!", "success"); }}
                            className="opacity-0 group-hover/phone:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-all flex-shrink-0 border border-emerald-200"
                            title="Copy phone"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-[#FAF6F0] rounded-2xl px-3 py-2.5 border border-[#EBE3D7]">
                          <div className="w-8 h-8 rounded-xl bg-[#2A1810]/5 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          </div>
                          <span className="text-[#2A1810]/40 text-xs font-paragraph italic">No phone number listed</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>)}

        {adminSection === "attendance" && (<>
        {/* Today's Attendance Log */}
        <div className="admin-stagger-item mt-8">
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Today&apos;s Attendance</h3>
            <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
              Compares scheduled staff vs clock-ins — click a staff name to view detailed history
            </p>
          </div>

          {attendanceData?.summary && attendanceData.summary.absent_today > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3">
              <span className="text-lg leading-none" aria-hidden>⚠️</span>
              <div>
                <p className="text-sm font-extrabold text-red-800 uppercase tracking-wide">Absent today</p>
                <p className="text-xs text-red-700/80 font-paragraph mt-0.5">
                  {attendanceData.summary.absent_today} scheduled staff did not clock in within the{" "}
                  {attendanceData.summary.grace_minutes ?? 15}-minute grace period.
                </p>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          {attendanceData?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
              <div className="bg-blue-50/80 border border-blue-200/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-blue-800 font-mono">{attendanceData.summary.pending}</p>
                <p className="text-[10px] font-extrabold uppercase text-blue-700/70 mt-0.5">Pending</p>
              </div>
              <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-emerald-800 font-mono">{attendanceData.summary.clocked_in}</p>
                <p className="text-[10px] font-extrabold uppercase text-emerald-700/70 mt-0.5">On Time</p>
              </div>
              <div className="bg-orange-50/80 border border-orange-200/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-orange-800 font-mono">{attendanceData.summary.late}</p>
                <p className="text-[10px] font-extrabold uppercase text-orange-700/70 mt-0.5">Late</p>
              </div>
              <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-amber-800 font-mono">{attendanceData.summary.on_break}</p>
                <p className="text-[10px] font-extrabold uppercase text-amber-700/70 mt-0.5">On Break</p>
              </div>
              <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-[#2A1810]/70 font-mono">{attendanceData.summary.clocked_out}</p>
                <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mt-0.5">Clocked Out</p>
              </div>
              <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-4 text-center ring-2 ring-red-300/50">
                <p className="text-2xl font-black text-red-800 font-mono">{attendanceData.summary.absent_today ?? 0}</p>
                <p className="text-[10px] font-extrabold uppercase text-red-700/70 mt-0.5">Absent Today</p>
              </div>
              <div className="bg-yellow-50/80 border border-yellow-200/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-yellow-800 font-mono">{attendanceData.summary.within_grace ?? 0}</p>
                <p className="text-[10px] font-extrabold uppercase text-yellow-700/70 mt-0.5">Grace Period</p>
              </div>
              <div className="bg-indigo-50/80 border border-indigo-200/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-indigo-800 font-mono">{attendanceData.summary.planned_absent ?? 0}</p>
                <p className="text-[10px] font-extrabold uppercase text-indigo-700/70 mt-0.5">Planned Off</p>
              </div>
            </div>
          )}

          {/* Attendance Table */}
          {!attendanceData?.attendance?.length ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-12 text-center shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <p className="text-4xl mb-2">📋</p>
              <p className="font-extrabold uppercase text-sm text-[#2A1810]">No staff attendance data yet</p>
            </div>
          ) : (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(42,24,16,0.06)] mb-8">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF6F0] text-[11px] font-extrabold uppercase text-[#2A1810]/60 border-b border-[#EBE3D7]">
                      <th className="px-6 py-4">Staff</th>
                      <th className="px-6 py-4">Position</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Clock In</th>
                      <th className="px-6 py-4">Break</th>
                      <th className="px-6 py-4">Clock Out</th>
                      <th className="px-6 py-4 text-right">Duration</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE3D7]/60 text-sm">
                    {attendanceData.attendance.map((a: any) => {
                      const cfg = getAttendanceStatusConfig(a);
                      const handleApprove = async () => {
                        try {
                          const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/approve/`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ admin_email: user?.email })});
                          if (res.ok) { showToast("Approved — On Time!", "success"); fetchAttendance(); }
                          else { const d = await res.json(); showToast(d.error || "Failed to approve", "error"); }
                        } catch { showToast("Failed to approve", "error"); }
                      };
                      const handleMarkLate = async () => {
                        try {
                          const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-late/`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ admin_email: user?.email })});
                          if (res.ok) { showToast("Marked as Late", "success"); fetchAttendance(); }
                          else { const d = await res.json(); showToast(d.error || "Failed to mark late", "error"); }
                        } catch { showToast("Failed to mark late", "error"); }
                      };
                      const handleMarkAbsent = async () => {
                        try {
                          const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-absent/`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ admin_email: user?.email })});
                          if (res.ok) { showToast("Marked as Absent", "success"); fetchAttendance(); }
                          else { const d = await res.json(); showToast(d.error || "Failed to mark absent", "error"); }
                        } catch { showToast("Failed to mark absent", "error"); }
                      };
                      return (
                        <tr key={a.id} className={`hover:bg-[#FAF6F0] transition-colors ${a.status === 'pending' ? 'bg-blue-50/30' : ''} ${a.absent_today ? 'bg-red-50/40' : ''}`}>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => openAttendanceHistory(a)}
                              className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                            >
                              {a.avatar ? (
                                <Image src={a.avatar} alt={a.name} width={36} height={36} className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-[#EBE3D7]" />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-[#F5EFE6] flex items-center justify-center text-xs font-extrabold uppercase text-[#2A1810] flex-shrink-0 border border-[#EBE3D7]">{a.name.charAt(0)}</div>
                              )}
                              <div>
                                <p className="text-sm font-extrabold text-[#2A1810] uppercase truncate hover:underline">{a.name}</p>
                                <p className="text-[10px] text-[#2A1810]/40 font-mono">{a.employee_id || a.email}</p>
                              </div>
                            </button>
                          </td>
                          <td className="px-6 py-4 text-xs text-[#2A1810]/70 capitalize font-bold">
                            {a.shift_assignment?.station_display || a.position || "—"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shadow-2xs ${cfg.color} ${cfg.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${a.status === 'pending' || a.absent_today ? 'animate-pulse' : ''}`}></span>
                              {cfg.label}
                            </span>
                            {a.planned_absence && (
                              <span className="ml-1.5 block text-[9px] text-indigo-700 font-paragraph mt-0.5 max-w-[180px] truncate" title={a.planned_absence.reason}>
                                🗓️ {a.planned_absence.reason}
                              </span>
                            )}
                            {a.shift_start && (a.absent_today || a.display_status === 'within_grace') && !a.planned_absence && (
                              <span className="ml-1.5 block text-[9px] text-[#2A1810]/50 font-paragraph mt-0.5">
                                Shift {new Date(`1970-01-01T${a.shift_start}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {a.minutes_late != null && a.minutes_late > 0 && (
                              <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[9px] font-extrabold">
                                +{a.minutes_late}m late
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-[#2A1810]/70 font-mono">{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                          <td className="px-6 py-4 text-xs text-[#2A1810]/70 font-mono">
                            {a.break_start ? new Date(a.break_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                            {a.break_end ? ` → ${new Date(a.break_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </td>
                          <td className="px-6 py-4 text-xs text-[#2A1810]/70 font-mono">{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                          <td className="px-6 py-4 text-right text-xs font-black font-mono text-[#2A1810]">{a.duration || "—"}</td>
                          <td className="px-6 py-4 text-right">
                            {a.status === 'pending' && a.shift_id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={handleApprove} className="px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-emerald-700 hover:bg-emerald-800 text-white transition-all shadow-2xs active:scale-95">
                                  On Time
                                </button>
                                <button onClick={handleMarkLate} className="px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-2xs active:scale-95">
                                  Late
                                </button>
                                <button onClick={handleMarkAbsent} className="px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-red-600 hover:bg-red-700 text-white transition-all shadow-2xs active:scale-95">
                                  Absent
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#2A1810]/30">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-[#EBE3D7]/60">
                {attendanceData.attendance.map((a: any) => {
                  const cfg = getAttendanceStatusConfig(a);
                  const handleApprove = async () => {
                    try {
                      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/approve/`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ admin_email: user?.email })});
                      if (res.ok) { showToast("Approved — On Time!", "success"); fetchAttendance(); }
                      else { const d = await res.json(); showToast(d.error || "Failed to approve", "error"); }
                    } catch { showToast("Failed to approve", "error"); }
                  };
                  const handleMarkLate = async () => {
                    try {
                      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-late/`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ admin_email: user?.email })});
                      if (res.ok) { showToast("Marked as Late", "success"); fetchAttendance(); }
                      else { const d = await res.json(); showToast(d.error || "Failed to mark late", "error"); }
                    } catch { showToast("Failed to mark late", "error"); }
                  };
                  const handleMarkAbsent = async () => {
                    try {
                      const res = await authFetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-absent/`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ admin_email: user?.email })});
                      if (res.ok) { showToast("Marked as Absent", "success"); fetchAttendance(); }
                      else { const d = await res.json(); showToast(d.error || "Failed to mark absent", "error"); }
                    } catch { showToast("Failed to mark absent", "error"); }
                  };
                  return (
                    <div key={a.id} className={`p-4 ${a.status === 'pending' ? 'bg-blue-50/30' : ''} ${a.absent_today ? 'bg-red-50/40' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          onClick={() => openAttendanceHistory(a)}
                          className="flex items-center gap-2 text-left"
                        >
                          {a.avatar ? (
                            <Image src={a.avatar} alt={a.name} width={28} height={28} className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-[#EBE3D7]" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-[#F5EFE6] flex items-center justify-center text-[10px] font-extrabold uppercase text-[#2A1810] flex-shrink-0 border border-[#EBE3D7]">{a.name.charAt(0)}</div>
                          )}
                          <p className="text-sm font-extrabold text-[#2A1810] uppercase hover:underline">{a.name}</p>
                        </button>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${cfg.color} ${cfg.bg}`}>
                          <span className={`w-1 h-1 rounded-full ${cfg.dot} ${a.status === 'pending' || a.absent_today ? 'animate-pulse' : ''}`}></span>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-[#2A1810]/60 font-mono mt-2">
                        <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">In</span>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                        <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">Break</span>{a.break_start ? new Date(a.break_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                        <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">Out</span>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                      </div>
                      {a.status === 'pending' && a.shift_id && (
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={handleApprove} className="flex-1 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase bg-emerald-700 hover:bg-emerald-800 text-white transition-all shadow-2xs">On Time</button>
                          <button onClick={handleMarkLate} className="flex-1 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-2xs">Late</button>
                          <button onClick={handleMarkAbsent} className="flex-1 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase bg-red-600 hover:bg-red-700 text-white transition-all shadow-2xs">Absent</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Assign Shift Form */}
        <div className="admin-stagger-item mt-12">
          <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Assign Shift</h3>
              <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
                Pick staff, date, start/end time, and station — saved per week
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShiftWeekStart((w) => shiftWeekStartISO(w, -1))}
                className="px-3.5 py-1.5 rounded-full bg-[#FFFDF9] border border-[#EBE3D7] text-[#2A1810] text-xs font-extrabold uppercase hover:bg-[#F5EFE6] transition-all shadow-xs"
              >
                ← Prev
              </button>
              <span className="text-xs font-extrabold text-[#2A1810]/70 min-w-[160px] text-center font-mono">
                {new Date(`${shiftWeekStart}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}
                {" – "}
                {new Date(`${getWeekEndISO(shiftWeekStart)}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setShiftWeekStart((w) => shiftWeekStartISO(w, 1))}
                className="px-3.5 py-1.5 rounded-full bg-[#FFFDF9] border border-[#EBE3D7] text-[#2A1810] text-xs font-extrabold uppercase hover:bg-[#F5EFE6] transition-all shadow-xs"
              >
                Next →
              </button>
              <button
                type="button"
                onClick={() => setShiftWeekStart(getWeekMondayISO())}
                className="px-3.5 py-1.5 rounded-full bg-[#2A1810]/5 text-[#2A1810] text-xs font-extrabold uppercase hover:bg-[#2A1810]/10 transition-all border border-[#EBE3D7]"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={exportShiftScheduleCsv}
                disabled={shiftExportLoading}
                className="px-4 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold uppercase transition-all disabled:opacity-50 shadow-xs"
              >
                {shiftExportLoading ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Staff Member</label>
                  <select
                    value={shiftFormStaff}
                    onChange={(e) => setShiftFormStaff(e.target.value)}
                    className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#2A1810] shadow-2xs"
                  >
                    {staffUsers.map((s) => (
                      <option key={s.email} value={s.email}>{s.name || s.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Shift Date</label>
                  <input
                    type="date"
                    value={shiftFormDate}
                    min={shiftWeekStart}
                    max={getWeekEndISO(shiftWeekStart)}
                    onChange={(e) => setShiftFormDate(e.target.value)}
                    className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm text-[#2A1810] font-mono shadow-2xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Start Time</label>
                    <input
                      type="time"
                      value={shiftFormStart}
                      onChange={(e) => setShiftFormStart(e.target.value)}
                      className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm text-[#2A1810] font-mono shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">End Time</label>
                    <input
                      type="time"
                      value={shiftFormEnd}
                      onChange={(e) => setShiftFormEnd(e.target.value)}
                      className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm text-[#2A1810] font-mono shadow-2xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Station</label>
                  <select
                    value={shiftFormStation}
                    onChange={(e) => setShiftFormStation(e.target.value)}
                    className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#2A1810] shadow-2xs"
                  >
                    {STAFF_POSITIONS.map((pos) => (
                      <option key={pos.key} value={pos.key}>{pos.icon} {pos.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={submitShiftAssignment}
                  disabled={shiftFormLoading}
                  className="w-full py-3 rounded-2xl bg-[#2A1810] hover:bg-[#2A1810]/90 text-[#FAEADE] font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
                >
                  {shiftFormLoading ? "Saving…" : "Assign Shift"}
                </button>
              </div>
            </div>
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs font-extrabold uppercase text-[#2A1810]/60 tracking-wider">This Week&apos;s Schedule</p>
                <button
                  type="button"
                  onClick={exportShiftScheduleCsv}
                  disabled={shiftExportLoading}
                  className="text-xs font-extrabold uppercase text-emerald-800 hover:text-emerald-900 disabled:opacity-50"
                >
                  {shiftExportLoading ? "Exporting…" : "Download CSV"}
                </button>
              </div>
              {shiftAssignLoading ? (
                <p className="font-paragraph text-[#2A1810]/45 text-sm">Loading schedule…</p>
              ) : shiftAssignments.length === 0 ? (
                <p className="font-paragraph text-[#2A1810]/45 text-sm">No shifts assigned for this week</p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {shiftAssignments.map((a) => {
                    const pos = STAFF_POSITIONS.find((p) => p.key === a.station);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#EBE3D7]">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-[#2A1810] truncate">{a.user_name || a.user_email}</p>
                          <p className="text-[11px] text-[#2A1810]/50 font-paragraph font-mono">
                            {new Date(`${a.shift_date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            {" · "}
                            {formatShiftTime(a.start_time)} – {formatShiftTime(a.end_time)}
                          </p>
                          <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${pos?.badge || "bg-gray-100"} ${pos?.badgeText || "text-gray-700"}`}>
                            {pos?.icon} {a.station_display}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteShiftAssignment(a.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-all shadow-2xs"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Absence Request Form */}
        <div className="admin-stagger-item mt-12">
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Absence Request Form</h3>
            <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
              Log planned absences in advance — shown as indigo on the calendar, separate from unexpected absences (red)
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Staff Member</label>
                  <select
                    value={absenceFormStaff}
                    onChange={(e) => setAbsenceFormStaff(e.target.value)}
                    className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#2A1810] shadow-2xs"
                  >
                    {staffUsers.map((s) => (
                      <option key={s.email} value={s.email}>{s.name || s.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Absence Date</label>
                  <input
                    type="date"
                    value={absenceFormDate}
                    onChange={(e) => setAbsenceFormDate(e.target.value)}
                    className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm text-[#2A1810] font-mono shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-[#2A1810]/50 mb-1.5 tracking-wider">Reason</label>
                  <textarea
                    value={absenceFormReason}
                    onChange={(e) => setAbsenceFormReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Medical appointment, family leave, approved day off..."
                    className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2.5 text-sm text-[#2A1810] font-paragraph resize-none shadow-2xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitAbsenceRequest}
                  disabled={absenceFormLoading}
                  className="w-full py-3 rounded-2xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm"
                >
                  {absenceFormLoading ? "Saving…" : "Log Planned Absence"}
                </button>
              </div>
            </div>
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-6 shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <p className="text-xs font-extrabold uppercase text-[#2A1810]/60 mb-3 tracking-wider">Upcoming Planned Absences</p>
              {absenceRequests.filter((r) => r.status === "approved" && r.absence_date >= new Date().toISOString().slice(0, 10)).length === 0 ? (
                <p className="font-paragraph text-[#2A1810]/45 text-sm">No upcoming planned absences</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {absenceRequests
                    .filter((r) => r.status === "approved" && r.absence_date >= new Date().toISOString().slice(0, 10))
                    .slice(0, 20)
                    .map((r) => (
                      <div key={r.id} className="rounded-2xl border border-indigo-200/60 bg-indigo-50/50 p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-indigo-950 uppercase">{r.user_name || r.user_email}</p>
                            <p className="text-[11px] text-indigo-800 font-paragraph mt-0.5 font-mono">
                              {new Date(`${r.absence_date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            <p className="text-xs text-indigo-900/80 font-paragraph mt-1">🗓️ {r.reason}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => cancelAbsenceRequest(r.id)}
                            className="text-[10px] font-extrabold uppercase text-red-600 hover:text-red-800 flex-shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Monthly Attendance Summary */}
        <div className="admin-stagger-item mt-12">
          <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Monthly Attendance Summary</h3>
              <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
                Calendar view per staff — green = present, yellow = late, red = unexpected absent, indigo = planned absence
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 tracking-wider">Staff Member</label>
              <select
                value={calendarStaffEmail}
                onChange={(e) => setCalendarStaffEmail(e.target.value)}
                className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-xl px-3 py-2 text-sm font-extrabold text-[#2A1810] min-w-[180px] shadow-2xs"
              >
                {staffUsers.length === 0 && <option value="">No staff</option>}
                {staffUsers.map((s) => (
                  <option key={s.email} value={s.email}>{s.name || s.email}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 md:p-8 shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
            <MonthlyCalendarGrid
              data={calendarData}
              loading={calendarLoading}
              selectedDay={selectedCalendarDay}
              onSelectDay={setSelectedCalendarDay}
              onPrevMonth={() => shiftCalendarMonth(-1, calendarStaffEmail)}
              onNextMonth={() => shiftCalendarMonth(1, calendarStaffEmail)}
            />
          </div>
        </div>

        {/* Weekly Payroll Summary */}
        <div className="admin-stagger-item mt-12">
          <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Payroll Summary</h3>
              <p className="font-paragraph text-[#2A1810]/50 text-xs sm:text-sm mt-0.5">
                Hours beyond {payrollData?.standard_daily_hours ?? 8}h per day are flagged as overtime (Mon–Sun)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 tracking-wider">OT Multiplier</label>
              <select
                value={otMultiplier}
                onChange={(e) => setOtMultiplier(e.target.value)}
                className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-xl px-3 py-2 text-sm font-extrabold text-[#2A1810] shadow-2xs"
              >
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
              <button
                onClick={fetchPayrollSummary}
                disabled={payrollLoading}
                className="px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase bg-[#2A1810] hover:bg-[#2A1810]/90 text-[#FAEADE] transition-all disabled:opacity-50 shadow-xs"
              >
                {payrollLoading ? "Loading…" : "Apply"}
              </button>
            </div>
          </div>

          {payrollData?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-2xl p-4 text-center">
                <p className="text-xl font-black text-emerald-900 font-mono">{payrollData.summary.total_regular_display}</p>
                <p className="text-[10px] font-extrabold uppercase text-emerald-800/70 mt-0.5">Regular (All Staff)</p>
              </div>
              <div className="bg-orange-50/80 border border-orange-200/60 rounded-2xl p-4 text-center">
                <p className="text-xl font-black text-orange-900 font-mono">{payrollData.summary.total_overtime_display}</p>
                <p className="text-[10px] font-extrabold uppercase text-orange-800/70 mt-0.5">Overtime</p>
              </div>
              <div className="bg-[#FAF6F0] border border-[#EBE3D7] rounded-2xl p-4 text-center">
                <p className="text-xl font-black text-[#2A1810] font-mono">{payrollData.summary.total_weighted_overtime_hours}h</p>
                <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mt-0.5">OT × {payrollData.overtime_multiplier}</p>
              </div>
              <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-2xl p-4 text-center">
                <p className="text-xl font-black text-[#2A1810] font-mono">{payrollData.summary.staff_with_overtime}</p>
                <p className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 mt-0.5">Staff w/ OT</p>
              </div>
            </div>
          )}

          {payrollLoading && !payrollData ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-10 text-center">
              <div className="w-8 h-8 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin mx-auto" />
            </div>
          ) : !payrollData?.staff?.length ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-10 text-center shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <p className="font-paragraph text-[#2A1810]/50">No payroll data for this week</p>
            </div>
          ) : (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(42,24,16,0.06)] mb-8">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF6F0] text-[11px] font-extrabold uppercase text-[#2A1810]/60 border-b border-[#EBE3D7]">
                      <th className="px-6 py-4">Staff Member</th>
                      <th className="px-6 py-4 text-right">Regular</th>
                      <th className="px-6 py-4 text-right">Overtime</th>
                      <th className="px-6 py-4 text-right">OT × {payrollData.overtime_multiplier}</th>
                      <th className="px-6 py-4 text-right">Total</th>
                      <th className="px-6 py-4 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE3D7]/60 text-sm">
                    {payrollData.staff.map((s: any) => (
                      <React.Fragment key={s.email}>
                        <tr className={`hover:bg-[#FAF6F0] transition-colors ${s.overtime_seconds > 0 ? "bg-orange-50/30" : ""}`}>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => openAttendanceHistory(s)}
                              className="text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="text-sm font-extrabold text-[#2A1810] uppercase hover:underline">{s.name}</p>
                              <p className="text-[10px] text-[#2A1810]/40 font-mono">{s.employee_id || s.email}</p>
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-mono text-[#2A1810]/70 font-bold">{s.regular_display}</td>
                          <td className="px-6 py-4 text-right">
                            {s.overtime_seconds > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-extrabold font-mono border border-orange-200">
                                {s.overtime_display}
                              </span>
                            ) : (
                              <span className="text-sm font-mono text-[#2A1810]/30">0m</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-black text-[#2A1810]">{s.weighted_overtime_display}</td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-black text-[#2A1810]">{s.total_display}</td>
                          <td className="px-6 py-4 text-center">
                            {s.daily_breakdown?.length > 0 && (
                              <button
                                onClick={() => setExpandedPayrollEmail(expandedPayrollEmail === s.email ? null : s.email)}
                                className="text-[10px] font-extrabold uppercase text-[#2A1810]/50 hover:text-[#2A1810]"
                              >
                                {expandedPayrollEmail === s.email ? "Hide" : "Days"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedPayrollEmail === s.email && s.daily_breakdown?.map((d: any) => (
                          <tr key={`${s.email}-${d.date}`} className="bg-[#FAF6F0]/60 border-b border-[#EBE3D7]/60">
                            <td className="px-6 py-2 pl-12 text-xs text-[#2A1810]/60 font-paragraph font-mono">
                              {new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            </td>
                            <td className="px-6 py-2 text-right text-xs font-mono text-[#2A1810]/60">{d.regular_display}</td>
                            <td className="px-6 py-2 text-right">
                              {d.has_overtime ? (
                                <span className="text-xs font-extrabold text-orange-700 font-mono">{d.overtime_display}</span>
                              ) : (
                                <span className="text-xs text-[#2A1810]/30">—</span>
                              )}
                            </td>
                            <td colSpan={3} className="px-6 py-2 text-right text-xs font-mono text-[#2A1810]/50">{d.total_display} worked</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-[#EBE3D7]/60 p-2">
                {payrollData.staff.map((s: any) => (
                  <div key={s.email} className={`p-4 rounded-2xl ${s.overtime_seconds > 0 ? "bg-orange-50/40" : ""}`}>
                    <button type="button" onClick={() => openAttendanceHistory(s)} className="text-sm font-extrabold text-[#2A1810] uppercase hover:underline text-left">
                      {s.name}
                    </button>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px]">
                      <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">Reg</span><span className="font-mono font-bold">{s.regular_display}</span></div>
                      <div><span className="block text-orange-700 uppercase font-extrabold">OT</span><span className="font-mono font-bold text-orange-800">{s.overtime_display}</span></div>
                      <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">×{payrollData.overtime_multiplier}</span><span className="font-mono font-bold">{s.weighted_overtime_display}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </>)}

        {adminSection === "activity" && (<>
        {/* Staff Activity Feed */}
        <div className="admin-stagger-item mt-8">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-black text-[#2A1810] uppercase tracking-tight">Activity Feed</h2>
            <p className="text-[#2A1810]/50 font-paragraph text-xs sm:text-sm mt-0.5">Live audit log of staff actions (last 24 hours)</p>
          </div>

          {activityFeed.length === 0 ? (
            <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-12 text-center shadow-[0_4px_24px_rgba(42,24,16,0.06)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-[#2A1810]/30"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <p className="text-[#2A1810]/50 font-extrabold uppercase text-sm">No activity yet</p>
              <p className="text-[#2A1810]/40 text-xs mt-1">Actions will appear here as staff clock in, take breaks, and fulfill orders.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activityFeed.map((a: any) => {
                const iconMap: Record<string, { color: string; bg: string; icon: string }> = {
                  clock_in: { color: "text-emerald-800", bg: "bg-emerald-50 border-emerald-200", icon: "⏱" },
                  clock_out: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: "⏹" },
                  break_start: { color: "text-amber-800", bg: "bg-amber-50 border-amber-200", icon: "☕" },
                  break_end: { color: "text-emerald-800", bg: "bg-emerald-50 border-emerald-200", icon: "✅" },
                  approved: { color: "text-emerald-800", bg: "bg-emerald-50 border-emerald-200", icon: "✓" },
                  marked_late: { color: "text-orange-800", bg: "bg-orange-50 border-orange-200", icon: "⏰" },
                  marked_absent: { color: "text-red-800", bg: "bg-red-50 border-red-200", icon: "✗" },
                  planned_absence: { color: "text-indigo-800", bg: "bg-indigo-50 border-indigo-200", icon: "📅" },
                  order_completed: { color: "text-emerald-800", bg: "bg-emerald-50 border-emerald-200", icon: "📦" },
                  order_cancelled: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: "🚫" },
                  order_voided: { color: "text-red-800", bg: "bg-red-50 border-red-200", icon: "🗑" }};
                const cfg = iconMap[a.action] || { color: "text-[#2A1810]/70", bg: "bg-[#2A1810]/5 border-[#EBE3D7]", icon: "•" };
                const timeAgo = (() => {
                  const diff = (Date.now() - new Date(a.created_at).getTime()) / 1000;
                  if (diff < 60) return "just now";
                  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                  return `${Math.floor(diff / 86400)}d ago`;
                })();
                return (
                  <div key={a.id} className="flex items-start gap-3.5 bg-[#FFFDF9] border border-[#EBE3D7] rounded-2xl px-4 py-3.5 hover:shadow-xs transition-all">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 border ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#2A1810] font-paragraph leading-snug">{a.description}</p>
                      {a.performed_by_name && (
                        <p className="text-[10px] text-[#2A1810]/40 mt-0.5 font-bold uppercase">by {a.performed_by_name}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] text-[#2A1810]/50 font-mono font-bold">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      <p className="text-[9px] text-[#2A1810]/35 font-mono">{timeAgo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>)}

      </div>

      {/* Attendance History Modal */}
      {historyStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeAttendanceHistory}>
          <div
            className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_16px_48px_rgba(42,24,16,0.18)] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#FAF6F0] border-b border-[#EBE3D7] p-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {historyStaff.avatar ? (
                  <Image src={historyStaff.avatar} alt={historyStaff.name} width={44} height={44} className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border border-[#EBE3D7]" />
                ) : (
                  <div className="w-11 h-11 rounded-2xl bg-[#F5EFE6] border border-[#EBE3D7] flex items-center justify-center text-sm font-extrabold uppercase text-[#2A1810] flex-shrink-0">
                    {(historyStaff.name || historyStaff.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-[#2A1810] text-base uppercase tracking-tight truncate">{historyStaff.name}</h3>
                    {historyStaff.employee_id && (
                      <span className="px-2 py-0.5 rounded-md bg-[#2A1810]/5 border border-[#EBE3D7] text-[#2A1810]/60 text-[10px] font-mono font-extrabold">{historyStaff.employee_id}</span>
                    )}
                  </div>
                  <p className="text-[#2A1810]/50 text-xs font-paragraph truncate">{historyStaff.email}</p>
                  {historyStaff.shift_start && historyStaff.shift_end && (
                    <p className="text-[10px] text-[#2A1810]/40 font-mono mt-0.5">
                      Scheduled {new Date(`1970-01-01T${historyStaff.shift_start}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(`1970-01-01T${historyStaff.shift_end}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={closeAttendanceHistory} className="text-[#2A1810]/40 hover:text-[#2A1810] transition-colors p-1.5 rounded-full hover:bg-[#2A1810]/5 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="px-5 pt-4 flex gap-2 border-b border-[#EBE3D7] flex-shrink-0 bg-[#FAF6F0]/50">
              <button
                type="button"
                onClick={() => setHistoryTab("list")}
                className={`px-5 py-2 rounded-t-xl text-xs font-extrabold uppercase transition-all ${historyTab === "list" ? "bg-[#FFFDF9] text-[#2A1810] border-t border-x border-[#EBE3D7] shadow-xs" : "bg-transparent text-[#2A1810]/60 hover:text-[#2A1810]"}`}
              >
                Log List
              </button>
              <button
                type="button"
                onClick={() => {
                  setHistoryTab("calendar");
                  if (historyStaff) fetchMonthlyCalendar(historyStaff.email, calendarYear, calendarMonth);
                }}
                className={`px-5 py-2 rounded-t-xl text-xs font-extrabold uppercase transition-all ${historyTab === "calendar" ? "bg-[#FFFDF9] text-[#2A1810] border-t border-x border-[#EBE3D7] shadow-xs" : "bg-transparent text-[#2A1810]/60 hover:text-[#2A1810]"}`}
              >
                Calendar
              </button>
            </div>

            {historyTab === "list" && historyData?.summary && (
              <div className="px-5 py-4 border-b border-[#EBE3D7] grid grid-cols-3 sm:grid-cols-6 gap-2 flex-shrink-0 bg-[#FFFDF9]">
                {[
                  { key: "all", label: "All", count: historyData.summary.total_logs },
                  { key: "on_time", label: "On Time", count: historyData.summary.on_time },
                  { key: "late", label: "Late", count: historyData.summary.late },
                  { key: "absent", label: "Absent", count: historyData.summary.absent },
                  { key: "pending", label: "Pending", count: historyData.summary.pending },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      const mark = f.key as typeof historyMarkFilter;
                      setHistoryMarkFilter(mark);
                      if (historyStaff) fetchAttendanceHistory(historyStaff, 1, mark);
                    }}
                    className={`rounded-2xl px-2 py-2 text-center transition-all ${
                      historyMarkFilter === f.key
                        ? "bg-[#2A1810] text-[#FAEADE] shadow-sm"
                        : "bg-[#FAF6F0] text-[#2A1810]/70 hover:bg-[#F5EFE6] border border-[#EBE3D7]"
                    }`}
                  >
                    <p className="text-base font-black font-mono">{f.count}</p>
                    <p className="text-[9px] font-extrabold uppercase tracking-wide opacity-80">{f.label}</p>
                  </button>
                ))}
                <div className="rounded-2xl px-2 py-2 text-center bg-amber-50/80 border border-amber-200/60">
                  <p className="text-base font-black text-amber-900 font-mono">{historyData.summary.with_break}</p>
                  <p className="text-[9px] font-extrabold uppercase tracking-wide text-amber-800/70">With Break</p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0 p-5 bg-[#FFFDF9]">
              {historyTab === "calendar" ? (
                <MonthlyCalendarGrid
                  data={calendarData}
                  loading={calendarLoading}
                  selectedDay={selectedCalendarDay}
                  onSelectDay={setSelectedCalendarDay}
                  onPrevMonth={() => historyStaff && shiftCalendarMonth(-1, historyStaff.email)}
                  onNextMonth={() => historyStaff && shiftCalendarMonth(1, historyStaff.email)}
                />
              ) : historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin" />
                </div>
              ) : !historyData?.logs?.length ? (
                <div className="py-16 text-center">
                  <p className="text-4xl mb-2">📋</p>
                  <p className="font-extrabold uppercase text-xs text-[#2A1810]/40">No attendance records found</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#FAF6F0] z-10 border-b border-[#EBE3D7]">
                        <tr className="text-[11px] font-extrabold uppercase text-[#2A1810]/60">
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Clock In</th>
                          <th className="px-5 py-3">Break</th>
                          <th className="px-5 py-3">Clock Out</th>
                          <th className="px-5 py-3 text-right">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EBE3D7]/60 text-sm">
                        {historyData.logs.map((log) => {
                          const cfg = getHistoryMarkConfig(log);
                          return (
                            <tr key={log.id} className={`hover:bg-[#FAF6F0] transition-colors ${log.attendance_mark === "absent" ? "bg-red-50/30" : log.attendance_mark === "late" ? "bg-orange-50/20" : ""}`}>
                              <td className="px-5 py-3 text-xs font-mono text-[#2A1810]/70 font-bold">{formatHistoryDate(log.date)}</td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shadow-2xs ${cfg.color} ${cfg.bg}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                                  {cfg.label}
                                </span>
                                {log.minutes_late != null && log.minutes_late > 0 && (
                                  <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[9px] font-extrabold">+{log.minutes_late}m</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-xs font-mono text-[#2A1810]/70">{formatHistoryTime(log.clock_in)}</td>
                              <td className="px-5 py-3 text-xs font-mono text-[#2A1810]/70">
                                {log.break_start ? (
                                  <>
                                    {formatHistoryTime(log.break_start)}
                                    {log.break_end ? ` → ${formatHistoryTime(log.break_end)}` : " (ongoing)"}
                                    {log.break_duration && <span className="block text-[10px] text-[#2A1810]/40 font-paragraph mt-0.5">{log.break_duration} break</span>}
                                  </>
                                ) : "—"}
                              </td>
                              <td className="px-5 py-3 text-xs font-mono text-[#2A1810]/70">{log.clock_out ? formatHistoryTime(log.clock_out) : "—"}</td>
                              <td className="px-5 py-3 text-right text-xs font-mono font-black text-[#2A1810]">{log.duration || (log.status === "pending" ? "Pending" : "Active")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden divide-y divide-[#EBE3D7]/60">
                    {historyData.logs.map((log) => {
                      const cfg = getHistoryMarkConfig(log);
                      return (
                        <div key={log.id} className={`p-4 ${log.attendance_mark === "absent" ? "bg-red-50/30" : ""}`}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-xs font-mono font-bold text-[#2A1810]/70">{formatHistoryDate(log.date)}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-[#2A1810]/60 font-mono">
                            <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">In</span>{formatHistoryTime(log.clock_in)}</div>
                            <div><span className="block text-[#2A1810]/40 uppercase font-extrabold">Out</span>{log.clock_out ? formatHistoryTime(log.clock_out) : "—"}</div>
                            <div className="col-span-2"><span className="block text-[#2A1810]/40 uppercase font-extrabold">Break</span>{log.break_start ? `${formatHistoryTime(log.break_start)}${log.break_end ? ` → ${formatHistoryTime(log.break_end)}` : ""}${log.break_duration ? ` (${log.break_duration})` : ""}` : "—"}</div>
                          </div>
                          {log.minutes_late != null && log.minutes_late > 0 && (
                            <p className="text-[10px] text-orange-700 font-extrabold mt-2">+{log.minutes_late} minutes late</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {historyTab === "list" && historyData?.pagination && historyData.pagination.total_pages > 1 && (
              <div className="border-t border-[#EBE3D7] px-5 py-4 flex items-center justify-between flex-shrink-0 bg-[#FAF6F0]">
                <p className="text-xs text-[#2A1810]/50 font-paragraph">
                  Page {historyData.pagination.page} of {historyData.pagination.total_pages} · {historyData.pagination.total} records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!historyData.pagination.has_prev || historyLoading}
                    onClick={() => historyStaff && fetchAttendanceHistory(historyStaff, historyPage - 1, historyMarkFilter)}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase bg-white border border-[#EBE3D7] text-[#2A1810] disabled:opacity-40 shadow-2xs"
                  >
                    Prev
                  </button>
                  <button
                    disabled={!historyData.pagination.has_next || historyLoading}
                    onClick={() => historyStaff && fetchAttendanceHistory(historyStaff, historyPage + 1, historyMarkFilter)}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase bg-[#2A1810] text-[#FAEADE] disabled:opacity-40 shadow-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_16px_48px_rgba(42,24,16,0.18)] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-[#FAF6F0] border-b border-[#EBE3D7] p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {editingStaff.avatar ? (
                  <Image src={editingStaff.avatar} alt={editingStaff.name || editingStaff.email} width={40} height={40} className="w-10 h-10 rounded-xl object-cover border border-[#EBE3D7]" />
                ) : (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold uppercase border border-[#EBE3D7] ${
                    editingStaff.role === "admin" ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#F5EFE6] text-[#2A1810]"
                  }`}>
                    {(editingStaff.name || editingStaff.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-[#2A1810] text-sm uppercase tracking-wider">Edit Staff Profile</h3>
                    {editingStaff.employee_id && (
                      <span className="px-2 py-0.5 rounded-md bg-[#2A1810]/5 border border-[#EBE3D7] text-[#2A1810]/60 text-[10px] font-mono font-extrabold tracking-wider">{editingStaff.employee_id}</span>
                    )}
                  </div>
                  <p className="text-[#2A1810]/50 text-xs font-paragraph">{editingStaff.email}</p>
                </div>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-[#2A1810]/40 hover:text-[#2A1810] transition-colors p-1.5 rounded-full hover:bg-[#2A1810]/5">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-[#FFFDF9]">
              {/* Avatar Upload */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Profile Photo</label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    {avatarPreview ? (
                      <Image src={avatarPreview} alt="Avatar preview" width={56} height={56} className="w-14 h-14 rounded-2xl object-cover border border-[#EBE3D7]" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold uppercase bg-[#F5EFE6] text-[#2A1810] border border-[#EBE3D7]">
                        {(staffForm.name || editingStaff.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 15 * 1024 * 1024) {
                            showToast("Image must be 15MB or smaller", "error");
                            return;
                          }
                          setAvatarFile(file);
                          setAvatarPreview(URL.createObjectURL(file));
                        }
                      }} />
                    </label>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#2A1810]/50 text-xs font-paragraph">Click the avatar to upload a photo</p>
                    {avatarFile && (
                      <button
                        onClick={() => { setAvatarFile(null); setAvatarPreview(editingStaff.avatar || null); }}
                        className="mt-1 text-[10px] font-extrabold uppercase text-red-600 hover:text-red-800 transition-colors"
                      >
                        Remove new photo
                      </button>
                    )}
                    {editingStaff.avatar && !avatarFile && (
                      <button
                        onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                        className="mt-1 text-[10px] font-extrabold uppercase text-red-600 hover:text-red-800 transition-colors"
                      >
                        Remove current photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-4 py-2.5 text-[#2A1810] font-paragraph text-sm focus:outline-none focus:border-[#A26833] shadow-2xs"
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input
                  type="text"
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                  className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-4 py-2.5 text-[#2A1810] font-paragraph text-sm focus:outline-none focus:border-[#A26833] font-mono shadow-2xs"
                  placeholder="e.g. 0917-123-4567"
                />
              </div>

              {/* Position */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Staff Station Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {STAFF_POSITIONS.map((pos) => (
                    <button
                      key={pos.key}
                      onClick={() => setStaffForm({ ...staffForm, position: pos.key })}
                      className={`py-2 rounded-xl text-xs font-extrabold uppercase transition-all border flex flex-col items-center gap-1 shadow-2xs ${
                        staffForm.position === pos.key
                          ? `${pos.badge} ${pos.badgeText} border-current shadow-xs`
                          : "bg-white border-[#EBE3D7] text-[#2A1810]/60 hover:border-[#A26833]/40"
                      }`}
                    >
                      <span className="text-base">{pos.icon}</span>
                      <span>{pos.label}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setStaffForm({ ...staffForm, position: "" })}
                    className={`py-2 rounded-xl text-xs font-extrabold uppercase transition-all border flex flex-col items-center gap-1 shadow-2xs ${
                      staffForm.position === ""
                        ? "bg-gray-100 text-gray-700 border-gray-300"
                        : "bg-white border-[#EBE3D7] text-[#2A1810]/50 hover:border-[#A26833]/40"
                    }`}
                  >
                    <span className="text-base">—</span>
                    <span>None</span>
                  </button>
                </div>
              </div>

              {/* Shift Start Time */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Shift Schedule</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-[#2A1810]/40 mb-1 font-extrabold uppercase">Start</p>
                    <input
                      type="time"
                      value={staffForm.shift_start || ""}
                      onChange={(e) => setStaffForm({ ...staffForm, shift_start: e.target.value })}
                      className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2 text-[#2A1810] font-mono text-sm shadow-2xs"
                    />
                  </div>
                  <span className="text-[#2A1810]/30 mt-4">→</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-[#2A1810]/40 mb-1 font-extrabold uppercase">End</p>
                    <input
                      type="time"
                      value={staffForm.shift_end || ""}
                      onChange={(e) => setStaffForm({ ...staffForm, shift_end: e.target.value })}
                      className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2 text-[#2A1810] font-mono text-sm shadow-2xs"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-[#2A1810]/40 mt-1">Default: 7:30 AM – 8:30 PM · Used for late arrival & overtime tracking</p>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Bio / Notes</label>
                <textarea
                  value={staffForm.bio}
                  onChange={(e) => setStaffForm({ ...staffForm, bio: e.target.value })}
                  rows={2}
                  className="w-full bg-[#FAF6F0] border border-[#EBE3D7] rounded-xl px-3 py-2 text-[#2A1810] font-paragraph text-sm resize-none shadow-2xs"
                  placeholder="Short bio or notes about this staff member..."
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Access Role</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStaffForm({ ...staffForm, role: "staff" })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold uppercase transition-all border ${
                      staffForm.role === "staff"
                        ? "bg-[#E3A458]/15 border-[#E3A458] text-[#A26833] shadow-xs"
                        : "bg-white border-[#EBE3D7] text-[#2A1810]/50 hover:border-[#A26833]/30"
                    }`}
                  >
                    Staff
                  </button>
                  <button
                    onClick={() => setStaffForm({ ...staffForm, role: "admin" })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold uppercase transition-all border ${
                      staffForm.role === "admin"
                        ? "bg-[#2A1810] border-[#2A1810] text-[#FAEADE] shadow-xs"
                        : "bg-white border-[#EBE3D7] text-[#2A1810]/50 hover:border-[#A26833]/30"
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {/* Active Toggle */}
              <div>
                <label className="block text-[10px] font-extrabold text-[#2A1810]/60 uppercase tracking-wider mb-1.5">Account Status</label>
                <button
                  onClick={() => editingStaff.email !== user?.email && setStaffForm({ ...staffForm, is_active: !staffForm.is_active })}
                  disabled={editingStaff.email === user?.email}
                  className={`w-full flex items-center justify-between py-2.5 px-4 rounded-xl border transition-all ${
                    editingStaff.email === user?.email
                      ? "bg-gray-50 border-gray-200 cursor-not-allowed opacity-60"
                      : staffForm.is_active
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-red-50 border-red-200"
                  }`}
                >
                  <span className={`flex items-center gap-2 text-xs font-extrabold uppercase ${editingStaff.email === user?.email ? "text-gray-400" : staffForm.is_active ? "text-emerald-800" : "text-red-700"}`}>
                    <span className={`w-2 h-2 rounded-full ${editingStaff.email === user?.email ? "bg-gray-300" : staffForm.is_active ? "bg-emerald-500" : "bg-red-400"}`}></span>
                    {staffForm.is_active ? "Can Log In" : "Cannot Log In"}
                  </span>
                  <div className={`w-9 h-5 rounded-full transition-colors ${editingStaff.email === user?.email ? "bg-gray-300" : staffForm.is_active ? "bg-emerald-500" : "bg-red-300"} relative`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${staffForm.is_active ? "left-4.5" : "left-0.5"}`}></div>
                  </div>
                </button>
              </div>

              {/* Joined date (read-only) */}
              <div className="bg-[#FAF6F0] rounded-xl p-3 flex items-center gap-2 border border-[#EBE3D7]">
                <span className="text-[#2A1810]/50 text-xs font-paragraph">Joined {new Date(editingStaff.date_joined).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-[#EBE3D7] flex gap-3 bg-[#FAF6F0]">
              <button
                onClick={() => setEditingStaff(null)}
                className="flex-1 bg-white border border-[#EBE3D7] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold uppercase py-2.5 rounded-xl transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                onClick={saveStaff}
                className="flex-1 bg-[#2A1810] hover:bg-[#2A1810]/90 text-[#FAEADE] font-extrabold uppercase py-2.5 rounded-xl transition-colors shadow-sm text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Reason Modal */}
      {voidModalOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_16px_48px_rgba(42,24,16,0.18)] p-6 md:p-8 w-full max-w-md">
            <h3 className="text-xl font-black text-[#2A1810] uppercase tracking-tight mb-2">Void Order</h3>
            <p className="font-paragraph text-[#2A1810]/60 text-sm mb-4">Provide a reason for voiding order <strong className="font-mono text-[#2A1810]">{voidModalOrderId}</strong>. Inventory will be automatically restored.</p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Enter void reason (required)"
              rows={3}
              className="w-full bg-[#FAF6F0] border border-[#EBE3D7] text-[#2A1810] font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:border-red-400 resize-none placeholder:text-[#2A1810]/30 shadow-2xs text-sm"
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setVoidModalOrderId(null); setVoidReason(""); }}
                className="flex-1 bg-white border border-[#EBE3D7] hover:bg-[#F5EFE6] text-[#2A1810] font-extrabold uppercase py-2.5 rounded-xl transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => voidOrder(voidModalOrderId, voidReason)}
                disabled={!voidReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-extrabold uppercase py-2.5 rounded-xl transition-colors shadow-xs text-xs"
              >
                Void Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Reason Modal */}
      {viewReasonData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_16px_48px_rgba(42,24,16,0.18)] w-full max-w-md overflow-hidden">
            <div className="bg-red-50 border-b border-red-100 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-red-950 text-sm uppercase tracking-wider">Cancellation Reason</h3>
                  <p className="text-red-800/60 text-xs font-mono">{viewReasonData.orderId}</p>
                </div>
              </div>
              <button onClick={() => setViewReasonData(null)} className="text-red-900/40 hover:text-red-950 transition-colors p-1.5 rounded-full hover:bg-red-100/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="font-paragraph text-[#2A1810] text-sm leading-relaxed break-words whitespace-pre-wrap">{viewReasonData.reason.replace(/^\[User Cancelled\]\s*/i, '')}</p>
            </div>
            <div className="p-4 border-t border-[#EBE3D7] flex justify-end bg-[#FAF6F0]">
              <button
                onClick={() => setViewReasonData(null)}
                className="px-5 py-2 rounded-full font-extrabold text-xs uppercase tracking-wider text-[#2A1810] bg-white border border-[#EBE3D7] hover:bg-[#F5EFE6] transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <div 
        className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] transition-all duration-300 pointer-events-none ${
          toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {toast && (
          <div className="bg-[#2A1810] text-[#FAEADE] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-[#E3A458]/30 backdrop-blur-md">
            <div className={`${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} rounded-full p-1`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                {toast.type === 'success' ? (
                  <polyline points="20 6 9 17 4 12"></polyline>
                ) : (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </>
                )}
              </svg>
            </div>
            <p className="font-extrabold uppercase text-xs tracking-widest">{toast.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
