"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, ChartColumn, History, ShieldCheck, Timer, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LIVE_CONSOLE = /^\/game\/[^/]+\/live/;

// App-like tab bar, fixed to the bottom on every page.
// Players: Игра · Матч · Статистика · История · Профиль.
// Organizers get "Админ" instead of "История" (history stays one tap away in "Статистика").
export function BottomNav({ isOrganizer }: { isOrganizer: boolean }) {
  const pathname = usePathname();
  const t = useT();

  const onMatch = pathname.startsWith("/match") || LIVE_CONSOLE.test(pathname);
  const items: { href: string; label: string; icon: typeof Timer; active: boolean }[] = [
    {
      href: "/",
      label: t("nav.game"),
      icon: CalendarCheck,
      active: pathname === "/" || (pathname.startsWith("/game") && !onMatch),
    },
    { href: "/match", label: t("nav.match"), icon: Timer, active: onMatch },
    {
      href: "/stats",
      label: t("nav.stats"),
      icon: ChartColumn,
      active:
        ["/stats", "/players"].some((p) => pathname.startsWith(p)) ||
        (isOrganizer && ["/history", "/results"].some((p) => pathname.startsWith(p))),
    },
    isOrganizer
      ? {
          href: "/admin",
          label: t("nav.admin"),
          icon: ShieldCheck,
          active: pathname.startsWith("/admin"),
        }
      : {
          href: "/history",
          label: t("nav.history"),
          icon: History,
          active: ["/history", "/results"].some((p) => pathname.startsWith(p)),
        },
    {
      href: "/profile",
      label: t("nav.profile"),
      icon: UserRound,
      active: ["/profile", "/roster"].some((p) => pathname.startsWith(p)) || (!isOrganizer && pathname.startsWith("/admin")),
    },
  ];

  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={href} className="min-w-0 flex-1">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium text-muted-foreground transition-colors",
                active && "text-primary",
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.4]")} aria-hidden />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
