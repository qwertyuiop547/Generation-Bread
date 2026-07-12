"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { performLogout } from "@/lib/logoutTransition";
import BrandLogo from "@/components/BrandLogo";

const Navbar = () => {
  const { isLoggedIn, isAdmin, user } = useAuth();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [solidNav, setSolidNav] = useState(!isHome);

  useEffect(() => {
    setSolidNav(!isHome);
  }, [isHome]);

  const handleLogout = async () => {
    await performLogout(signOut);
  };

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 px-3 py-2.5 md:p-9 flex justify-between items-center gap-3 transition-colors duration-300 ${
        solidNav
          ? "bg-milk/90 backdrop-blur-md border-b border-dark-brown/5"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <Link href="/" className="shrink-0">
        <BrandLogo priority />
      </Link>
      <div className="flex items-center gap-2 sm:gap-4 md:gap-8 md:pr-4 shrink-0">
        {isLoggedIn ? (
          <>
            <Link
              href={isAdmin ? "/admin" : "/dashboard"}
              className="text-dark-brown font-bold uppercase text-xs sm:text-sm md:text-lg hover:text-light-brown transition-colors"
            >
              {isAdmin ? "Admin" : "Dashboard"}
            </Link>
            {!isAdmin && (
              <Link
                href="/track"
                className="text-dark-brown font-bold uppercase text-xs sm:text-sm md:text-lg hover:text-light-brown transition-colors"
              >
                Track
              </Link>
            )}
            <span className="text-dark-brown font-paragraph text-sm md:text-base hidden md:block">
              Hi, <strong>{user?.name}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="group flex items-center gap-2 bg-red-brown/10 hover:bg-red-brown text-red-brown hover:text-milk font-bold text-xs md:text-sm uppercase rounded-full py-2 px-4 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              Logout
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-dark-brown font-bold uppercase text-xs sm:text-sm md:text-lg hover:text-light-brown transition-colors whitespace-nowrap">
              Login
            </Link>
            <Link href="/register" className="text-dark-brown bg-light-brown hover:bg-mid-brown hover:text-milk transition-colors uppercase font-bold text-xs sm:text-sm md:text-lg rounded-full py-2 px-3.5 sm:px-6 md:py-3 md:px-10 shadow-lg whitespace-nowrap">
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
