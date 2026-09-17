"use client";

import Image from "next/image";
import { useTheme } from "@/context/ThemeContext";

type BrandLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  /** Prefer light stroke logo for dark photo panels (login hero, etc.) */
  onDark?: boolean;
  priority?: boolean;
};

const BrandLogo = ({
  className = "h-7 w-auto sm:h-8 md:h-10 cursor-pointer",
  width = 220,
  height = 55,
  onDark = false,
  priority = false,
}: BrandLogoProps) => {
  const { theme } = useTheme();

  const src =
    theme === "sky"
      ? "/images/nav-logo-sky.svg"
      : onDark
        ? "/images/nav-logo-on-dark.svg"
        : "/images/nav-logo.svg";

  return (
    <Image
      priority={priority}
      width={width}
      height={height}
      src={src}
      alt="Generation Bread"
      unoptimized
      className={className}
    />
  );
};

export default BrandLogo;
