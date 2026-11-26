"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authHeaders";
import { unwrapListResponse } from "@/lib/apiList";
import { performLogout } from "@/lib/logoutTransition";
import NotificationBell from "@/components/NotificationBell";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Period = "daily" | "weekly" | "quarterly" | "semiannual" | "yearly";
type StockFilter = "all" | "low" | "out" | "ok" | "untracked";

interface MenuRow {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  track_stock: boolean;
}

interface SoldLine {
  name: string;
  qty: number;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "semiannual", label: "Semi-annual" },
  { id: "yearly", label: "Yearly" },
];

function startOfPeriod(period: Period) {
  const now = new Date();
  if (period === "daily") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "weekly") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return start;
  }
  if (period === "quarterly") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), quarterMonth, 1);
  }
  if (period === "semiannual") {
    return new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
  }
  return new Date(now.getFullYear(), 0, 1);
}

function periodLabel(period: Period) {
  const start = startOfPeriod(period);
  const end = new Date();
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} to ${fmt(end)}`;
}

function stockStatus(item: MenuRow) {
  if (!item.track_stock) return "Not tracked";
  if (item.stock <= 0) return "Out of stock";
  if (item.stock <= 5) return "Low stock";
  return "In stock";
}

export default function AdminInventoryPage() {
  const { isLoggedIn, isStaff, user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [sold, setSold] = useState<SoldLine[]>([]);
  const [period, setPeriod] = useState<Period>("weekly");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (!isLoggedIn || !isStaff)) router.push("/");
  }, [mounted, isLoggedIn, isStaff, router]);

  useEffect(() => {
    if (!mounted || !isLoggedIn || !isStaff || !user?.email) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [menuRes, orderRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/api/auth/admin/menu/?admin_email=${encodeURIComponent(user.email)}`),
          authFetch(`${API_BASE_URL}/api/auth/admin/orders/?admin_email=${encodeURIComponent(user.email)}&limit=500`),
        ]);
        if (!menuRes.ok) throw new Error("Menu request failed");
        const menuRows = unwrapListResponse<any>(await menuRes.json()).map((item) => ({
          id: Number(item.id),
          name: String(item.name || ""),
          category: item.category === "food" ? "Food" : "Drink",
          price: Number(item.price) || 0,
          stock: Number(item.stock) || 0,
          track_stock: Boolean(item.track_stock),
        }));
        const from = startOfPeriod(period);
        const soldMap = new Map<string, number>();
        if (orderRes.ok) {
          const orders = unwrapListResponse<any>(await orderRes.json());
          orders.forEach((order) => {
            if (order.status !== "completed") return;
            const when = new Date(order.created_at);
            if (Number.isNaN(when.getTime()) || when < from) return;
            (order.items || []).forEach((line: { name?: string; quantity?: number }) => {
              const key = String(line.name || "").trim().toLowerCase();
              if (!key) return;
              soldMap.set(key, (soldMap.get(key) || 0) + Number(line.quantity || 0));
            });
          });
        }
        if (!cancelled) {
          setMenu(menuRows);
          setSold(Array.from(soldMap.entries()).map(([name, qty]) => ({ name, qty })));
        }
      } catch {
        if (!cancelled) {
          setMenu([]);
          setSold([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    load();
    return () => {
      cancelled = true;
    };
  }, [mounted, isLoggedIn, isStaff, user?.email, period]);

  const rows = useMemo(() => {
    const soldLookup = new Map(sold.map((line) => [line.name, line.qty]));
    return menu
      .map((item) => {
        const soldQty = soldLookup.get(item.name.trim().toLowerCase()) || 0;
        const status = stockStatus(item);
        const value = item.track_stock ? item.stock * item.price : 0;
        return { ...item, soldQty, status, value };
      })
      .filter((item) => {
        if (search.trim() && !item.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (stockFilter === "low") return item.status === "Low stock";
        if (stockFilter === "out") return item.status === "Out of stock";
        if (stockFilter === "ok") return item.status === "In stock";
        if (stockFilter === "untracked") return item.status === "Not tracked";
        return true;
      })
      .sort((a, b) => {
        const rank = (status: string) =>
          status === "Out of stock" ? 0 : status === "Low stock" ? 1 : status === "In stock" ? 2 : 3;
        return rank(a.status) - rank(b.status) || b.soldQty - a.soldQty || a.name.localeCompare(b.name);
      });
  }, [menu, sold, search, stockFilter]);

  const trackedCount = menu.filter((item) => item.track_stock).length;
  const attentionCount = menu.filter((item) => item.track_stock && item.stock <= 5).length;
  const unitsSold = rows.reduce((sum, item) => sum + item.soldQty, 0);
  const stockValue = menu.filter((item) => item.track_stock).reduce((sum, item) => sum + item.stock * item.price, 0);
  const rangeText = periodLabel(period);

  const exportCSV = () => {
    const lines = [
      "Item,Category,Tracking,On hand,Sold in period,Status,Unit price,Stock value",
      ...rows.map(
        (item) =>
          `"${item.name}","${item.category}","${item.track_stock ? "Yes" : "No"}",${item.track_stock ? item.stock : ""},${item.soldQty},"${item.status}",${item.price.toFixed(2)},${item.track_stock ? item.value.toFixed(2) : ""}`
      ),
      "",
      `Period,"${PERIODS.find((item) => item.id === period)?.label} (${rangeText})"`,
      `Tracked items,${trackedCount}`,
      `Low or out of stock,${attentionCount}`,
      `Units sold in period,${unitsSold}`,
      `Tracked stock value,${stockValue.toFixed(2)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `generation_bread_inventory_${period}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(42, 24, 16);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(250, 234, 222);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("GENERATION BREAD", 14, 12);
    doc.setFontSize(11);
    doc.text("Inventory Report", 14, 20);
    doc.setFontSize(9);
    doc.text(rangeText, pageW - 14, 20, { align: "right" });

    autoTable(doc, {
      startY: 36,
      head: [["Item", "Category", "On hand", "Sold", "Status", "Unit price", "Stock value"]],
      body: rows.map((item) => [
        item.name,
        item.category,
        item.track_stock ? String(item.stock) : "—",
        String(item.soldQty),
        item.status,
        `PHP ${item.price.toFixed(2)}`,
        item.track_stock ? `PHP ${item.value.toFixed(2)}` : "—",
      ]),
      headStyles: { fillColor: [162, 104, 51], textColor: [250, 234, 222], fontStyle: "bold" },
      bodyStyles: { textColor: [42, 24, 16], fontSize: 9 },
      alternateRowStyles: { fillColor: [250, 246, 240] },
    });
    doc.save(`generation_bread_inventory_${period}.pdf`);
  };

  if (!mounted || !isLoggedIn || !isStaff) return null;

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2A1810] pb-24">
      <header className="border-b border-[#EBE3D7] bg-[#FFFDF9]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/admin" className="text-sm font-black uppercase tracking-tight">
            Generation Bread
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell userEmail={user?.email} />
            <Link href="/admin-sales" className="hidden rounded-full border border-[#EBE3D7] bg-[#FFFDF9] px-4 py-2 text-xs font-extrabold uppercase tracking-wider sm:inline-flex">
              Sales
            </Link>
            <Link href="/admin-menu" className="hidden rounded-full border border-[#EBE3D7] bg-[#FFFDF9] px-4 py-2 text-xs font-extrabold uppercase tracking-wider md:inline-flex">
              Menu
            </Link>
            <button
              onClick={() => void performLogout(signOut)}
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#7F3B2D]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-[#EBE3D7] bg-[#EBE3D7]/70 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-[#A26833]">
              Stock audit
            </p>
            <h1 className="text-3xl font-black uppercase tracking-tight sm:text-4xl">Inventory Report</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#2A1810]/60 sm:text-base">
              On-hand stock, low and out-of-stock items, and units sold for the selected period. Download it as PDF or CSV.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={exportPDF} className="rounded-2xl bg-[#2A1810] px-5 py-3 text-xs font-extrabold uppercase text-[#FAEADE]">
              Download PDF
            </button>
            <button onClick={exportCSV} className="rounded-2xl bg-emerald-700 px-5 py-3 text-xs font-extrabold uppercase text-white">
              Export CSV
            </button>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Tracked items", String(trackedCount), "Menu items with inventory on"],
            ["Needs restock", String(attentionCount), "Low stock or sold out"],
            ["Sold this period", String(unitsSold), rangeText],
            ["Stock value", `₱${stockValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Tracked items only"],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-3xl border border-[#EBE3D7] bg-[#FFFDF9] p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A1810]/50">{label}</p>
              <p className="mt-2 text-2xl font-black">{value}</p>
              <p className="mt-1 text-xs text-[#2A1810]/50">{note}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-3xl border border-[#EBE3D7] bg-[#FFFDF9] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPeriod(item.id)}
                  className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider ${
                    period === item.id ? "bg-[#2A1810] text-[#FAEADE]" : "bg-[#F5EFE6] text-[#2A1810]/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item"
              className="w-full rounded-2xl border border-[#EBE3D7] bg-[#FAF6F0] px-4 py-3 text-sm outline-none lg:w-64"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["out", "Out of stock"],
                ["low", "Low stock"],
                ["ok", "In stock"],
                ["untracked", "Not tracked"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStockFilter(id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider ${
                  stockFilter === id ? "bg-[#A26833] text-white" : "bg-[#F5EFE6] text-[#2A1810]/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[#EBE3D7] bg-[#FFFDF9]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#2A1810] text-[11px] uppercase tracking-wider text-[#FAEADE]">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">On hand</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#2A1810]/50">
                    Loading inventory...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#2A1810]/50">
                    No items match this report.
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="border-t border-[#EBE3D7]">
                    <td className="px-4 py-3 font-bold">{item.name}</td>
                    <td className="px-4 py-3">{item.category}</td>
                    <td className="px-4 py-3 font-mono">{item.track_stock ? item.stock : "—"}</td>
                    <td className="px-4 py-3 font-mono">{item.soldQty}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ${
                          item.status === "Out of stock"
                            ? "bg-red-100 text-red-800"
                            : item.status === "Low stock"
                            ? "bg-amber-100 text-amber-900"
                            : item.status === "In stock"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-[#F5EFE6] text-[#2A1810]/60"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {item.track_stock ? `₱${item.value.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
