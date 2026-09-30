import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { getAppContext } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "Weekly Football", template: "%s · Weekly Football" },
  description: "Запись на игру, команды и счёт для нашего еженедельного футбола.",
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const ctx = await getAppContext();

  return (
    <html lang="ru" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
            <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold">
              <span aria-hidden className="text-xl">⚽</span>
              <span>Weekly Football</span>
            </Link>
            {ctx.group && (
              <span className="ml-auto truncate text-sm text-muted-foreground">
                {ctx.group.name}
              </span>
            )}
          </div>
        </header>
        <main
          className={
            ctx.group
              ? "mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"
              : "mx-auto w-full max-w-md flex-1 px-4 py-6"
          }
        >
          {children}
        </main>
        {ctx.group && <BottomNav isOrganizer={ctx.role === "organizer"} />}
      </body>
    </html>
  );
}
