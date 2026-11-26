import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 14, className = "", children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 13.05 8.5 18.4 9.55 13.05 10.6 12 15.9 10.95 10.6 5.6 9.55 10.95 8.5 12 3.2z" />
      <path d="M18.2 15.2v2.8" />
      <path d="M19.6 16.6h-2.8" />
    </Svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
      <path d="M3 4h2l2.2 11h11.3l1.8-7H7" />
    </Svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </Svg>
  );
}

export function PastryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 15c1.5-5 5-8 9-8 2.8 0 5 1.6 6.2 4" />
      <path d="M4.5 15.5h15c.6 2.2-1.2 4-4.2 4H8.2c-2.8 0-4.6-1.6-3.7-4z" />
    </Svg>
  );
}

export function CupIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 8h9v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8z" />
      <path d="M15 9h2.2a2.2 2.2 0 0 1 0 4.4H15" />
      <path d="M8 4.5c.4.8.4 1.6 0 2.4" />
      <path d="M11 4.5c.4.8.4 1.6 0 2.4" />
    </Svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3.6 2.1 4.6 5 .6-3.7 3.4.9 5-4.3-2.4-4.3 2.4.9-5L4.9 8.8l5-.6L12 3.6z" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </Svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8z" />
      <circle cx="12" cy="13" r="3" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 20v-1.5a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3V20" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.5a3 3 0 0 0-2.2-2.9" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
    </Svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8 12 4l8.5 4L12 12 3.5 8z" />
      <path d="M3.5 8v8L12 20l8.5-4V8" />
      <path d="M12 12v8" />
    </Svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-4" />
    </Svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3 6 13h6l-1 8 7-10h-6l1-8z" />
    </Svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 4h3l1 4-2 1a12 12 0 0 0 5 5l1-2 4 1v3a2 2 0 0 1-2 2A16 16 0 0 1 6 6a2 2 0 0 1 2-2z" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </Svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="5" width="12" height="15" rx="2" />
      <path d="M9 5.5h6V4H9v1.5z" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </Svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
    </Svg>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h10v18l-2-1.2L13 21l-2-1.2L9 21l-2-1.2L5 21V3h2z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 3.5 19h17L12 4z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}
