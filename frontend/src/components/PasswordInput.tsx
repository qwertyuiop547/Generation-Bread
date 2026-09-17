"use client";

import React, { useState } from "react";

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
  inputClassName?: string;
}

export default function PasswordInput({
  className = "",
  inputClassName = "",
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  id,
  name,
  disabled,
  ...props
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  const defaultInputClass =
    "w-full rounded-2xl border border-light-brown/45 bg-milk px-4 py-3.5 pr-12 font-paragraph text-base text-dark-brown outline-none transition-all placeholder:text-dark-brown/35 focus:border-light-brown focus:bg-milk focus:ring-2 focus:ring-light-brown/30 [color-scheme:light] autofill:shadow-[inset_0_0_0_1000px_var(--color-milk)]";

  return (
    <div className={`relative w-full ${className}`}>
      <input
        {...props}
        id={id}
        name={name}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className={`${defaultInputClass} ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => setShow((prev) => !prev)}
        disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-dark-brown/50 transition-all duration-200 hover:bg-dark-brown/5 hover:text-dark-brown active:scale-90 focus:outline-none focus:ring-2 focus:ring-light-brown/40"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? (
          /* Eye-Off Icon */
          <svg
            className="size-5 transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .698 10.747 10.747 0 0 1-5.005 5.717" />
            <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
            <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.35a1 1 0 0 1 0-.698 10.75 10.75 0 0 1 2.92-4.499" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          /* Eye Icon */
          <svg
            className="size-5 transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
