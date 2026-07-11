"use client";

import Link from "next/link";
import React from "react";

type IntroHomeLinkProps = React.ComponentProps<typeof Link>;

/** Full navigation to home so the ring intro always replays. */
export default function IntroHomeLink({ href = "/", onClick, ...props }: IntroHomeLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    window.location.href = typeof href === "string" ? href : "/";
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
