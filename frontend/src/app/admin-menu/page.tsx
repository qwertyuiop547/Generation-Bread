"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authHeaders } from "@/lib/authHeaders";
import { signOut } from "next-auth/react";
import NotificationBell from "@/components/NotificationBell";
import { getMenuItemImage } from "@/constants";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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
  const { isLoggedIn, isAdmin, isStaff, user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<MenuItem>({ name: "", category: "drink", color: "brown", price: 100, description: "", bg_color: "#523122", image_url: null, is_hidden: false, stock: 0, track_stock: false });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && (!isLoggedIn || !isAdmin)) {
      router.push(isStaff ? "/staff" : "/");
    }
  }, [mounted, isLoggedIn, isAdmin, router]);

  const fetchMenu = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/menu/?admin_email=${encodeURIComponent(user.email)}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setMenuItems(data.map((d: MenuItem) => ({ ...d, category: d.category || "drink" })));
        } else {
          // If DB is empty, initialize it with defaults
          await seedDefaultMenu();
        }
      } else {
        fallbackToLocal();
      }
    } catch (err) {
      fallbackToLocal();
    } finally {
      setLoading(false);
    }
  };

  const seedDefaultMenu = async () => {
    try {
      for (const item of defaultMenu) {
        await fetch(`${API_BASE_URL}/api/auth/admin/menu/`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...item, admin_email: user?.email }),
        });
      }
      // Re-fetch
      const res = await fetch(`${API_BASE_URL}/api/auth/admin/menu/?admin_email=${encodeURIComponent(user?.email || "")}`, { headers: authHeaders() });
      if (res.ok) setMenuItems(await res.json());
    } catch (err) {
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
    if (mounted && isLoggedIn && isAdmin) {
      fetchMenu();
    }
  }, [mounted, isLoggedIn, isAdmin]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;

    const formPayload = new FormData();
    formPayload.append('name', formData.name);
    formPayload.append('category', formData.category);
    formPayload.append('color', formData.color);
    formPayload.append('price', String(formData.price));
    formPayload.append('description', formData.description);
    formPayload.append('bg_color', formData.bg_color);
    formPayload.append('is_hidden', String(formData.is_hidden));
    formPayload.append('track_stock', String(formData.track_stock || false));
    formPayload.append('stock', String(formData.stock || 0));
    formPayload.append('admin_email', user.email);
    if (imageFile) {
      formPayload.append('image', imageFile);
    }

    try {
      if (editingItem && editingItem.id) {
        // UPDATE
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/menu/${editingItem.id}/`, {
          method: "PUT",
          body: formPayload,
        });
        if (res.ok) {
          const updated = await res.json();
          setMenuItems(prev => prev.map(m => m.id === updated.id ? updated : m));
        } else {
          updateLocal(editingItem.id, formData);
        }
      } else {
        // CREATE
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/menu/`, {
          method: "POST",
          body: formPayload,
        });
        if (res.ok) {
          const created = await res.json();
          setMenuItems(prev => [...prev, created]);
        } else {
          createLocal(formData);
        }
      }
    } catch (err) {
      if (editingItem) updateLocal(editingItem.id!, formData);
      else createLocal(formData);
    }
    
    setIsModalOpen(false);
  };

  const handleDelete = async (id: number | string) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    if (!user?.email) return;

    try {
      if (typeof id === "number") {
        await fetch(`${API_BASE_URL}/api/auth/admin/menu/${id}/`, {
          method: "DELETE",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ admin_email: user.email }),
        });
      }
      const updated = menuItems.filter(m => m.id !== id);
      setMenuItems(updated);
      localStorage.setItem("spylt_menu", JSON.stringify(updated));
    } catch (err) {
      const updated = menuItems.filter(m => m.id !== id);
      setMenuItems(updated);
      localStorage.setItem("spylt_menu", JSON.stringify(updated));
    }
  };

  const handleToggleHide = async (item: MenuItem) => {
    if (!user?.email) return;
    const newStatus = !item.is_hidden;
    
    try {
      if (typeof item.id === "number") {
        const res = await fetch(`${API_BASE_URL}/api/auth/admin/menu/${item.id}/`, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...item, is_hidden: newStatus, admin_email: user.email }),
        });
        if (res.ok) {
          const updated = await res.json();
          setMenuItems(prev => prev.map(m => m.id === updated.id ? updated : m));
          return;
        }
      }
      updateLocal(item.id!, { ...item, is_hidden: newStatus });
    } catch (err) {
      updateLocal(item.id!, { ...item, is_hidden: newStatus });
    }
  };

  const updateLocal = (id: string | number, data: MenuItem) => {
    const updated = menuItems.map(m => m.id === id ? { ...m, ...data } : m);
    setMenuItems(updated);
    localStorage.setItem("spylt_menu", JSON.stringify(updated));
  };

  const createLocal = (data: MenuItem) => {
    const newItem = { ...data, id: Date.now().toString() };
    const updated = [...menuItems, newItem];
    setMenuItems(updated);
    localStorage.setItem("spylt_menu", JSON.stringify(updated));
  };

  const openNewModal = () => {
    setEditingItem(null);
    setFormData({ name: "", category: "drink", color: "brown", price: 150, description: "", bg_color: "#523122", image_url: null, is_hidden: false, stock: 0, track_stock: false });
    setImageFile(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({ ...item, category: item.category || "drink" });
    setImageFile(null);
    setImagePreview(item.image_url || null);
    setIsModalOpen(true);
  };

  if (!mounted || !isLoggedIn || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-milk relative overflow-hidden pb-20">
      {/* Background blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-light-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-milk/80 backdrop-blur-xl border-b border-dark-brown/10">
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
            <Link href="/admin-dashboard" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Analytics
            </Link>
            <Link href="/admin-sales" className="group flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Sales
            </Link>
            <Link href="/admin-tables" className="group hidden md:flex items-center gap-2 bg-dark-brown/10 hover:bg-dark-brown text-dark-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Tables
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-10 py-8 relative z-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-dark-brown uppercase tracking-tighter">Menu Items</h2>
            <p className="font-paragraph text-dark-brown/60">Manage your drinks, food, prices, and visibility.</p>
          </div>
          <button 
            onClick={openNewModal}
            className="bg-dark-brown hover:bg-[#3a2218] text-milk font-bold uppercase text-sm py-3 px-6 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Drink & Food
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item, idx) => (
              <div key={item.id || idx} className={`bg-white/50 backdrop-blur-sm border ${item.is_hidden ? 'border-red-300 opacity-70' : 'border-white/60'} rounded-3xl p-6 shadow-lg relative overflow-hidden transition-all hover:shadow-xl`}>
                <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: item.bg_color }}></div>
                <div className="w-full h-36 rounded-2xl overflow-hidden mb-4 mt-2 relative" style={{ backgroundColor: item.bg_color }}>
                  <img
                    src={getMenuItemImage(item.name, item.image_url, item.color)}
                    alt={item.name}
                    className="w-full h-full object-cover object-[center_40%]"
                  />
                </div>
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
                      onClick={() => handleDelete(item.id!)}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-dark-brown/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-milk rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-dark-brown/50 hover:text-dark-brown">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <h2 className="text-2xl font-bold text-dark-brown uppercase mb-6">{editingItem ? "Edit Menu Item" : "Add Drink or Food"}</h2>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1.5">Category</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, category: "drink" })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all border-2 ${
                      formData.category === "drink"
                        ? "bg-sky-100 border-sky-400 text-sky-900 shadow-sm"
                        : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/20"
                    }`}
                  >
                    ☕ Drink
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, category: "food" })}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase transition-all border-2 ${
                      formData.category === "food"
                        ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                        : "bg-white border-dark-brown/10 text-dark-brown/50 hover:border-dark-brown/20"
                    }`}
                  >
                    🥐 Food
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1">Item Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1">Price (₱)</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1">Card Color Hex</label>
                  <div className="flex gap-2">
                    <input type="color" value={formData.bg_color} onChange={e => setFormData({...formData, bg_color: e.target.value})} className="w-12 h-12 rounded cursor-pointer border-none p-0" />
                    <input type="text" value={formData.bg_color} onChange={e => setFormData({...formData, bg_color: e.target.value})} className="flex-1 bg-white border border-dark-brown/20 rounded-xl px-3 py-3 text-dark-brown font-paragraph text-sm focus:outline-none focus:border-light-brown" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1">Photo</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setImageFile(file);
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      } else {
                        setImagePreview(editingItem?.image_url || null);
                      }
                    }}
                    className="w-full text-sm text-dark-brown/70 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:uppercase file:bg-dark-brown/10 file:text-dark-brown hover:file:bg-dark-brown/20 file:cursor-pointer file:transition-colors cursor-pointer"
                  />
                  {imagePreview && (
                    <div className="mt-3 relative inline-block">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border border-dark-brown/10 shadow-sm">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md hover:bg-red-600 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {!imagePreview && (
                    <p className="text-[10px] text-dark-brown/40 mt-1 italic">No image uploaded — will use color-based icon</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1">Description</label>
                <textarea required rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown resize-none" />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="isHidden" checked={formData.is_hidden} onChange={e => setFormData({...formData, is_hidden: e.target.checked})} className="w-4 h-4 accent-dark-brown cursor-pointer" />
                <label htmlFor="isHidden" className="text-sm font-bold text-dark-brown cursor-pointer">Hide from public menu</label>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="trackStock" checked={formData.track_stock || false} onChange={e => setFormData({...formData, track_stock: e.target.checked})} className="w-4 h-4 accent-dark-brown cursor-pointer" />
                <label htmlFor="trackStock" className="text-sm font-bold text-dark-brown cursor-pointer">Track inventory</label>
              </div>

              {formData.track_stock && (
                <div className="mt-2">
                  <label className="block text-xs font-bold text-dark-brown/70 uppercase mb-1">Stock Quantity</label>
                  <input type="number" min="0" value={formData.stock || 0} onChange={e => setFormData({...formData, stock: parseInt(e.target.value) || 0})} className="w-full bg-white border border-dark-brown/20 rounded-xl px-4 py-3 text-dark-brown font-paragraph focus:outline-none focus:border-light-brown" />
                </div>
              )}

              <div className="pt-6 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-dark-brown/10 hover:bg-dark-brown/20 text-dark-brown font-bold uppercase py-3 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-dark-brown hover:bg-[#3a2218] text-milk font-bold uppercase py-3 rounded-xl transition-colors shadow-lg">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
