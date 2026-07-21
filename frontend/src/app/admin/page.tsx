"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authHeaders } from "@/lib/authHeaders";
import { useLanguage } from "@/context/LanguageContext";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
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
  within_grace: { label: "Grace Period", color: "text-yellow-700", bg: "bg-yellow-50", dot: "bg-yellow-500" },
};

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
  future: { cell: "bg-white border-dark-brown/10 text-dark-brown/25", text: "text-dark-brown/30", label: "Future" },
};

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
  onNextMonth,
}: {
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
  const { isLoggedIn, isAuthLoading, isAdmin, isStaff, user, logout } = useAuth();
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
  const [shiftFormEnd, setShiftFormEnd] = useState("17:00");
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
          clipPath: "inset(0% 0% 100% 0%)",
        });
        gsap.set(items, { autoAlpha: 0, y: -14, scale: 0.96 });

        menuTlRef.current = gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .to(menu, {
            autoAlpha: 1,
            y: 0,
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 0.42,
          })
          .to(
            items,
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.38,
              stagger: { each: 0.07, from: "start" },
              ease: "power2.out",
            },
            "-=0.22"
          );
      } else {
        menuTlRef.current = gsap
          .timeline({
            defaults: { ease: "power2.in" },
            onComplete: () => setShowMobileMenu(false),
          })
          .to(items, {
            autoAlpha: 0,
            y: -10,
            scale: 0.97,
            duration: 0.18,
            stagger: { each: 0.04, from: "end" },
          })
          .to(
            menu,
            {
              autoAlpha: 0,
              y: -14,
              clipPath: "inset(0% 0% 100% 0%)",
              duration: 0.28,
            },
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
        const url = `${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}`;
        const res = await fetch(url, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          mapped = data.map((d: any) => ({
            id: `ORD-${d.id.toString().padStart(4, "0")}`,
            items: d.items.map((i: any) => ({
              name: i.name,
              price: Number(i.price),
              qty: i.quantity,
              notes: i.notes,
            })),
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
            paymentStatus: d.payment_status || "unpaid",
          }));
        }
      } catch (backendErr) {
        // ignore backend failure
      }

      const allOrders = [...mapped, ...localOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(allOrders);

      // Auto-cancel overdue scheduled orders (fire-and-forget)
      fetch(`${API_BASE_URL}/api/auth/admin/cancel-overdue-scheduled/`, { method: "POST", headers: authHeaders() }).catch(() => {});
    } catch (err) {
      setOrders([]);
    }
  }, [user?.email]);

  useStaffOrdersRealtime(mounted && isLoggedIn && isAdmin && !!user?.email, fetchOrders);

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
        },
      }
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
      
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/status/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email, status }),
      });

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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/payment/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email, payment_status: "paid" }),
      });

      if (!res.ok) throw new Error("Failed to mark payment");

      const data = await res.json();
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                paymentStatus: (data.payment_status as Order["paymentStatus"]) || "paid",
                paymentMethod: data.payment_method || o.paymentMethod || "cash",
              }
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

      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/void/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email, void_reason: reason.trim() }),
      });

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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${numericId}/archive/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email, archive }),
      });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/auto-archive/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email }),
      });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/staff/?admin_email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
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
        days: String(feedbackDays),
      });
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/staff-feedback/?${params}`, { headers: authHeaders() });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/orders/${orderId}/served-by/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          admin_email: user.email,
          staff_email: staffEmail,
        }),
      });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/today-attendance/?admin_email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
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
      const res = await fetch(
          `${API_BASE_URL}/api/auth/admin/payroll-summary/?admin_email=${encodeURIComponent(user.email)}&multiplier=${mult}`,
          { headers: authHeaders() }
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/activity-feed/?hours=24`, { headers: authHeaders() });
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
        limit: "25",
      });
      if (mark !== "all") params.set("mark", mark);
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/staff-attendance-history/?${params}`, { headers: authHeaders() });
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
      date_joined: "",
    };
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
        month: String(month),
      });
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/monthly-attendance/?${params}`, { headers: authHeaders() });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/absence-requests/?admin_email=${encodeURIComponent(user.email)}&status=approved`, { headers: authHeaders() });
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
        week_start: shiftWeekStart,
      });
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/?${params}`, { headers: authHeaders() });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          admin_email: user.email,
          staff_email: shiftFormStaff,
          shift_date: shiftFormDate,
          start_time: shiftFormStart,
          end_time: shiftFormEnd,
          station: shiftFormStation,
        }),
      });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/${id}/?admin_email=${encodeURIComponent(user.email)}`, {
        method: "DELETE",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email }),
      });
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
        week_start: shiftWeekStart,
      });
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift-assignments/export/?${params}`, { headers: authHeaders() });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/absence-requests/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          email: user.email,
          staff_email: absenceFormStaff,
          absence_date: absenceFormDate,
          reason: absenceFormReason.trim(),
        }),
      });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/absence-requests/${id}/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: user.email }),
      });
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
        res = await fetch(`${API_BASE_URL}/api/auth/admin/staff/${editingStaff.id}/`, {
          method: "PATCH",
          headers: authHeaders(),
          body: formData,
        });
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
        res = await fetch(`${API_BASE_URL}/api/auth/admin/staff/${editingStaff.id}/`, {
          method: "PATCH",
          headers: authHeaders(),
          body: formData,
        });
      } else {
        res = await fetch(`${API_BASE_URL}/api/auth/admin/staff/${editingStaff.id}/`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ admin_email: user.email, name: staffForm.name, role: staffForm.role, phone: staffForm.phone, position: staffForm.position, shift_start: staffForm.shift_start || null, shift_end: staffForm.shift_end || null, bio: staffForm.bio, is_active: staffForm.is_active }),
        });
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
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/staff/${id}/`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ admin_email: user.email, position }),
      });
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
      <div className="admin-header sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <h1 className="admin-nav-item text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 justify-end relative">
            <div className="admin-nav-item">
              <NotificationBell userEmail={user?.email} />
            </div>
            <button
              onClick={toggleLanguage}
              className="admin-nav-item bg-light-brown/20 hover:bg-light-brown/40 text-dark-brown font-bold text-xs md:text-sm rounded-full py-1.5 px-3 md:py-2 md:px-4 transition-all uppercase"
            >
              {language}
            </button>
            
            {/* Hamburger Button for Mobile */}
            <button
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              className="admin-nav-item xl:hidden p-2 text-dark-brown hover:bg-dark-brown/10 rounded-full transition-colors"
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
            <div className="hidden xl:flex items-center gap-4">
              <Link
                href="/profile"
                className="admin-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>{t("Profile") || "Profile"}</span>
              </Link>
              <Link
                href="/admin-dashboard"
                className="admin-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                <span>Analytics</span>
              </Link>
              <Link
                href="/admin-menu"
                className="admin-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <span>Menu</span>
              </Link>
              <Link
                href="/admin-sales"
                className="admin-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>{t("Sales")}</span>
              </Link>
              <Link
                href="/admin-tables"
                className="admin-nav-item group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                <span>Tables</span>
              </Link>
              <button
                onClick={() => { void performLogout(signOut); }}
                className="admin-nav-item group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <span>{t("Logout")}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
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

      <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 relative z-10">
        {/* Welcome */}
        <div className="admin-stagger-item mb-8 md:mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-dark-brown uppercase tracking-tighter">{t("Hello,")} {user?.name}</h2>
          <p className="font-paragraph text-dark-brown/60 mt-1">{t("Manage orders and monitor store performance.")}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-10">
          <div className="admin-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-sm mb-1">{t("Total Orders")}</p>
            <p className="text-3xl md:text-4xl font-bold text-dark-brown">{totalOrders}</p>
          </div>
          <div className="admin-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-sm mb-1">{t("Sales")}</p>
            <p className="text-2xl md:text-3xl font-bold text-dark-brown">₱{totalRevenue.toFixed(0)}</p>
          </div>
          <div className="admin-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-sm mb-1">{t("Pending")}</p>
            <p className="text-3xl md:text-4xl font-bold text-dark-brown">{pendingOrders}</p>
          </div>
          <div className="admin-stagger-item app-panel border rounded-3xl p-5 md:p-6 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-sm mb-1">{t("Customer")}</p>
            <p className="text-3xl md:text-4xl font-bold text-dark-brown">{totalUsers}</p>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="admin-stagger-item flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setAdminSection("orders")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase transition-all shadow-sm ${
              adminSection === "orders"
                ? "bg-dark-brown text-milk shadow-md"
                : "bg-white/60 border border-white/60 text-dark-brown/70 hover:bg-white hover:text-dark-brown"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Orders
          </button>
          <button
            onClick={() => setAdminSection("staff")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase transition-all shadow-sm ${
              adminSection === "staff"
                ? "bg-dark-brown text-milk shadow-md"
                : "bg-white/60 border border-white/60 text-dark-brown/70 hover:bg-white hover:text-dark-brown"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Staff Accounts
          </button>
          <button
            onClick={() => setAdminSection("roles")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase transition-all shadow-sm ${
              adminSection === "roles"
                ? "bg-dark-brown text-milk shadow-md"
                : "bg-white/60 border border-white/60 text-dark-brown/70 hover:bg-white hover:text-dark-brown"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Staff Roles
          </button>
          <button
            onClick={() => setAdminSection("contacts")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase transition-all shadow-sm ${
              adminSection === "contacts"
                ? "bg-dark-brown text-milk shadow-md"
                : "bg-white/60 border border-white/60 text-dark-brown/70 hover:bg-white hover:text-dark-brown"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Contacts
          </button>
          <button
            onClick={() => setAdminSection("attendance")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase transition-all shadow-sm ${
              adminSection === "attendance"
                ? "bg-dark-brown text-milk shadow-md"
                : "bg-white/60 border border-white/60 text-dark-brown/70 hover:bg-white hover:text-dark-brown"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Attendance
          </button>
          <button
            onClick={() => setAdminSection("activity")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase transition-all shadow-sm ${
              adminSection === "activity"
                ? "bg-dark-brown text-milk shadow-md"
                : "bg-white/60 border border-white/60 text-dark-brown/70 hover:bg-white hover:text-dark-brown"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Activity Feed
          </button>
        </div>

        {adminSection === "orders" && (<>
        {/* Filters */}
        <div className="admin-stagger-item flex flex-wrap items-center gap-2 mb-6">
          {/* Active / Archived Tabs */}
          <div className="flex flex-wrap gap-1 bg-white/60 border border-white/60 rounded-xl md:rounded-full p-1 mr-3">
            <button
              onClick={() => { setViewTab("active"); setFilter("all"); }}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                viewTab === "active"
                  ? "bg-dark-brown text-milk shadow-md"
                  : "text-dark-brown/70 hover:bg-white"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => { setViewTab("archived"); setFilter("all"); }}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                viewTab === "archived"
                  ? "bg-dark-brown text-milk shadow-md"
                  : "text-dark-brown/70 hover:bg-white"
              }`}
            >
              Archive <span className="ml-1 text-[10px] opacity-70">({archivedOrders.length})</span>
            </button>
          </div>

          {viewTab === "active" && (["all", "pending", "preparing", "ready", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                filter === f
                  ? "bg-dark-brown text-milk shadow-md"
                  : "bg-white/60 text-dark-brown/70 hover:bg-white border border-white/60"
              }`}
            >
              {f}
            </button>
          ))}

          {viewTab === "active" && (
            <button
              onClick={autoArchive}
              className="ml-auto flex items-center gap-1.5 bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown/60 hover:text-dark-brown font-bold text-[10px] uppercase rounded-full py-2 px-4 transition-all border border-dark-brown/10"
              title="Auto-archive completed/cancelled orders older than 30 days"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              Auto-Archive 30d
            </button>
          )}
        </div>

        {/* Orders Table */}
        <div className="admin-stagger-item app-panel border rounded-3xl shadow-lg overflow-hidden">
          <div className="p-5 md:p-6 border-b border-dark-brown/10 flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-bold text-dark-brown uppercase tracking-tight">{viewTab === "archived" ? "Archived Orders" : "Orders"}</h3>
            <span className="font-paragraph text-dark-brown/50 text-sm">{filteredOrders.length} result{filteredOrders.length !== 1 ? "s" : ""}</span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-10 md:p-16 text-center">
              <p className="text-5xl mb-4">📋</p>
              <p className="font-paragraph text-dark-brown/60 text-lg">No orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-dark-brown/5">
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">{t("Order ID")}</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60 hidden md:table-cell">{t("Customer")}</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">{t("Items")}</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">{t("Total")}</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60 hidden sm:table-cell">{t("Date")}</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">{t("Status")}</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase text-dark-brown/60">{t("Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOrders.map((order) => (
                    <tr key={order.id} className="paginated-order border-t border-dark-brown/10 hover:bg-dark-brown/5 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-dark-brown text-sm uppercase mb-1">{order.id}</p>
                        {order.orderType && (
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            order.orderType === "Dine-In" ? "bg-light-brown/30 text-dark-brown" 
                            : order.orderType === "Scheduled" ? "bg-blue-100 text-blue-800" 
                            : "bg-dark-brown/10 text-dark-brown"
                          }`}>
                            {order.orderType === "Dine-In" 
                              ? `Dine-In${order.tableNumber ? ` (T-${order.tableNumber})` : ""}` 
                              : order.orderType === "Scheduled" 
                                ? `Pre-Order${order.pickupTime ? ` @ ${(() => { try { const d = new Date(order.pickupTime); return isNaN(d.getTime()) ? order.pickupTime : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return order.pickupTime; } })()}` : ""}` 
                                : "Takeout"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="font-paragraph text-dark-brown text-sm">{order.userName}</p>
                        <p className="font-paragraph text-dark-brown/50 text-xs">{order.userEmail}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-paragraph text-dark-brown text-sm">{order.totalItems} item{order.totalItems > 1 ? "s" : ""}</p>
                        <div className="flex flex-col gap-1 mt-1">
                          {order.items.map((i, idx) => (
                            <div key={idx} className="group/item relative">
                              <p className="font-paragraph text-dark-brown/70 text-xs truncate max-w-[200px]">
                                <span className="font-bold text-light-brown">{i.qty}x</span> {i.name}
                              </p>
                              {i.notes && (
                                <p className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded italic font-bold w-fit mt-0.5">
                                  "{i.notes}"
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-dark-brown text-sm">₱{order.total.toFixed(2)}</p>
                        {order.paymentMethod ? (
                          <p className={`mt-1 text-[10px] font-bold uppercase ${
                            order.paymentStatus === "paid" ? "text-emerald-700" : "text-amber-700"
                          }`}>
                            {order.paymentMethod}
                            {order.paymentStatus === "paid" ? " · paid" : " · unpaid"}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] font-bold uppercase text-dark-brown/35">No payment yet</p>
                        )}
                        {!order.isArchived && order.status !== "cancelled" && order.paymentStatus !== "paid" && (
                          <button
                            type="button"
                            onClick={() => markOrderPaid(order.id)}
                            className="mt-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase rounded-lg px-2 py-1 transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell">
                        <p className="font-paragraph text-dark-brown/60 text-xs">{new Date(order.date).toLocaleDateString()}</p>
                        <p className="font-paragraph text-dark-brown/40 text-xs">{new Date(order.date).toLocaleTimeString()}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ${
                            order.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : order.status === "ready"
                              ? "bg-blue-100 text-blue-700"
                              : order.status === "preparing"
                              ? "bg-yellow-100 text-yellow-700"
                              : order.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {order.status}
                        </span>
                        {order.rating != null && (
                          <div className="mt-1.5">
                            {renderStarRating(order.rating, 10)}
                            {order.servedByName && (
                              <p className="text-[9px] text-dark-brown/45 font-paragraph mt-0.5">Served by {order.servedByName}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {!order.isArchived && (
                            <select
                              value={order.status}
                              onChange={(e) => updateStatus(order.id, e.target.value as Order["status"])}
                              className="bg-white/60 border border-white/40 text-dark-brown font-paragraph text-xs rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-light-brown cursor-pointer"
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
                              className="bg-red-100 hover:bg-red-200 text-red-700 font-bold text-[10px] uppercase rounded-lg px-2 py-1 transition-colors"
                              title="Void this order"
                            >
                              Void
                            </button>
                          )}
                          <button
                            onClick={() => archiveOrder(order.id, !order.isArchived)}
                            className={`font-bold text-[10px] uppercase rounded-lg px-2 py-1 transition-colors ${
                              order.isArchived
                                ? "bg-green-100 hover:bg-green-200 text-green-700"
                                : "bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown/60 hover:text-dark-brown"
                            }`}
                            title={order.isArchived ? "Unarchive order" : "Archive order"}
                          >
                            {order.isArchived ? "↩ Unarchive" : "📦 Archive"}
                          </button>
                        </div>
                        {order.voidReason && (
                          <button
                            onClick={() => setViewReasonData({ orderId: order.id, reason: order.voidReason! })}
                            className="flex items-center gap-1 text-[10px] text-red-600 mt-1 italic font-bold hover:text-red-800 hover:underline transition-colors cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            View Reason
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
            <div className="p-5 md:p-6 border-t border-dark-brown/10 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="bg-dark-brown/10 disabled:opacity-50 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md"
              >
                Prev
              </button>
              <span className="text-dark-brown font-bold text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="bg-dark-brown/10 disabled:opacity-50 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md"
              >
                Next
              </button>
            </div>
          )}
        </div>
        </>)}

        {adminSection === "staff" && (<>
        {/* Staff Management Section */}
        <div className="admin-stagger-item mt-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Staff Accounts</h3>
            <p className="font-paragraph text-dark-brown/50 text-sm mt-1">{staffUsers.length} staff member{staffUsers.length !== 1 ? "s" : ""} · click a card to view attendance history</p>
          </div>
        </div>

        {staffUsers.length === 0 ? (
          <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-paragraph text-dark-brown/50">No staff accounts found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffUsers.map((s) => (
              <div
                key={s.id}
                onClick={() => openAttendanceHistory(s)}
                className="app-panel border rounded-3xl p-5 shadow-lg hover:shadow-xl transition-all group hover:-translate-y-1 cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  {s.avatar ? (
                    <Image src={s.avatar} alt={s.name || s.email} width={48} height={48} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg font-bold uppercase ${
                      s.role === "admin" ? "bg-dark-brown text-milk" : "bg-light-brown/20 text-dark-brown"
                    }`}>
                      {(s.name || s.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-dark-brown text-sm uppercase truncate">{s.name || s.email.split("@")[0]}</p>
                      {s.employee_id && (
                        <span className="px-2 py-0.5 rounded-md bg-dark-brown/8 text-dark-brown/50 text-[10px] font-mono font-bold tracking-wider">{s.employee_id}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        s.role === "admin" ? "bg-dark-brown/10 text-dark-brown" : "bg-light-brown/20 text-dark-brown/70"
                      }`}>
                        {s.role}
                      </span>
                    </div>
                    <p className="font-paragraph text-dark-brown/50 text-xs truncate mt-0.5">{s.email}</p>
                    {s.position && (() => {
                      const pos = STAFF_POSITIONS.find(p => p.key === s.position);
                      return pos ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase mt-1.5 ${pos.badge} ${pos.badgeText}`}>
                          <span>{pos.icon}</span>
                          {pos.label}
                        </span>
                      ) : null;
                    })()}
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`flex items-center gap-1 text-[10px] font-bold uppercase ${
                        s.is_active ? "text-green-600" : "text-red-500"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-green-500" : "bg-red-400"}`}></span>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                      {s.is_email_verified && (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-blue-600">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          Verified
                        </span>
                      )}
                      {s.phone && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-dark-brown/40">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          {s.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-dark-brown/5">
                  <button
                    onClick={(e) => { e.stopPropagation(); openAttendanceHistory(s); }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-light-brown/15 hover:bg-light-brown/30 text-dark-brown font-bold text-[10px] uppercase rounded-xl py-2 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    History
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditStaff(s); }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown/70 hover:text-dark-brown font-bold text-[10px] uppercase rounded-xl py-2 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    Edit Profile
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
              <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Customer Feedback by Staff</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-1">
                Tag which staff served rated orders — aggregated per staff member
              </p>
            </div>
            <div className="flex gap-2">
              {([30, 90, 180] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFeedbackDays(d)}
                  className={`px-3 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                    feedbackDays === d ? "bg-dark-brown text-milk shadow-md" : "bg-white/60 text-dark-brown/70 hover:bg-white border border-white/60"
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          {feedbackLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
            </div>
          ) : !feedbackData ? (
            <p className="font-paragraph text-dark-brown/45 text-sm">Unable to load feedback data.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl bg-yellow-50/80 border border-yellow-200/60 p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-800">{feedbackData.summary.overall_avg_label}</p>
                  <p className="text-[10px] font-bold uppercase text-yellow-700/70 mt-0.5">Overall Avg</p>
                </div>
                <div className="rounded-2xl bg-dark-brown/5 border border-dark-brown/10 p-4 text-center">
                  <p className="text-2xl font-bold text-dark-brown tabular-nums">{feedbackData.summary.total_ratings}</p>
                  <p className="text-[10px] font-bold uppercase text-dark-brown/50 mt-0.5">Total Reviews</p>
                </div>
                <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200/60 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-800 tabular-nums">{feedbackData.summary.tagged_ratings}</p>
                  <p className="text-[10px] font-bold uppercase text-emerald-700/70 mt-0.5">Tagged</p>
                </div>
                <div className="rounded-2xl bg-indigo-50/80 border border-indigo-200/60 p-4 text-center">
                  <p className="text-2xl font-bold text-indigo-800 tabular-nums">{feedbackData.summary.untagged_ratings}</p>
                  <p className="text-[10px] font-bold uppercase text-indigo-700/70 mt-0.5">Needs Tagging</p>
                </div>
              </div>

              {feedbackData.staff.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  {feedbackData.staff.map((s: any) => (
                    <div key={s.user_id} className="app-panel border rounded-3xl p-5 shadow-lg">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-bold text-dark-brown uppercase">{s.name}</p>
                          <p className="text-[10px] text-dark-brown/45 font-mono">{s.employee_id || s.email}</p>
                          <p className="text-[10px] text-dark-brown/50 uppercase font-bold mt-1">{s.position_display}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-yellow-700">{s.avg_rating_label}</p>
                          <p className="text-[10px] font-bold uppercase text-dark-brown/45">{s.review_count} review{s.review_count !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[9px] font-bold uppercase">
                        <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">5★ {s.five_star}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">4★ {s.four_star}</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800">3★ {s.three_star}</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">≤2★ {s.two_star + s.one_star}</span>
                      </div>
                      {s.recent_reviews?.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-dark-brown/8 pt-3">
                          {s.recent_reviews.slice(0, 2).map((r: any) => (
                            <div key={`${s.user_id}-${r.order_id}`} className="text-xs">
                              <div className="flex items-center gap-2">
                                {renderStarRating(r.rating, 10)}
                                <span className="font-bold text-dark-brown/60">{r.order_label}</span>
                              </div>
                              {r.comment && <p className="text-dark-brown/55 font-paragraph mt-0.5 line-clamp-2">&ldquo;{r.comment}&rdquo;</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="app-panel border rounded-3xl p-6 shadow-lg">
                <p className="text-[10px] font-bold uppercase text-dark-brown/50 mb-4">Tag Staff on Customer Reviews</p>
                {feedbackData.untagged_reviews.length === 0 && feedbackData.summary.total_ratings === 0 ? (
                  <p className="font-paragraph text-dark-brown/45 text-sm">No customer reviews yet. Ratings appear after customers rate completed orders.</p>
                ) : feedbackData.untagged_reviews.length === 0 ? (
                  <p className="font-paragraph text-dark-brown/45 text-sm">All reviews in this period are tagged to staff.</p>
                ) : (
                  <div className="space-y-3">
                    {feedbackData.untagged_reviews.map((review: any) => (
                      <div key={review.order_id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-white/50 border border-dark-brown/8">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-dark-brown uppercase text-xs">{review.order_label}</span>
                            {renderStarRating(review.rating, 12)}
                            <span className="text-[10px] text-dark-brown/45 font-paragraph">{review.customer_name}</span>
                          </div>
                          {review.rating_comment && (
                            <p className="text-sm text-dark-brown/70 font-paragraph mt-1">&ldquo;{review.rating_comment}&rdquo;</p>
                          )}
                          <p className="text-[10px] text-dark-brown/40 mt-1">
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
                          className="bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2 text-xs font-bold text-dark-brown min-w-[180px]"
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
        <div className="admin-stagger-item mt-10">
        <div className="mb-6">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Staff Role Assignment</h3>
          <p className="font-paragraph text-dark-brown/50 text-sm mt-1">Assign a role to each staff member — roles appear as colored badges</p>
        </div>

        {staffUsers.length === 0 ? (
          <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-paragraph text-dark-brown/50">No staff accounts to assign roles</p>
          </div>
        ) : (
          <div className="app-panel border rounded-3xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="hidden md:grid grid-cols-[1fr_1fr_1fr] gap-4 px-6 py-3 bg-dark-brown/5 border-b border-dark-brown/10 text-[10px] font-bold text-dark-brown/50 uppercase tracking-wider">
              <span>Staff</span>
              <span>Current Role</span>
              <span>Assign Role</span>
            </div>
            {/* Rows */}
            {staffUsers.map((s) => {
              const currentPos = STAFF_POSITIONS.find(p => p.key === s.position);
              return (
                <div key={s.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-3 md:gap-4 px-6 py-4 border-b border-dark-brown/5 last:border-b-0 items-center hover:bg-dark-brown/[0.02] transition-colors">
                  {/* Staff info */}
                  <div className="flex items-center gap-3">
                    {s.avatar ? (
                      <Image src={s.avatar} alt={s.name || s.email} width={36} height={36} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold uppercase ${
                        s.role === "admin" ? "bg-dark-brown text-milk" : "bg-light-brown/20 text-dark-brown"
                      }`}>
                        {(s.name || s.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openAttendanceHistory(s)} className="font-bold text-dark-brown text-xs uppercase truncate hover:underline text-left">
                          {s.name || s.email.split("@")[0]}
                        </button>
                        {s.employee_id && (
                          <span className="px-1.5 py-0.5 rounded bg-dark-brown/8 text-dark-brown/40 text-[9px] font-mono font-bold tracking-wider flex-shrink-0">{s.employee_id}</span>
                        )}
                      </div>
                      <p className="font-paragraph text-dark-brown/40 text-[10px] truncate">{s.email}</p>
                    </div>
                  </div>
                  {/* Current role badge */}
                  <div className="flex items-center">
                    {currentPos ? (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase ${currentPos.badge} ${currentPos.badgeText}`}>
                        <span>{currentPos.icon}</span>
                        {currentPos.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase bg-gray-100 text-gray-500">
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
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                          s.position === pos.key
                            ? `${pos.badge} ${pos.badgeText} border-current shadow-sm`
                            : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/25 hover:text-dark-brown/70"
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
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                        s.position === ""
                          ? "bg-gray-100 text-gray-600 border-gray-400 shadow-sm"
                          : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/25 hover:text-dark-brown/70"
                      }`}
                    >
                      — None
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>)}

        {adminSection === "contacts" && (<>
        {/* Staff Contact Directory */}
        <div className="admin-stagger-item mt-10">
        <div className="mb-6">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Staff Contact Directory</h3>
          <p className="font-paragraph text-dark-brown/50 text-sm mt-1">All staff phone numbers and emails in one place — tap to call or copy</p>
        </div>

        {staffUsers.length === 0 ? (
          <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
            <p className="text-4xl mb-3">📞</p>
            <p className="font-paragraph text-dark-brown/50">No staff contacts to display</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffUsers.map((s) => {
              const pos = STAFF_POSITIONS.find(p => p.key === s.position);
              return (
                <div
                  key={s.id}
                  className="app-panel border rounded-2xl p-5 shadow-md hover:shadow-lg transition-all group"
                >
                  {/* Top: Avatar + Name + Role */}
                  <div className="flex items-center gap-3 mb-4">
                    {s.avatar ? (
                      <Image src={s.avatar} alt={s.name || s.email} width={44} height={44} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold uppercase ${
                        s.role === "admin" ? "bg-dark-brown text-milk" : "bg-light-brown/20 text-dark-brown"
                      }`}>
                        {(s.name || s.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-dark-brown text-sm uppercase truncate">{s.name || s.email.split("@")[0]}</p>
                        {s.employee_id && (
                          <span className="px-1.5 py-0.5 rounded bg-dark-brown/8 text-dark-brown/40 text-[9px] font-mono font-bold tracking-wider flex-shrink-0">{s.employee_id}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {pos && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${pos.badge} ${pos.badgeText}`}>
                            <span>{pos.icon}</span>{pos.label}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          s.role === "admin" ? "bg-dark-brown/10 text-dark-brown" : "bg-light-brown/15 text-dark-brown/60"
                        }`}>
                          {s.role}
                        </span>
                        <span className={`flex items-center gap-0.5 text-[9px] font-bold uppercase ${
                          s.is_active ? "text-green-600" : "text-red-400"
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${s.is_active ? "bg-green-500" : "bg-red-400"}`}></span>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Actions */}
                  <div className="space-y-2">
                    {/* Email */}
                    <div className="flex items-center gap-2 bg-dark-brown/[0.03] rounded-xl px-3 py-2.5 group/email">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(37,99,235)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      </div>
                      <span className="flex-1 text-dark-brown/70 text-xs font-paragraph truncate">{s.email}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(s.email); showToast("Email copied!", "success"); }}
                        className="opacity-0 group-hover/email:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all flex-shrink-0"
                        title="Copy email"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    </div>

                    {/* Phone */}
                    {s.phone ? (
                      <div className="flex items-center gap-2 bg-dark-brown/[0.03] rounded-xl px-3 py-2.5 group/phone">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(5,150,105)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </div>
                        <span className="flex-1 text-dark-brown/70 text-xs font-paragraph truncate">{s.phone}</span>
                        <a
                          href={`tel:${s.phone}`}
                          className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all flex-shrink-0"
                          title="Call"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </a>
                        <button
                          onClick={() => { navigator.clipboard.writeText(s.phone!); showToast("Phone number copied!", "success"); }}
                          className="opacity-0 group-hover/phone:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all flex-shrink-0"
                          title="Copy phone"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-dark-brown/[0.02] rounded-xl px-3 py-2.5">
                        <div className="w-8 h-8 rounded-lg bg-dark-brown/5 flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(120,113,108)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </div>
                        <span className="text-dark-brown/30 text-xs font-paragraph italic">No phone number</span>
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
        <div className="admin-stagger-item mt-10">
        <div className="mb-6">
          <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Today's Attendance</h3>
          <p className="font-paragraph text-dark-brown/50 text-sm mt-1">
            Compares scheduled staff vs clock-ins — click a staff name to view full history
          </p>
        </div>

        {attendanceData?.summary && attendanceData.summary.absent_today > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3">
            <span className="text-lg leading-none" aria-hidden>⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-800 uppercase tracking-wide">Absent today</p>
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
              <p className="text-2xl font-bold text-blue-700">{attendanceData.summary.pending}</p>
              <p className="text-[10px] font-bold uppercase text-blue-600/70 mt-0.5">Pending</p>
            </div>
            <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{attendanceData.summary.clocked_in}</p>
              <p className="text-[10px] font-bold uppercase text-emerald-600/70 mt-0.5">On Time</p>
            </div>
            <div className="bg-orange-50/80 border border-orange-200/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-orange-700">{attendanceData.summary.late}</p>
              <p className="text-[10px] font-bold uppercase text-orange-600/70 mt-0.5">Late</p>
            </div>
            <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{attendanceData.summary.on_break}</p>
              <p className="text-[10px] font-bold uppercase text-amber-600/70 mt-0.5">On Break</p>
            </div>
            <div className="bg-dark-brown/5 border border-dark-brown/10 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-dark-brown/60">{attendanceData.summary.clocked_out}</p>
              <p className="text-[10px] font-bold uppercase text-dark-brown/40 mt-0.5">Clocked Out</p>
            </div>
            <div className="bg-red-50/80 border border-red-200/60 rounded-2xl p-4 text-center ring-2 ring-red-300/50">
              <p className="text-2xl font-bold text-red-700">{attendanceData.summary.absent_today ?? 0}</p>
              <p className="text-[10px] font-bold uppercase text-red-600/70 mt-0.5">Absent Today</p>
            </div>
            <div className="bg-yellow-50/80 border border-yellow-200/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{attendanceData.summary.within_grace ?? 0}</p>
              <p className="text-[10px] font-bold uppercase text-yellow-600/70 mt-0.5">Grace Period</p>
            </div>
            <div className="bg-indigo-50/80 border border-indigo-200/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-indigo-700">{attendanceData.summary.planned_absent ?? 0}</p>
              <p className="text-[10px] font-bold uppercase text-indigo-600/70 mt-0.5">Planned Absence</p>
            </div>
            <div className="bg-red-50/40 border border-red-100/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-red-600/80">{attendanceData.summary.absent}</p>
              <p className="text-[10px] font-bold uppercase text-red-500/60 mt-0.5">Marked Absent</p>
            </div>
            <div className="bg-gray-50/80 border border-gray-200/60 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-600">{attendanceData.summary.not_clocked_in}</p>
              <p className="text-[10px] font-bold uppercase text-gray-500/70 mt-0.5">Not Clocked In</p>
            </div>
          </div>
        )}

        {/* Attendance Table */}
        {!attendanceData?.attendance?.length ? (
          <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-paragraph text-dark-brown/50">No staff attendance data yet</p>
          </div>
        ) : (
          <div className="app-panel border rounded-2xl overflow-hidden shadow-lg">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-brown/10">
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Staff</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Position</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Clock In</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Break</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Clock Out</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Duration</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceData.attendance.map((a: any) => {
                    const cfg = getAttendanceStatusConfig(a);
                    const handleApprove = async () => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/approve/`, {
                          method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({ admin_email: user?.email }),
                        });
                        if (res.ok) { showToast("Approved — On Time!", "success"); fetchAttendance(); }
                        else { const d = await res.json(); showToast(d.error || "Failed to approve", "error"); }
                      } catch { showToast("Failed to approve", "error"); }
                    };
                    const handleMarkLate = async () => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-late/`, {
                          method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({ admin_email: user?.email }),
                        });
                        if (res.ok) { showToast("Marked as Late", "success"); fetchAttendance(); }
                        else { const d = await res.json(); showToast(d.error || "Failed to mark late", "error"); }
                      } catch { showToast("Failed to mark late", "error"); }
                    };
                    const handleMarkAbsent = async () => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-absent/`, {
                          method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({ admin_email: user?.email }),
                        });
                        if (res.ok) { showToast("Marked as Absent", "success"); fetchAttendance(); }
                        else { const d = await res.json(); showToast(d.error || "Failed to mark absent", "error"); }
                      } catch { showToast("Failed to mark absent", "error"); }
                    };
                    return (
                      <tr key={a.id} className={`border-b border-dark-brown/5 hover:bg-dark-brown/[0.02] transition-colors ${a.status === 'pending' ? 'bg-blue-50/30' : ''} ${a.absent_today ? 'bg-red-50/40' : ''}`}>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => openAttendanceHistory(a)}
                            className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                          >
                            {a.avatar ? (
                              <Image src={a.avatar} alt={a.name} width={32} height={32} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-light-brown/20 flex items-center justify-center text-xs font-bold uppercase text-dark-brown flex-shrink-0">{a.name.charAt(0)}</div>
                            )}
                            <div>
                              <p className="text-sm font-bold text-dark-brown uppercase truncate hover:underline">{a.name}</p>
                              <p className="text-[10px] text-dark-brown/40 font-mono">{a.employee_id || a.email}</p>
                            </div>
                          </button>
                        </td>
                        <td className="px-5 py-3 text-xs text-dark-brown/60 capitalize">
                          {a.shift_assignment?.station_display || a.position || "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${cfg.color} ${cfg.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${a.status === 'pending' || a.absent_today ? 'animate-pulse' : ''}`}></span>
                            {cfg.label}
                          </span>
                          {a.planned_absence && (
                            <span className="ml-1.5 block text-[9px] text-indigo-600/80 font-paragraph mt-0.5 max-w-[180px] truncate" title={a.planned_absence.reason}>
                              {a.planned_absence.reason}
                            </span>
                          )}
                          {a.shift_start && (a.absent_today || a.display_status === 'within_grace') && !a.planned_absence && (
                            <span className="ml-1.5 block text-[9px] text-dark-brown/40 font-paragraph mt-0.5">
                              Shift {new Date(`1970-01-01T${a.shift_start}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {a.minutes_late != null && a.minutes_late > 0 && (
                            <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[9px] font-bold">
                              +{a.minutes_late}m late
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs text-dark-brown/60 font-paragraph">{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-xs text-dark-brown/60 font-paragraph">
                          {a.break_start ? new Date(a.break_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                          {a.break_end ? ` → ${new Date(a.break_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </td>
                        <td className="px-5 py-3 text-xs text-dark-brown/60 font-paragraph">{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold font-mono text-dark-brown/50">{a.duration || "—"}</td>
                        <td className="px-5 py-3 text-right">
                          {a.status === 'pending' && a.shift_id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={handleApprove} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95">
                                On Time
                              </button>
                              <button onClick={handleMarkLate} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-orange-500 hover:bg-orange-600 text-white transition-all active:scale-95">
                                Late
                              </button>
                              <button onClick={handleMarkAbsent} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-red-500 hover:bg-red-600 text-white transition-all active:scale-95">
                                Absent
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-dark-brown/20">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-dark-brown/5">
              {attendanceData.attendance.map((a: any) => {
                const cfg = getAttendanceStatusConfig(a);
                const handleApprove = async () => {
                  try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/approve/`, {
                      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
                      body: JSON.stringify({ admin_email: user?.email }),
                    });
                    if (res.ok) { showToast("Approved — On Time!", "success"); fetchAttendance(); }
                    else { const d = await res.json(); showToast(d.error || "Failed to approve", "error"); }
                  } catch { showToast("Failed to approve", "error"); }
                };
                const handleMarkLate = async () => {
                  try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-late/`, {
                      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
                      body: JSON.stringify({ admin_email: user?.email }),
                    });
                    if (res.ok) { showToast("Marked as Late", "success"); fetchAttendance(); }
                    else { const d = await res.json(); showToast(d.error || "Failed to mark late", "error"); }
                  } catch { showToast("Failed to mark late", "error"); }
                };
                const handleMarkAbsent = async () => {
                  try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/admin/shift/${a.shift_id}/mark-absent/`, {
                      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
                      body: JSON.stringify({ admin_email: user?.email }),
                    });
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
                          <Image src={a.avatar} alt={a.name} width={28} height={28} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-light-brown/20 flex items-center justify-center text-[10px] font-bold uppercase text-dark-brown flex-shrink-0">{a.name.charAt(0)}</div>
                        )}
                        <p className="text-sm font-bold text-dark-brown uppercase hover:underline">{a.name}</p>
                      </button>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${cfg.color} ${cfg.bg}`}>
                        <span className={`w-1 h-1 rounded-full ${cfg.dot} ${a.status === 'pending' || a.absent_today ? 'animate-pulse' : ''}`}></span>
                        {cfg.label}
                      </span>
                      {a.minutes_late != null && a.minutes_late > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[9px] font-bold">
                          +{a.minutes_late}m late
                        </span>
                      )}
                    </div>
                    {a.shift_start && (a.absent_today || a.display_status === 'within_grace') && (
                      <p className="text-[9px] text-dark-brown/40 font-paragraph mb-2">
                        Scheduled {new Date(`1970-01-01T${a.shift_start}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-dark-brown/50">
                      <div><span className="block text-dark-brown/30 uppercase font-bold">In</span>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                      <div><span className="block text-dark-brown/30 uppercase font-bold">Break</span>{a.break_start ? new Date(a.break_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                      <div><span className="block text-dark-brown/30 uppercase font-bold">Out</span>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                    </div>
                    {a.status === 'pending' && a.shift_id && (
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={handleApprove} className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold uppercase bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95">On Time</button>
                        <button onClick={handleMarkLate} className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold uppercase bg-orange-500 hover:bg-orange-600 text-white transition-all active:scale-95">Late</button>
                        <button onClick={handleMarkAbsent} className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold uppercase bg-red-500 hover:bg-red-600 text-white transition-all active:scale-95">Absent</button>
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
              <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Assign Shift</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-1">
                Pick staff, date, start/end time, and station — saved per week
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShiftWeekStart((w) => shiftWeekStartISO(w, -1))}
                className="px-3 py-2 rounded-xl bg-white/70 border border-dark-brown/15 text-dark-brown text-xs font-bold uppercase hover:bg-white transition-all"
              >
                ← Prev
              </button>
              <span className="text-xs font-bold text-dark-brown/70 min-w-[160px] text-center">
                {new Date(`${shiftWeekStart}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}
                {" – "}
                {new Date(`${getWeekEndISO(shiftWeekStart)}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setShiftWeekStart((w) => shiftWeekStartISO(w, 1))}
                className="px-3 py-2 rounded-xl bg-white/70 border border-dark-brown/15 text-dark-brown text-xs font-bold uppercase hover:bg-white transition-all"
              >
                Next →
              </button>
              <button
                type="button"
                onClick={() => setShiftWeekStart(getWeekMondayISO())}
                className="px-3 py-2 rounded-xl bg-dark-brown/10 text-dark-brown text-xs font-bold uppercase hover:bg-dark-brown/15 transition-all"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={exportShiftScheduleCsv}
                disabled={shiftExportLoading}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase transition-all disabled:opacity-50"
              >
                {shiftExportLoading ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="app-panel border rounded-3xl p-6 shadow-lg">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Staff Member</label>
                  <select
                    value={shiftFormStaff}
                    onChange={(e) => setShiftFormStaff(e.target.value)}
                    className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm font-bold text-dark-brown"
                  >
                    {staffUsers.map((s) => (
                      <option key={s.email} value={s.email}>{s.name || s.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Shift Date</label>
                  <input
                    type="date"
                    value={shiftFormDate}
                    min={shiftWeekStart}
                    max={getWeekEndISO(shiftWeekStart)}
                    onChange={(e) => setShiftFormDate(e.target.value)}
                    className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={shiftFormStart}
                      onChange={(e) => setShiftFormStart(e.target.value)}
                      className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={shiftFormEnd}
                      onChange={(e) => setShiftFormEnd(e.target.value)}
                      className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Station</label>
                  <select
                    value={shiftFormStation}
                    onChange={(e) => setShiftFormStation(e.target.value)}
                    className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm font-bold text-dark-brown"
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
                  className="w-full py-3 rounded-xl bg-dark-brown hover:bg-dark-brown/90 text-white font-bold text-xs uppercase transition-all disabled:opacity-50"
                >
                  {shiftFormLoading ? "Saving…" : "Assign Shift"}
                </button>
              </div>
            </div>
            <div className="app-panel border rounded-3xl p-6 shadow-lg">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[10px] font-bold uppercase text-dark-brown/50">This Week&apos;s Schedule</p>
                <button
                  type="button"
                  onClick={exportShiftScheduleCsv}
                  disabled={shiftExportLoading}
                  className="text-[10px] font-bold uppercase text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                >
                  {shiftExportLoading ? "Exporting…" : "Download CSV"}
                </button>
              </div>
              {shiftAssignLoading ? (
                <p className="font-paragraph text-dark-brown/45 text-sm">Loading schedule…</p>
              ) : shiftAssignments.length === 0 ? (
                <p className="font-paragraph text-dark-brown/45 text-sm">No shifts assigned for this week</p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {shiftAssignments.map((a) => {
                    const pos = STAFF_POSITIONS.find((p) => p.key === a.station);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/50 border border-dark-brown/5">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-dark-brown truncate">{a.user_name || a.user_email}</p>
                          <p className="text-[10px] text-dark-brown/50 font-paragraph">
                            {new Date(`${a.shift_date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            {" · "}
                            {formatShiftTime(a.start_time)} – {formatShiftTime(a.end_time)}
                          </p>
                          <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${pos?.badge || "bg-gray-100"} ${pos?.badgeText || "text-gray-700"}`}>
                            {pos?.icon} {a.station_display}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteShiftAssignment(a.id)}
                          className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase bg-red-50 text-red-600 hover:bg-red-100 transition-all"
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
            <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Absence Request Form</h3>
            <p className="font-paragraph text-dark-brown/50 text-sm mt-1">
              Log planned absences in advance — shown as indigo on the calendar, separate from unexpected absences (red)
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="app-panel border rounded-3xl p-6 shadow-lg">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Staff Member</label>
                  <select
                    value={absenceFormStaff}
                    onChange={(e) => setAbsenceFormStaff(e.target.value)}
                    className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm font-bold text-dark-brown"
                  >
                    {staffUsers.map((s) => (
                      <option key={s.email} value={s.email}>{s.name || s.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Absence Date</label>
                  <input
                    type="date"
                    value={absenceFormDate}
                    onChange={(e) => setAbsenceFormDate(e.target.value)}
                    className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-dark-brown/50 mb-1.5">Reason</label>
                  <textarea
                    value={absenceFormReason}
                    onChange={(e) => setAbsenceFormReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Medical appointment, family leave, approved day off..."
                    className="w-full bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2.5 text-sm text-dark-brown font-paragraph resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitAbsenceRequest}
                  disabled={absenceFormLoading}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase transition-all disabled:opacity-50"
                >
                  {absenceFormLoading ? "Saving…" : "Log Planned Absence"}
                </button>
              </div>
            </div>
            <div className="app-panel border rounded-3xl p-6 shadow-lg">
              <p className="text-[10px] font-bold uppercase text-dark-brown/50 mb-3">Upcoming Planned Absences</p>
              {absenceRequests.filter((r) => r.status === "approved" && r.absence_date >= new Date().toISOString().slice(0, 10)).length === 0 ? (
                <p className="font-paragraph text-dark-brown/45 text-sm">No upcoming planned absences</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {absenceRequests
                    .filter((r) => r.status === "approved" && r.absence_date >= new Date().toISOString().slice(0, 10))
                    .slice(0, 20)
                    .map((r) => (
                      <div key={r.id} className="rounded-xl border border-indigo-200/60 bg-indigo-50/50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-indigo-900 uppercase">{r.user_name || r.user_email}</p>
                            <p className="text-[11px] text-indigo-700/80 font-paragraph mt-0.5">
                              {new Date(`${r.absence_date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            <p className="text-xs text-indigo-800/70 font-paragraph mt-1">{r.reason}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => cancelAbsenceRequest(r.id)}
                            className="text-[10px] font-bold uppercase text-red-600 hover:text-red-800 flex-shrink-0"
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
              <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Monthly Attendance Summary</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-1">
                Calendar view per staff — green = present, yellow = late, red = unexpected absent, indigo = planned absence
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-dark-brown/50 tracking-wider">Staff</label>
              <select
                value={calendarStaffEmail}
                onChange={(e) => setCalendarStaffEmail(e.target.value)}
                className="bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2 text-sm font-bold text-dark-brown min-w-[180px]"
              >
                {staffUsers.length === 0 && <option value="">No staff</option>}
                {staffUsers.map((s) => (
                  <option key={s.email} value={s.email}>{s.name || s.email}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="app-panel border rounded-3xl p-5 md:p-8 shadow-lg">
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
              <h3 className="text-xl md:text-2xl font-bold text-dark-brown uppercase tracking-tight">Payroll Summary</h3>
              <p className="font-paragraph text-dark-brown/50 text-sm mt-1">
                Hours beyond {payrollData?.standard_daily_hours ?? 8}h per day are flagged as overtime (Mon–Sun)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-dark-brown/50 tracking-wider">OT Multiplier</label>
              <select
                value={otMultiplier}
                onChange={(e) => setOtMultiplier(e.target.value)}
                className="bg-white/70 border border-dark-brown/15 rounded-xl px-3 py-2 text-sm font-bold text-dark-brown"
              >
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
              <button
                onClick={fetchPayrollSummary}
                disabled={payrollLoading}
                className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase bg-dark-brown hover:bg-dark-brown-hover text-milk transition-all disabled:opacity-50"
              >
                {payrollLoading ? "Loading…" : "Apply"}
              </button>
            </div>
          </div>

          {payrollData?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-2xl p-4 text-center">
                <p className="text-xl font-bold text-emerald-700">{payrollData.summary.total_regular_display}</p>
                <p className="text-[10px] font-bold uppercase text-emerald-600/70 mt-0.5">Regular (All Staff)</p>
              </div>
              <div className="bg-orange-50/80 border border-orange-200/60 rounded-2xl p-4 text-center">
                <p className="text-xl font-bold text-orange-700">{payrollData.summary.total_overtime_display}</p>
                <p className="text-[10px] font-bold uppercase text-orange-600/70 mt-0.5">Overtime</p>
              </div>
              <div className="bg-dark-brown/5 border border-dark-brown/10 rounded-2xl p-4 text-center">
                <p className="text-xl font-bold text-dark-brown">{payrollData.summary.total_weighted_overtime_hours}h</p>
                <p className="text-[10px] font-bold uppercase text-dark-brown/40 mt-0.5">OT × {payrollData.overtime_multiplier}</p>
              </div>
              <div className="bg-white/60 border border-dark-brown/10 rounded-2xl p-4 text-center">
                <p className="text-xl font-bold text-dark-brown">{payrollData.summary.staff_with_overtime}</p>
                <p className="text-[10px] font-bold uppercase text-dark-brown/40 mt-0.5">Staff w/ OT</p>
              </div>
            </div>
          )}

          {payrollLoading && !payrollData ? (
            <div className="app-panel border rounded-3xl p-10 text-center">
              <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin mx-auto" />
            </div>
          ) : !payrollData?.staff?.length ? (
            <div className="app-panel border rounded-3xl p-10 text-center shadow-lg">
              <p className="font-paragraph text-dark-brown/50">No payroll data for this week</p>
            </div>
          ) : (
            <div className="app-panel border rounded-2xl overflow-hidden shadow-lg">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-brown/10">
                      <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Staff</th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Regular</th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-orange-600/70 tracking-wider">Overtime</th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">OT × {payrollData.overtime_multiplier}</th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Total</th>
                      <th className="text-center px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollData.staff.map((s: any) => (
                      <React.Fragment key={s.email}>
                        <tr className={`border-b border-dark-brown/5 ${s.overtime_seconds > 0 ? "bg-orange-50/30" : ""}`}>
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => openAttendanceHistory(s)}
                              className="text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="text-sm font-bold text-dark-brown uppercase hover:underline">{s.name}</p>
                              <p className="text-[10px] text-dark-brown/40 font-mono">{s.employee_id || s.email}</p>
                            </button>
                          </td>
                          <td className="px-5 py-3 text-right text-sm font-mono text-dark-brown/70">{s.regular_display}</td>
                          <td className="px-5 py-3 text-right">
                            {s.overtime_seconds > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold font-mono">
                                {s.overtime_display}
                              </span>
                            ) : (
                              <span className="text-sm font-mono text-dark-brown/30">0m</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-sm font-mono font-bold text-dark-brown">{s.weighted_overtime_display}</td>
                          <td className="px-5 py-3 text-right text-sm font-mono font-bold text-dark-brown">{s.total_display}</td>
                          <td className="px-5 py-3 text-center">
                            {s.daily_breakdown?.length > 0 && (
                              <button
                                onClick={() => setExpandedPayrollEmail(expandedPayrollEmail === s.email ? null : s.email)}
                                className="text-[10px] font-bold uppercase text-dark-brown/50 hover:text-dark-brown"
                              >
                                {expandedPayrollEmail === s.email ? "Hide" : "Days"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedPayrollEmail === s.email && s.daily_breakdown?.map((d: any) => (
                          <tr key={`${s.email}-${d.date}`} className="bg-dark-brown/[0.02] border-b border-dark-brown/5">
                            <td className="px-5 py-2 pl-10 text-xs text-dark-brown/50 font-paragraph">
                              {new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            </td>
                            <td className="px-5 py-2 text-right text-xs font-mono text-dark-brown/50">{d.regular_display}</td>
                            <td className="px-5 py-2 text-right">
                              {d.has_overtime ? (
                                <span className="text-xs font-bold text-orange-600 font-mono">{d.overtime_display}</span>
                              ) : (
                                <span className="text-xs text-dark-brown/30">—</span>
                              )}
                            </td>
                            <td colSpan={3} className="px-5 py-2 text-right text-xs font-mono text-dark-brown/40">{d.total_display} worked</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-dark-brown/5 p-2">
                {payrollData.staff.map((s: any) => (
                  <div key={s.email} className={`p-4 rounded-xl ${s.overtime_seconds > 0 ? "bg-orange-50/40" : ""}`}>
                    <button type="button" onClick={() => openAttendanceHistory(s)} className="text-sm font-bold text-dark-brown uppercase hover:underline text-left">
                      {s.name}
                    </button>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px]">
                      <div><span className="block text-dark-brown/40 uppercase font-bold">Reg</span><span className="font-mono font-bold">{s.regular_display}</span></div>
                      <div><span className="block text-orange-600/70 uppercase font-bold">OT</span><span className="font-mono font-bold text-orange-700">{s.overtime_display}</span></div>
                      <div><span className="block text-dark-brown/40 uppercase font-bold">×{payrollData.overtime_multiplier}</span><span className="font-mono font-bold">{s.weighted_overtime_display}</span></div>
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
        <div className="admin-stagger-item mt-10">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-dark-brown uppercase tracking-tight">Activity Feed</h2>
          <p className="text-dark-brown/50 font-paragraph text-sm mt-1">Live audit log of staff actions (last 24 hours)</p>
        </div>

        {activityFeed.length === 0 ? (
          <div className="app-panel border rounded-3xl p-12 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgb(120,113,108)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <p className="text-dark-brown/40 font-bold uppercase text-sm">No activity yet</p>
            <p className="text-dark-brown/30 text-xs mt-1">Actions will appear here as staff clock in, take breaks, etc.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activityFeed.map((a: any) => {
              const iconMap: Record<string, { color: string; bg: string; icon: string }> = {
                clock_in: { color: "text-emerald-600", bg: "bg-emerald-100", icon: "⏱" },
                clock_out: { color: "text-red-500", bg: "bg-red-100", icon: "⏹" },
                break_start: { color: "text-amber-600", bg: "bg-amber-100", icon: "☕" },
                break_end: { color: "text-emerald-600", bg: "bg-emerald-100", icon: "✅" },
                approved: { color: "text-emerald-700", bg: "bg-emerald-100", icon: "✓" },
                marked_late: { color: "text-orange-600", bg: "bg-orange-100", icon: "⏰" },
                marked_absent: { color: "text-red-600", bg: "bg-red-100", icon: "✗" },
                planned_absence: { color: "text-indigo-600", bg: "bg-indigo-100", icon: "📅" },
                order_completed: { color: "text-emerald-600", bg: "bg-emerald-100", icon: "📦" },
                order_cancelled: { color: "text-red-500", bg: "bg-red-100", icon: "🚫" },
                order_voided: { color: "text-red-700", bg: "bg-red-100", icon: "🗑" },
              };
              const cfg = iconMap[a.action] || { color: "text-dark-brown/60", bg: "bg-dark-brown/5", icon: "•" };
              const timeAgo = (() => {
                const diff = (Date.now() - new Date(a.created_at).getTime()) / 1000;
                if (diff < 60) return "just now";
                if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                return `${Math.floor(diff / 86400)}d ago`;
              })();
              return (
                <div key={a.id} className="flex items-start gap-3 app-panel border rounded-2xl px-4 py-3 hover:bg-white/70 transition-all">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-dark-brown font-paragraph leading-snug">{a.description}</p>
                    {a.performed_by_name && (
                      <p className="text-[10px] text-dark-brown/40 mt-0.5">by {a.performed_by_name}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] text-dark-brown/40 font-mono">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="text-[9px] text-dark-brown/30">{timeAgo}</p>
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
            className="app-panel border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-dark-brown/5 border-b border-dark-brown/10 p-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {historyStaff.avatar ? (
                  <Image src={historyStaff.avatar} alt={historyStaff.name} width={44} height={44} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-light-brown/20 flex items-center justify-center text-sm font-bold uppercase text-dark-brown flex-shrink-0">
                    {(historyStaff.name || historyStaff.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-dark-brown text-base uppercase tracking-tight truncate">{historyStaff.name}</h3>
                    {historyStaff.employee_id && (
                      <span className="px-2 py-0.5 rounded-md bg-dark-brown/10 text-dark-brown/60 text-[10px] font-mono font-bold">{historyStaff.employee_id}</span>
                    )}
                  </div>
                  <p className="text-dark-brown/50 text-xs font-paragraph truncate">{historyStaff.email}</p>
                  {historyStaff.shift_start && historyStaff.shift_end && (
                    <p className="text-[10px] text-dark-brown/40 font-paragraph mt-0.5">
                      Scheduled {new Date(`1970-01-01T${historyStaff.shift_start}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(`1970-01-01T${historyStaff.shift_end}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={closeAttendanceHistory} className="text-dark-brown/40 hover:text-dark-brown transition-colors p-1 rounded-full hover:bg-dark-brown/10 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="px-5 pt-4 flex gap-2 border-b border-dark-brown/10 flex-shrink-0">
              <button
                type="button"
                onClick={() => setHistoryTab("list")}
                className={`px-4 py-2 rounded-t-xl text-[10px] font-bold uppercase transition-all ${historyTab === "list" ? "bg-dark-brown text-milk" : "bg-dark-brown/5 text-dark-brown/60 hover:bg-dark-brown/10"}`}
              >
                Log List
              </button>
              <button
                type="button"
                onClick={() => {
                  setHistoryTab("calendar");
                  if (historyStaff) fetchMonthlyCalendar(historyStaff.email, calendarYear, calendarMonth);
                }}
                className={`px-4 py-2 rounded-t-xl text-[10px] font-bold uppercase transition-all ${historyTab === "calendar" ? "bg-dark-brown text-milk" : "bg-dark-brown/5 text-dark-brown/60 hover:bg-dark-brown/10"}`}
              >
                Calendar
              </button>
            </div>

            {historyTab === "list" && historyData?.summary && (
              <div className="px-5 py-4 border-b border-dark-brown/10 grid grid-cols-3 sm:grid-cols-6 gap-2 flex-shrink-0">
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
                    className={`rounded-xl px-2 py-2 text-center transition-all ${
                      historyMarkFilter === f.key
                        ? "bg-dark-brown text-milk shadow-md"
                        : "bg-dark-brown/5 text-dark-brown/70 hover:bg-dark-brown/10"
                    }`}
                  >
                    <p className="text-lg font-bold tabular-nums">{f.count}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-80">{f.label}</p>
                  </button>
                ))}
                <div className="rounded-xl px-2 py-2 text-center bg-amber-50/80 border border-amber-200/50">
                  <p className="text-lg font-bold text-amber-700 tabular-nums">{historyData.summary.with_break}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600/70">With Break</p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0 p-5">
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
                  <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" />
                </div>
              ) : !historyData?.logs?.length ? (
                <div className="py-16 text-center">
                  <p className="text-4xl mb-2">📋</p>
                  <p className="font-paragraph text-dark-brown/50">No attendance records found</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                        <tr className="border-b border-dark-brown/10">
                          <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Date</th>
                          <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Status</th>
                          <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Clock In</th>
                          <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Break</th>
                          <th className="text-left px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Clock Out</th>
                          <th className="text-right px-5 py-3 text-[10px] font-bold uppercase text-dark-brown/40 tracking-wider">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.logs.map((log) => {
                          const cfg = getHistoryMarkConfig(log);
                          return (
                            <tr key={log.id} className={`border-b border-dark-brown/5 hover:bg-dark-brown/[0.02] ${log.attendance_mark === "absent" ? "bg-red-50/30" : log.attendance_mark === "late" ? "bg-orange-50/20" : ""}`}>
                              <td className="px-5 py-3 text-xs font-paragraph text-dark-brown/70">{formatHistoryDate(log.date)}</td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${cfg.color} ${cfg.bg}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                                  {cfg.label}
                                </span>
                                {log.minutes_late != null && log.minutes_late > 0 && (
                                  <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[9px] font-bold">+{log.minutes_late}m</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-xs font-mono text-dark-brown/60">{formatHistoryTime(log.clock_in)}</td>
                              <td className="px-5 py-3 text-xs font-paragraph text-dark-brown/60">
                                {log.break_start ? (
                                  <>
                                    {formatHistoryTime(log.break_start)}
                                    {log.break_end ? ` → ${formatHistoryTime(log.break_end)}` : " (ongoing)"}
                                    {log.break_duration && <span className="block text-[10px] text-dark-brown/40 mt-0.5">{log.break_duration} break</span>}
                                  </>
                                ) : "—"}
                              </td>
                              <td className="px-5 py-3 text-xs font-mono text-dark-brown/60">{log.clock_out ? formatHistoryTime(log.clock_out) : "—"}</td>
                              <td className="px-5 py-3 text-right text-xs font-mono font-bold text-dark-brown/50">{log.duration || (log.status === "pending" ? "Pending" : "Active")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden divide-y divide-dark-brown/5">
                    {historyData.logs.map((log) => {
                      const cfg = getHistoryMarkConfig(log);
                      return (
                        <div key={log.id} className={`p-4 ${log.attendance_mark === "absent" ? "bg-red-50/30" : ""}`}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-xs font-paragraph text-dark-brown/60">{formatHistoryDate(log.date)}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-dark-brown/50">
                            <div><span className="block text-dark-brown/30 uppercase font-bold">In</span>{formatHistoryTime(log.clock_in)}</div>
                            <div><span className="block text-dark-brown/30 uppercase font-bold">Out</span>{log.clock_out ? formatHistoryTime(log.clock_out) : "—"}</div>
                            <div className="col-span-2"><span className="block text-dark-brown/30 uppercase font-bold">Break</span>{log.break_start ? `${formatHistoryTime(log.break_start)}${log.break_end ? ` → ${formatHistoryTime(log.break_end)}` : ""}${log.break_duration ? ` (${log.break_duration})` : ""}` : "—"}</div>
                          </div>
                          {log.minutes_late != null && log.minutes_late > 0 && (
                            <p className="text-[10px] text-orange-600 font-bold mt-2">+{log.minutes_late} minutes late</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {historyTab === "list" && historyData?.pagination && historyData.pagination.total_pages > 1 && (
              <div className="border-t border-dark-brown/10 px-5 py-4 flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-dark-brown/50 font-paragraph">
                  Page {historyData.pagination.page} of {historyData.pagination.total_pages} · {historyData.pagination.total} records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!historyData.pagination.has_prev || historyLoading}
                    onClick={() => historyStaff && fetchAttendanceHistory(historyStaff, historyPage - 1, historyMarkFilter)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-dark-brown/5 hover:bg-dark-brown/10 text-dark-brown disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={!historyData.pagination.has_next || historyLoading}
                    onClick={() => historyStaff && fetchAttendanceHistory(historyStaff, historyPage + 1, historyMarkFilter)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-dark-brown hover:bg-dark-brown-hover text-milk disabled:opacity-40"
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
          <div className="app-panel border rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-dark-brown/5 border-b border-dark-brown/10 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {editingStaff.avatar ? (
                  <Image src={editingStaff.avatar} alt={editingStaff.name || editingStaff.email} width={40} height={40} className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold uppercase ${
                    editingStaff.role === "admin" ? "bg-dark-brown text-milk" : "bg-light-brown/20 text-dark-brown"
                  }`}>
                    {(editingStaff.name || editingStaff.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-dark-brown text-sm uppercase tracking-wider">Edit Staff Profile</h3>
                    {editingStaff.employee_id && (
                      <span className="px-2 py-0.5 rounded-md bg-dark-brown/10 text-dark-brown/60 text-[10px] font-mono font-bold tracking-wider">{editingStaff.employee_id}</span>
                    )}
                  </div>
                  <p className="text-dark-brown/50 text-xs font-paragraph">{editingStaff.email}</p>
                </div>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-dark-brown/40 hover:text-dark-brown transition-colors p-1 rounded-full hover:bg-dark-brown/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Avatar Upload */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Profile Photo</label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    {avatarPreview ? (
                      <Image src={avatarPreview} alt="Avatar preview" width={56} height={56} className="w-14 h-14 rounded-2xl object-cover border-2 border-dark-brown/10" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold uppercase bg-light-brown/20 text-dark-brown border-2 border-dark-brown/10">
                        {(staffForm.name || editingStaff.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
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
                    <p className="text-dark-brown/50 text-xs font-paragraph">Click the avatar to upload a photo</p>
                    {avatarFile && (
                      <button
                        onClick={() => { setAvatarFile(null); setAvatarPreview(editingStaff.avatar || null); }}
                        className="mt-1 text-[10px] font-bold uppercase text-red-500 hover:text-red-700 transition-colors"
                      >
                        Remove new photo
                      </button>
                    )}
                    {editingStaff.avatar && !avatarFile && (
                      <button
                        onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                        className="mt-1 text-[10px] font-bold uppercase text-red-500 hover:text-red-700 transition-colors"
                      >
                        Remove current photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph text-sm focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30"
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Phone Number</label>
                <input
                  type="text"
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                  className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph text-sm focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30"
                  placeholder="e.g. 0917-123-4567"
                />
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Staff Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {STAFF_POSITIONS.map((pos) => (
                    <button
                      key={pos.key}
                      onClick={() => setStaffForm({ ...staffForm, position: pos.key })}
                      className={`py-2.5 rounded-xl text-xs font-bold uppercase transition-all border-2 flex flex-col items-center gap-1 ${
                        staffForm.position === pos.key
                          ? `${pos.badge} ${pos.badgeText} border-current shadow-sm`
                          : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/20"
                      }`}
                    >
                      <span className="text-base">{pos.icon}</span>
                      <span>{pos.label}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setStaffForm({ ...staffForm, position: "" })}
                    className={`py-2.5 rounded-xl text-xs font-bold uppercase transition-all border-2 flex flex-col items-center gap-1 ${
                      staffForm.position === ""
                        ? "bg-gray-100 text-gray-600 border-gray-400 shadow-sm"
                        : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/20"
                    }`}
                  >
                    <span className="text-base">—</span>
                    <span>None</span>
                  </button>
                </div>
              </div>

              {/* Shift Start Time */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Shift Schedule</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-dark-brown/40 mb-1">Start</p>
                    <input
                      type="time"
                      value={staffForm.shift_start || ""}
                      onChange={(e) => setStaffForm({ ...staffForm, shift_start: e.target.value })}
                      className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph text-sm focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30"
                    />
                  </div>
                  <span className="text-dark-brown/30 mt-4">→</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-dark-brown/40 mb-1">End</p>
                    <input
                      type="time"
                      value={staffForm.shift_end || ""}
                      onChange={(e) => setStaffForm({ ...staffForm, shift_end: e.target.value })}
                      className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph text-sm focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-dark-brown/40 mt-1">Default: 7:30 AM – 5:00 PM · Used for late arrival & overtime tracking</p>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Bio / Notes</label>
                <textarea
                  value={staffForm.bio}
                  onChange={(e) => setStaffForm({ ...staffForm, bio: e.target.value })}
                  rows={3}
                  className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph text-sm focus:outline-none focus:border-light-brown focus:ring-2 focus:ring-light-brown/30 resize-none"
                  placeholder="Short bio or notes about this staff member..."
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Role</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStaffForm({ ...staffForm, role: "staff" })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all border-2 ${
                      staffForm.role === "staff"
                        ? "bg-light-brown/20 border-light-brown text-dark-brown shadow-sm"
                        : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/20"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Staff
                  </button>
                  <button
                    onClick={() => setStaffForm({ ...staffForm, role: "admin" })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all border-2 ${
                      staffForm.role === "admin"
                        ? "bg-dark-brown border-dark-brown text-milk shadow-sm"
                        : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/20"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    Admin
                  </button>
                </div>
              </div>

              {/* Active Toggle */}
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Account Status</label>
                <button
                  onClick={() => editingStaff.email !== user?.email && setStaffForm({ ...staffForm, is_active: !staffForm.is_active })}
                  disabled={editingStaff.email === user?.email}
                  className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border-2 transition-all ${
                    editingStaff.email === user?.email
                      ? "bg-gray-50 border-gray-200 cursor-not-allowed opacity-60"
                      : staffForm.is_active
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                  }`}
                >
                  <span className={`flex items-center gap-2 text-xs font-bold uppercase ${editingStaff.email === user?.email ? "text-gray-400" : staffForm.is_active ? "text-green-700" : "text-red-700"}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${editingStaff.email === user?.email ? "bg-gray-300" : staffForm.is_active ? "bg-green-500" : "bg-red-400"}`}></span>
                    {staffForm.is_active ? "Can Log In" : "Cannot Log In"}
                  </span>
                  {/* Toggle switch */}
                  <div className={`w-10 h-5 rounded-full transition-colors ${editingStaff.email === user?.email ? "bg-gray-300" : staffForm.is_active ? "bg-green-400" : "bg-red-300"} relative`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${staffForm.is_active ? "left-5" : "left-0.5"}`}></div>
                  </div>
                </button>
                <p className="text-dark-brown/40 text-[10px] mt-1 font-paragraph">
                  {editingStaff.email === user?.email ? "You cannot deactivate your own account." : "Inactive accounts cannot log in at all."}
                </p>
              </div>

              {/* Joined date (read-only) */}
              <div className="bg-dark-brown/5 rounded-xl p-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-dark-brown/50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className="text-dark-brown/50 text-xs font-paragraph">Joined {new Date(editingStaff.date_joined).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-dark-brown/10 flex gap-3">
              <button
                onClick={() => setEditingStaff(null)}
                className="flex-1 bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold uppercase py-3 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveStaff}
                className="flex-1 bg-dark-brown hover:bg-dark-brown-hover text-milk font-bold uppercase py-3 rounded-xl transition-colors shadow-lg text-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Reason Modal */}
      {voidModalOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="app-panel border rounded-3xl shadow-2xl p-6 md:p-8 w-[90%] max-w-md">
            <h3 className="text-xl font-bold text-dark-brown uppercase tracking-tight mb-2">Void Order</h3>
            <p className="font-paragraph text-dark-brown/60 text-sm mb-4">Provide a reason for voiding order <strong>{voidModalOrderId}</strong>. Inventory will be restored.</p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Enter void reason (required)"
              rows={3}
              className="w-full bg-white/60 border border-dark-brown/20 text-dark-brown font-paragraph rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none placeholder:text-dark-brown/40"
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setVoidModalOrderId(null); setVoidReason(""); }}
                className="flex-1 bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold uppercase py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => voidOrder(voidModalOrderId, voidReason)}
                disabled={!voidReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold uppercase py-3 rounded-xl transition-colors shadow-lg"
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
          <div className="app-panel border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-50 border-b border-red-100 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                </div>
                <div>
                  <h3 className="font-bold text-dark-brown text-sm uppercase tracking-wider">Cancellation Reason</h3>
                  <p className="text-dark-brown/50 text-xs font-paragraph">{viewReasonData.orderId}</p>
                </div>
              </div>
              <button onClick={() => setViewReasonData(null)} className="text-dark-brown/40 hover:text-dark-brown transition-colors p-1 rounded-full hover:bg-dark-brown/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="font-paragraph text-dark-brown text-sm leading-relaxed break-words whitespace-pre-wrap">{viewReasonData.reason.replace(/^\[User Cancelled\]\s*/i, '')}</p>
            </div>
            <div className="p-4 border-t border-dark-brown/10 flex justify-end">
              <button
                onClick={() => setViewReasonData(null)}
                className="px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider text-dark-brown bg-dark-brown/10 hover:bg-dark-brown/20 transition-colors focus:outline-none"
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
          <div className="bg-dark-brown text-milk px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10 backdrop-blur-md">
            <div className={`${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} rounded-full p-1`}>
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
            <p className="font-bold uppercase text-xs tracking-widest">{toast.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
