import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Generation Bread",
  description: "Fresh bakes from Tacloban City — cheese loaded.",
  icons: {
    icon: [
      { url: "/images/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/images/favicon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/images/favicon-48.png?v=2", sizes: "48x48", type: "image/png" },
      { url: "/favicon.png?v=2", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/images/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#523122",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="warm" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('gb_theme');if(t==='sky'||t==='warm')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
