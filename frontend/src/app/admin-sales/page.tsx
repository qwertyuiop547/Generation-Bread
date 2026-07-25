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
}

export default function AdminSalesPage() {
  const { isLoggedIn, isAdmin, isStaff, user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [salesLog, setSalesLog] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

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
                qty: i.quantity}))
            : [],
          total: Number(d.total_price),
          date: d.created_at,
          userEmail: d.user_email,
          userName: d.customer_name || d.user_name || "Guest",
          status: d.status,
          orderType: d.order_type,
          tableNumber: d.table_number}));

        // Only log completed sales
        const completedSales = mapped
          .filter((o) => o.status === "completed")
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (!cancelled) setSalesLog(completedSales);
      } catch (err) {
        // Avoid spamming the console on every poll tick when the backend is briefly unavailable
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "Sales history fetch issue:",
            err instanceof Error ? err.message : err
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSales();
    const interval = setInterval(fetchSales, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mounted, isLoggedIn, isStaff, user?.email]);

  const filteredSales = useMemo(() => {
    if (!dateFrom && !dateTo) return salesLog;
    return salesLog.filter(order => {
      const d = new Date(order.date);
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [salesLog, dateFrom, dateTo]);

  const filteredRevenue = filteredSales.reduce((s, o) => s + o.total, 0);
  const filteredOrderCount = filteredSales.length;
  const displayedSales = filteredSales.slice(0, visibleCount);

  const setDateRange = (range: string) => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
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

  const exportCSV = () => {
    const rangeLabel = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : "all";
    let csv = "Order ID,Timestamp,Customer,Type,Table,Item Name,Qty,Price,Order Total\n";
    filteredSales.forEach(order => {
      order.items.forEach(item => {
        csv += `"${order.id}","${new Date(order.date).toLocaleString()}","${order.userName}","${order.orderType === 'dine_in' ? 'Dine-In' : 'Takeout'}","${order.tableNumber || 'N/A'}","${item.name}",${item.qty},${item.price.toFixed(2)},${order.total.toFixed(2)}\n`;
      });
    });
    csv += `\n\nSummary\n`;
    csv += `Total Orders,${filteredOrderCount}\n`;
    csv += `Total Revenue,${filteredRevenue.toFixed(2)}\n`;
    csv += `Date Range,"${dateFrom || 'Start'} to ${dateTo || 'End'}"\n`;
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spylt_sales_${rangeLabel}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const rangeLabel = dateFrom && dateTo ? `${dateFrom}  →  ${dateTo}` : "All Time";
    const rangeFile  = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : "all";
    const pageW = doc.internal.pageSize.getWidth();

    // ── Dark header banner ──────────────────────────────────────────────
    doc.setFillColor(52, 31, 21);           // dark-brown
    doc.rect(0, 0, pageW, 28, "F");

    doc.setTextColor(250, 234, 222);        // milk
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Generation Bread", 14, 13);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Sales Report", 14, 20);

    doc.setFontSize(9);
    doc.text(`Date Range: ${rangeLabel}`, pageW / 2, 13, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, 13, { align: "right" });
    doc.text(`Total Orders: ${filteredOrderCount}`, pageW / 2, 21, { align: "center" });
    doc.text(`Total Revenue: ₱${filteredRevenue.toFixed(2)}`, pageW - 14, 21, { align: "right" });

    // ── Table ───────────────────────────────────────────────────────────
    const tableData = filteredSales.map(order => [
      order.id,
      new Date(order.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
      order.userName,
      order.orderType === "dine_in" ? "Dine-In" : "Takeout",
      order.tableNumber || "—",
      order.items.map(i => `${i.qty}× ${i.name}`).join("\n"),
      `₱${order.total.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: 34,
      head: [["Order ID", "Date & Time", "Customer", "Type", "Table", "Items", "Total"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [139, 90, 43],
        textColor: [250, 234, 222],
        fontStyle: "bold",
        fontSize: 9,
        halign: "left"},
      alternateRowStyles: { fillColor: [253, 246, 239] },
      bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [52, 31, 21] },
      columnStyles: {
        0: { cellWidth: 25, fontStyle: "bold" },
        1: { cellWidth: 32 },
        2: { cellWidth: 30 },
        3: { cellWidth: 20 },
        4: { cellWidth: 16 },
        5: { cellWidth: "auto" },
        6: { cellWidth: 22, halign: "right", fontStyle: "bold" }},
      didDrawPage: (data) => {
        // Footer on each page
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(150, 120, 100);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  •  Generation Bread Sales Report`,
          pageW / 2,
          doc.internal.pageSize.getHeight() - 5,
          { align: "center" }
        );
      }});

    doc.save(`spylt_sales_${rangeFile}.pdf`);
  };

  if (!mounted || !isLoggedIn || !isStaff) return null;

  return (
    <div className="min-h-screen app-canvas relative overflow-hidden pb-20">
      <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      
      {/* Header */}
      <div className="sticky top-0 z-40 app-header-bar backdrop-blur-xl border-b border-dark-brown/10">
        <div className="flex items-center justify-between px-5 md:px-10 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-dark-brown font-bold uppercase text-lg md:text-xl tracking-tight">Sales History</h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell userEmail={user?.email} />
            <Link href="/admin" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md">
              Orders
            </Link>
            <Link href="/admin-dashboard" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md">
              Analytics
            </Link>
            <button onClick={() => { void performLogout(signOut); }} className="group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-10 py-8 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-dark-brown uppercase tracking-tighter">Sales Log</h2>
            <p className="font-paragraph text-dark-brown/60">Foundation log for AI Forecasting & Demand Prediction.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportCSV} className="bg-green-700 hover:bg-green-800 text-white font-bold uppercase text-xs py-2 px-4 rounded-full shadow-md hover:shadow-lg transition-all flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              CSV
            </button>
            <button onClick={exportPDF} className="bg-red-700 hover:bg-red-800 text-white font-bold uppercase text-xs py-2 px-4 rounded-full shadow-md hover:shadow-lg transition-all flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              PDF
            </button>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="app-panel border rounded-3xl p-5 md:p-6 shadow-lg mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-dark-brown/60 uppercase">Quick:</span>
            {["today", "7d", "30d", "all"].map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className="bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs uppercase px-3 py-1.5 rounded-full transition-all"
              >
                {range === "today" ? "Today" : range === "7d" ? "Last 7 Days" : range === "30d" ? "Last 30 Days" : "All Time"}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto bg-white/70 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/60 relative z-10">
              <div className="relative group">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-transparent text-dark-brown font-bold text-xs rounded-xl pl-3 pr-8 py-2 w-[130px] focus:outline-none group-hover:bg-dark-brown/5 transition-colors cursor-pointer appearance-none relative z-20 
                  [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-light-brown pointer-events-none group-hover:scale-110 transition-transform z-10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
              </div>
              
              <span className="text-light-brown/50 text-[10px] font-black uppercase tracking-widest px-1">to</span>
              
              <div className="relative group">
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="bg-transparent text-dark-brown font-bold text-xs rounded-xl pl-3 pr-8 py-2 w-[130px] focus:outline-none group-hover:bg-dark-brown/5 transition-colors cursor-pointer appearance-none relative z-20 
                  [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-light-brown pointer-events-none group-hover:scale-110 transition-transform z-10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
          <div className="app-panel border rounded-3xl p-5 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-sm mb-1">Orders in Range</p>
            <p className="text-3xl font-bold text-dark-brown">{filteredOrderCount}</p>
          </div>
          <div className="app-panel border rounded-3xl p-5 shadow-lg">
            <p className="font-paragraph text-dark-brown/50 text-sm mb-1">Revenue in Range</p>
            <p className="text-2xl md:text-3xl font-bold text-dark-brown">P{filteredRevenue.toFixed(2)}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" /></div>
        ) : salesLog.length === 0 ? (
          <div className="text-center py-20 text-dark-brown/50 font-bold uppercase">No completed sales found for the selected range.</div>
        ) : (
          <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-xl overflow-hidden border border-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-dark-brown text-milk text-xs uppercase tracking-wider">
                    <th className="p-4 font-bold">Order ID / Date</th>
                    <th className="p-4 font-bold">Customer</th>
                    <th className="p-4 font-bold">Type / Table</th>
                    <th className="p-4 font-bold">Item Details</th>
                    <th className="p-4 font-bold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-brown/10 text-sm font-medium text-dark-brown">
                  {displayedSales.map((order) => (
                    <tr key={order.id} className="hover:bg-light-brown/5 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-bold">{order.id}</div>
                        <div className="text-xs text-dark-brown/60 mt-1">{new Date(order.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                      </td>
                      <td className="p-4 align-top">
                        <div className="capitalize">{order.userName}</div>
                      </td>
                      <td className="p-4 align-top">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${order.orderType === 'dine_in' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                          {order.orderType === 'dine_in' ? 'Dine-In' : 'Takeout'}
                        </span>
                        {order.tableNumber && (
                          <div className="text-xs mt-2 font-bold text-dark-brown/60">Table: {order.tableNumber}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <ul className="space-y-2">
                          {order.items.map((item, idx) => (
                            <li key={idx} className="flex justify-between items-center text-xs bg-white p-2 rounded-lg border border-dark-brown/5">
                              <span><span className="font-bold text-light-brown">{item.qty}x</span> {item.name}</span>
                              <span className="text-dark-brown/60">₱{item.price.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-4 align-top text-right font-bold text-lg text-light-brown">
                        ₱{order.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleCount < filteredSales.length && (
              <div className="p-5 md:p-6 border-t border-dark-brown/10 flex justify-center bg-white/50">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 20)}
                  className="bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2.5 px-6 transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
