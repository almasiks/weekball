import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";

// display: optional — no late font swap (it delayed LCP on slow phones);
// the system font is used until Geist is cached.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "optional",
});

const DESCRIPTION = "Запись на игру, команды, live-счёт и статистика нашего еженедельного футбола.";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  applicationName: "Weekly Football",
  title: { default: "Weekly Football", template: "%s · Weekly Football" },
  description: DESCRIPTION,
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Футбол" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "Weekly Football",
    locale: "ru_RU",
    title: "Weekly Football",
    description: DESCRIPTION,
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
  twitter: { card: "summary", title: "Weekly Football", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Root layout stays static (no cookies): the offline shells in (shell) are precached.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* cacheOnNavigation off: pages contain personal data and must not land in the SW cache. */}
        <SerwistProvider swUrl="/serwist/sw.js" cacheOnNavigation={false} reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
