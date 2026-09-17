"use client";

import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";

interface ReceiptItem {
  name: string;
  price: number;
  qty: number;
}

interface ReceiptOrder {
  id: string;
  items: ReceiptItem[];
  total: number;
  totalItems: number;
  date: string;
  userName: string;
  userEmail: string;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
}

interface ReceiptModalProps {
  order: ReceiptOrder | null;
  onClose: () => void;
}

export default function ReceiptModal({ order, onClose }: ReceiptModalProps) {
  const receiptCardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!order) return null;

  const handleDownload = async () => {
    if (!receiptCardRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(receiptCardRef.current, {
        scale: 3,
        backgroundColor: "#fffdfa",
      });
      const link = document.createElement("a");
      link.download = `Generation-Bread-Receipt-${order.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Receipt capture error", err);
    } finally {
      setDownloading(false);
    }
  };

  const vatAmount = order.total * 0.12;
  const subtotal = order.total - vatAmount;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-dark-brown/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-light-brown/20 bg-milk shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-dark-brown/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧾</span>
            <h3 className="text-base font-bold uppercase tracking-tight text-dark-brown">
              Official Cafe Receipt
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-dark-brown/50 transition-colors hover:bg-dark-brown/10 hover:text-dark-brown"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Receipt Slip */}
        <div className="overflow-y-auto p-6">
          <div
            ref={receiptCardRef}
            className="rounded-2xl border border-[#e8d5c4] bg-[#fffdfa] p-6 shadow-sm font-paragraph text-dark-brown"
          >
            {/* Bakery Brand */}
            <div className="text-center pb-4 border-b border-dashed border-[#d5beaa]">
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-light-brown">
                Fresh From The Oven
              </p>
              <h2 className="text-2xl font-bold uppercase tracking-tight text-dark-brown mt-1">
                Generation Bread
              </h2>
              <p className="text-xs text-dark-brown/60 mt-0.5">
                Artisanal Bakery & Cafe · Tacloban City
              </p>
            </div>

            {/* Order Metadata */}
            <div className="grid grid-cols-2 gap-2 text-xs py-3 border-b border-dashed border-[#d5beaa]">
              <div>
                <span className="text-dark-brown/50 block text-[10px] uppercase font-bold">Order ID</span>
                <span className="font-bold text-dark-brown text-sm">{order.id}</span>
              </div>
              <div className="text-right">
                <span className="text-dark-brown/50 block text-[10px] uppercase font-bold">Date</span>
                <span className="text-dark-brown">{new Date(order.date).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-dark-brown/50 block text-[10px] uppercase font-bold">Customer</span>
                <span className="font-medium text-dark-brown">{order.userName || "Guest"}</span>
              </div>
              <div className="text-right">
                <span className="text-dark-brown/50 block text-[10px] uppercase font-bold">Payment</span>
                <span className="font-bold uppercase text-emerald-700">
                  {order.paymentStatus === "paid" ? "PAID" : "UNPAID"} ({order.paymentMethod || "CASH"})
                </span>
              </div>
            </div>

            {/* Items Breakdown */}
            <div className="py-4 border-b border-dashed border-[#d5beaa] space-y-2.5">
              <div className="flex justify-between text-[10px] uppercase font-bold text-dark-brown/45">
                <span>Item</span>
                <span>Amount</span>
              </div>
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs items-baseline">
                  <div className="flex items-baseline gap-2 pr-2">
                    <span className="font-bold tabular-nums text-light-brown">{item.qty}×</span>
                    <span className="font-medium text-dark-brown leading-tight">{item.name}</span>
                  </div>
                  <span className="font-bold tabular-nums text-dark-brown shrink-0">
                    ₱{(item.price * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-dark-brown/70">
                <span>Subtotal (Net of VAT)</span>
                <span className="tabular-nums">₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-dark-brown/70">
                <span>12% VAT (Inclusive)</span>
                <span className="tabular-nums">₱{vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#d5beaa] text-base font-bold text-dark-brown">
                <span className="uppercase tracking-wide">TOTAL DUE</span>
                <span className="text-xl text-dark-brown tabular-nums">₱{order.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Footer / Barcode */}
            <div className="text-center pt-6 text-[11px] text-dark-brown/55 space-y-1">
              <p className="font-bold text-dark-brown">Salamat for supporting local bakes!</p>
              <p className="text-[10px]">Follow us: @generationbread</p>
              <div className="pt-3 flex justify-center">
                <div className="h-7 w-48 bg-gradient-to-r from-dark-brown via-black to-dark-brown opacity-20 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-dark-brown/10 bg-milk/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-dark-brown/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-dark-brown hover:bg-dark-brown/20 transition-all"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 rounded-full bg-dark-brown px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-milk shadow-md hover:bg-dark-brown-hover transition-all active:scale-95 disabled:opacity-50"
          >
            {downloading ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-milk/30 border-t-milk" />
                Saving...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PNG
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
