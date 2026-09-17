"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import { signOut } from "next-auth/react";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";
import CroissantLogoIcon from "@/components/CroissantLogoIcon";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface OrderItem {
  name: string;
  price: number;
  qty: number;
}

interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  date: string;
  userEmail: string;
  userName: string;
  status: string;
  orderType: string;
  tableNumber: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
}

export default function AdminSalesPage() {
  const { isLoggedIn, isStaff, user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [salesLog, setSalesLog] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "dine_in" | "takeout" | "scheduled">("all");
  const [activeRange, setActiveRange] = useState<"today" | "7d" | "30d" | "all" | "custom">("all");
  const [visibleCount, setVisibleCount] = useState(25);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!isLoggedIn || !isStaff)) {
      router.push("/");
    }
  }, [mounted, isLoggedIn, isStaff, router]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff || !user?.email) return;

    let cancelled = false;

    const fetchSales = async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}&limit=500`
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Sales request failed (${res.status})`);
        }

        const data = unwrapListResponse<any>(await res.json());

        const mapped: Order[] = data.map((d: any) => ({
          id: `ORD-${d.id.toString().padStart(4, "0")}`,
          items: Array.isArray(d.items)
            ? d.items.map((i: any) => ({
                name: i.name,
                price: Number(i.price),
                qty: i.quantity,
              }))
            : [],
          total: Number(d.total_price),
          date: d.created_at,
          userEmail: d.user_email,
          userName: d.customer_name || d.user_name || "Guest",
          status: d.status,
          orderType: d.order_type || "takeout",
          tableNumber: d.table_number,
          paymentMethod: d.payment_method,
          paymentStatus: d.payment_status,
        }));

        // Only log completed sales
        const completedSales = mapped
          .filter((o) => o.status === "completed")
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (!cancelled) setSalesLog(completedSales);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("Sales history fetch issue:", err instanceof Error ? err.message : err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSales();
    const interval = setInterval(fetchSales, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mounted, isLoggedIn, isStaff, user?.email]);

  const setDateRange = (range: "today" | "7d" | "30d" | "all") => {
    setActiveRange(range);
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    setDateTo(fmt(today));
    if (range === "today") {
      setDateFrom(fmt(today));
    } else if (range === "7d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      setDateFrom(fmt(d));
    } else if (range === "30d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      setDateFrom(fmt(d));
    } else if (range === "all") {
      setDateFrom("");
      setDateTo("");
    }
  };

  const filteredSales = useMemo(() => {
    return salesLog.filter((order) => {
      // Date filter
      const d = new Date(order.date);
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
      if (from && d < from) return false;
      if (to && d > to) return false;

      // Order type filter
      if (typeFilter !== "all") {
        const orderTypeNormalized = (order.orderType || "").toLowerCase().replace(/[-_ ]/g, "");
        const targetTypeNormalized = typeFilter.replace(/[-_ ]/g, "");
        if (!orderTypeNormalized.includes(targetTypeNormalized)) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesId = order.id.toLowerCase().includes(q);
        const matchesCustomer = order.userName.toLowerCase().includes(q);
        const matchesItems = order.items.some((i) => i.name.toLowerCase().includes(q));
        const matchesTable = order.tableNumber?.toString().includes(q);
        if (!matchesId && !matchesCustomer && !matchesItems && !matchesTable) return false;
      }

      return true;
    });
  }, [salesLog, dateFrom, dateTo, typeFilter, searchTerm]);

  const filteredRevenue = useMemo(() => filteredSales.reduce((s, o) => s + o.total, 0), [filteredSales]);
  const filteredOrderCount = filteredSales.length;
  const filteredItemCount = useMemo(
    () => filteredSales.reduce((s, o) => s + o.items.reduce((acc, i) => acc + (i.qty || 1), 0), 0),
    [filteredSales]
  );
  const averageOrderValue = filteredOrderCount > 0 ? filteredRevenue / filteredOrderCount : 0;
  const displayedSales = filteredSales.slice(0, visibleCount);

  const exportCSV = () => {
    const rangeLabel = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : "all";
    let csv = "Order ID,Timestamp,Customer,Type,Table,Item Name,Qty,Price,Order Total\n";
    filteredSales.forEach((order) => {
      order.items.forEach((item) => {
        csv += `"${order.id}","${new Date(order.date).toLocaleString()}","${order.userName}","${
          order.orderType === "dine_in" || order.orderType === "Dine-In" ? "Dine-In" : "Takeout"
        }","${order.tableNumber || "N/A"}","${item.name}",${item.qty},${item.price.toFixed(2)},${order.total.toFixed(2)}\n`;
      });
    });
    csv += `\n\nSummary\n`;
    csv += `Total Completed Orders,${filteredOrderCount}\n`;
    csv += `Total Net Revenue,₱${filteredRevenue.toFixed(2)}\n`;
    csv += `Average Order Value,₱${averageOrderValue.toFixed(2)}\n`;
    csv += `Total Items Sold,${filteredItemCount}\n`;
    csv += `Date Range,"${dateFrom || "Start"} to ${dateTo || "End"}"\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `generation_bread_sales_${rangeLabel}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const rangeLabel = dateFrom && dateTo ? `${dateFrom}  →  ${dateTo}` : "All Time";
    const rangeFile = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : "all";
    const pageW = doc.internal.pageSize.getWidth();

    // Dark luxury banner
    doc.setFillColor(42, 24, 16); // #2A1810
    doc.rect(0, 0, pageW, 30, "F");

    doc.setTextColor(250, 234, 222); // #FAEADE
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("GENERATION BREAD", 14, 14);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("OFFICIAL SALES & FINANCIAL REPORT", 14, 22);

    doc.setFontSize(9);
    doc.text(`Period: ${rangeLabel}`, pageW / 2, 13, { align: "center" });
    doc.text(`Printed: ${new Date().toLocaleString()}`, pageW - 14, 13, { align: "right" });
    doc.text(`Orders: ${filteredOrderCount}  |  Items: ${filteredItemCount}`, pageW / 2, 22, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text(`Total Revenue: PHP ${filteredRevenue.toFixed(2)}`, pageW - 14, 22, { align: "right" });

    // Table Data
    const tableData = filteredSales.map((order) => [
      order.id,
      new Date(order.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
      order.userName,
      order.orderType === "dine_in" || order.orderType === "Dine-In"
        ? `Dine-In ${order.tableNumber ? `(T-${order.tableNumber})` : ""}`
        : "Takeout",
      order.items.map((i) => `${i.qty}× ${i.name}`).join("\n"),
      `PHP ${order.total.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: 36,
      head: [["Order ID", "Date & Time", "Customer", "Dining Type", "Item Breakdown", "Net Total"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [162, 104, 51], // #A26833
        textColor: [250, 234, 222],
        fontStyle: "bold",
        fontSize: 9,
        halign: "left",
      },
      alternateRowStyles: { fillColor: [250, 246, 240] },
      bodyStyles: { fontSize: 8, cellPadding: 3.5, textColor: [42, 24, 16] },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: "bold" },
        1: { cellWidth: 32 },
        2: { cellWidth: 32 },
        3: { cellWidth: 28 },
        4: { cellWidth: "auto" },
        5: { cellWidth: 26, halign: "right", fontStyle: "bold" },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(160, 140, 125);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  •  Generation Bread Tacloban City • Proprietary Financial Record`,
          pageW / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: "center" }
        );
      },
    });

    doc.save(`generation_bread_sales_${rangeFile}.pdf`);
  };

  if (!mounted || !isLoggedIn || !isStaff) return null;

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2A1810] pb-24 relative selection:bg-[#E3A458]/30">
      {/* Background Ambience */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-[#E3A458]/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-[#7F3B2D]/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Sticky Glass Navbar */}
      <header className="sticky top-0 z-40 bg-[#FFFDF9]/85 backdrop-blur-xl border-b border-[#EBE3D7] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3.5">
              <Link href="/admin" className="flex items-center gap-3 group">
                <div className="w-11 h-11 rounded-2xl bg-[#2A1810] border border-[#E3A458]/40 flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
                  <CroissantLogoIcon className="w-6 h-6 text-[#FAEADE] transition-transform duration-300 group-hover:rotate-6" />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold tracking-tight text-[#2A1810] text-sm uppercase">GENERATION</span>
                    <span className="font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#E3A458] to-[#A26833] text-sm uppercase">
                      BREAD
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A26833]">
                      Sales & Financial Ledger
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Quick Navigation Links */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <NotificationBell userEmail={user?.email} />

              <Link
                href="/staff"
                className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all"
              >
                <span>🍳 Kitchen View</span>
              </Link>

              <Link
                href="/admin"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all"
              >
                <span>📋 Orders</span>
              </Link>

              <Link
                href="/admin-dashboard"
                className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#2A1810]/75 hover:text-[#2A1810] bg-[#FFFDF9] hover:bg-[#F5EFE6] border border-[#EBE3D7] transition-all"
              >
                <span>📊 Analytics</span>
              </Link>

              <button
                onClick={() => {
                  void performLogout(signOut);
                }}
                className="flex items-center gap-1 px-3.5 sm:px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider text-[#7F3B2D] hover:text-white bg-red-50 hover:bg-[#7F3B2D] border border-red-200 hover:border-transparent transition-all shadow-xs"
              >
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Hero Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EBE3D7]/70 text-[#A26833] text-[11px] font-extrabold uppercase tracking-widest mb-2 border border-[#EBE3D7]">
              <span>📈 Financial Audit Log</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#2A1810] tracking-tight uppercase">
              Sales History & Receipts
            </h1>
            <p className="font-paragraph text-[#2A1810]/60 text-sm sm:text-base mt-1 max-w-2xl">
              Audit trail of all completed dining, takeout, and pre-orders with real-time revenue analytics and exportable financial reports.
            </p>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 bg-[#2A1810] hover:bg-[#3D2519] text-[#FAEADE] font-extrabold text-xs uppercase px-5 py-3 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95 border border-[#3D2519]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Download PDF Report</span>
            </button>

            <button
              onClick={exportCSV}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs uppercase px-5 py-3 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95 border border-emerald-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Metric Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Net Revenue */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Total Net Revenue
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-extrabold text-sm border border-emerald-200">
                ₱
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              ₱{filteredRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[#2A1810]/50 font-paragraph mt-1.5">
              Completed transactions in filter
            </p>
          </div>

          {/* Completed Orders */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Completed Orders
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold text-sm border border-amber-200">
                🧾
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              {filteredOrderCount}
            </p>
            <p className="text-xs text-[#2A1810]/50 font-paragraph mt-1.5">
              Fulfilled café orders
            </p>
          </div>

          {/* Average Order Value (AOV) */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Average Ticket (AOV)
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200">
                📊
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              ₱{averageOrderValue.toFixed(2)}
            </p>
            <p className="text-xs text-[#2A1810]/50 font-paragraph mt-1.5">
              Average revenue per order
            </p>
          </div>

          {/* Total Items Sold */}
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_rgba(42,24,16,0.05)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">
                Items Served
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#2A1810]/5 text-[#A26833] flex items-center justify-center font-bold text-sm border border-[#EBE3D7]">
                🥐
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#2A1810] font-mono tracking-tight">
              {filteredItemCount}
            </p>
            <p className="text-xs text-[#2A1810]/50 font-paragraph mt-1.5">
              Breads, pastries & beverages
            </p>
          </div>
        </div>

        {/* Filter & Search Command Panel */}
        <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_rgba(42,24,16,0.05)] mb-8 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Quick Range Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase text-[#2A1810]/50 tracking-wider mr-1">
                Period:
              </span>
              {(["all", "today", "7d", "30d"] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                    activeRange === range
                      ? "bg-[#2A1810] text-[#FAEADE] shadow-sm"
                      : "bg-[#F5EFE6] text-[#2A1810]/70 hover:bg-[#EBE3D7] hover:text-[#2A1810]"
                  }`}
                >
                  {range === "today"
                    ? "Today"
                    : range === "7d"
                    ? "Last 7 Days"
                    : range === "30d"
                    ? "Last 30 Days"
                    : "All Time"}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            <div className="flex items-center gap-2 bg-[#F5EFE6] border border-[#EBE3D7] p-1.5 rounded-2xl">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActiveRange("custom");
                }}
                className="bg-white text-[#2A1810] font-bold text-xs rounded-xl px-3 py-1.5 border border-[#EBE3D7] focus:outline-none focus:ring-2 focus:ring-[#A26833] cursor-pointer"
                title="From Date"
              />
              <span className="text-[#2A1810]/40 text-xs font-bold uppercase px-1">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActiveRange("custom");
                }}
                className="bg-white text-[#2A1810] font-bold text-xs rounded-xl px-3 py-1.5 border border-[#EBE3D7] focus:outline-none focus:ring-2 focus:ring-[#A26833] cursor-pointer"
                title="To Date"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setActiveRange("all");
                  }}
                  className="text-[10px] font-extrabold uppercase px-2 text-[#7F3B2D] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#EBE3D7]/70">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#2A1810]/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search Order ID, customer, item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#F5EFE6] border border-[#EBE3D7] rounded-xl text-xs font-paragraph text-[#2A1810] placeholder-[#2A1810]/40 focus:outline-none focus:ring-2 focus:ring-[#A26833]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#2A1810]/40 hover:text-[#2A1810]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
              {(["all", "dine_in", "takeout", "scheduled"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all whitespace-nowrap ${
                    typeFilter === t
                      ? "bg-[#2A1810] text-[#FAEADE] shadow-xs"
                      : "bg-[#F5EFE6] text-[#2A1810]/60 hover:bg-[#EBE3D7] hover:text-[#2A1810]"
                  }`}
                >
                  {t === "all"
                    ? "All Formats"
                    : t === "dine_in"
                    ? "🍽️ Dine-In"
                    : t === "takeout"
                    ? "🛍️ Takeout"
                    : "⏰ Pre-Order"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sales Ledger Table Card */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl">
            <div className="w-10 h-10 border-3 border-[#E3A458]/30 border-t-[#A26833] rounded-full animate-spin mb-4" />
            <p className="font-extrabold uppercase text-xs tracking-wider text-[#2A1810]/60">
              Loading financial transactions…
            </p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl p-16 text-center shadow-[0_4px_24px_rgba(42,24,16,0.05)]">
            <p className="text-5xl mb-4">🧾</p>
            <p className="font-extrabold uppercase text-[#2A1810] text-lg tracking-tight">
              No completed transactions match your filter
            </p>
            <p className="font-paragraph text-[#2A1810]/60 text-sm mt-1.5 max-w-md mx-auto">
              Try adjusting your date range, search query, or order format filter to view recorded sales.
            </p>
          </div>
        ) : (
          <div className="bg-[#FFFDF9] border border-[#EBE3D7] rounded-3xl shadow-[0_4px_24px_rgba(42,24,16,0.06)] overflow-hidden">
            {/* Desktop Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#2A1810] text-[#FAEADE] text-[11px] font-extrabold uppercase tracking-wider">
                    <th className="py-4 px-6">Order ID & Timestamp</th>
                    <th className="py-4 px-6">Customer</th>
                    <th className="py-4 px-6">Dining Format</th>
                    <th className="py-4 px-6">Item Breakdown</th>
                    <th className="py-4 px-6 text-right">Net Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE3D7]/70 text-sm">
                  {displayedSales.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-[#FAF6F0] transition-colors group"
                    >
                      {/* Order ID & Time */}
                      <td className="py-4 px-6 align-top">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                          <span className="font-extrabold text-[#2A1810] font-mono text-sm tracking-tight">
                            {order.id}
                          </span>
                        </div>
                        <div className="text-xs text-[#2A1810]/50 font-paragraph mt-1 flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span>
                            {new Date(order.date).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-4 px-6 align-top">
                        <div className="font-bold text-[#2A1810] flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#2A1810]/5 text-[#A26833] flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                            {order.userName.charAt(0)}
                          </div>
                          <span className="truncate">{order.userName}</span>
                        </div>
                        {order.userEmail && (
                          <div className="text-[11px] text-[#2A1810]/40 font-paragraph truncate mt-0.5 ml-9">
                            {order.userEmail}
                          </div>
                        )}
                      </td>

                      {/* Format / Table */}
                      <td className="py-4 px-6 align-top">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase border shadow-xs ${
                            order.orderType === "dine_in" || order.orderType === "Dine-In"
                              ? "bg-amber-50 text-amber-900 border-amber-200"
                              : order.orderType === "Scheduled"
                              ? "bg-blue-50 text-blue-900 border-blue-200"
                              : "bg-[#2A1810]/5 text-[#2A1810] border-[#EBE3D7]"
                          }`}
                        >
                          {order.orderType === "dine_in" || order.orderType === "Dine-In"
                            ? `🍽️ Table ${order.tableNumber || "—"}`
                            : order.orderType === "Scheduled"
                            ? "⏰ Pre-Order"
                            : "🛍️ Takeout"}
                        </span>
                      </td>

                      {/* Item Breakdown */}
                      <td className="py-4 px-6 align-top">
                        <div className="space-y-1.5 max-w-md">
                          {order.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs bg-white/80 border border-[#EBE3D7]/60 rounded-xl px-3 py-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold font-mono text-[#A26833] bg-[#A26833]/10 px-1.5 py-0.5 rounded-md text-[10px]">
                                  {item.qty}×
                                </span>
                                <span className="font-paragraph font-medium text-[#2A1810] truncate">
                                  {item.name}
                                </span>
                              </div>
                              <span className="font-bold font-mono text-[#2A1810]/70 ml-2">
                                ₱{(item.price * item.qty).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Net Total */}
                      <td className="py-4 px-6 align-top text-right">
                        <div className="font-black text-lg text-[#2A1810] font-mono">
                          ₱{order.total.toFixed(2)}
                        </div>
                        <div className="text-[10px] font-extrabold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-block mt-1">
                          ✓ Settled
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Load More Pagination */}
            {visibleCount < filteredSales.length && (
              <div className="p-6 border-t border-[#EBE3D7] flex items-center justify-between bg-[#FAF6F0]/60">
                <span className="text-xs font-bold text-[#2A1810]/60">
                  Showing {visibleCount} of {filteredSales.length} records
                </span>
                <button
                  onClick={() => setVisibleCount((prev) => prev + 25)}
                  className="bg-[#2A1810] hover:bg-[#3D2519] text-[#FAEADE] font-extrabold text-xs uppercase px-6 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  Load More Transactions
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
