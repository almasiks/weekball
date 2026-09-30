"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav({ isOrganizer }: { isOrganizer: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Главная", icon: House },
    { href: "/members", label: "Участники", icon: Users },
    ...(isOrganizer
      ? [{ href: "/admin", label: "Админ", icon: ShieldCheck }]
      : []),
  ];

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors",
                  active && "text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
