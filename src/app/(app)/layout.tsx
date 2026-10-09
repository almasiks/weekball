import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { InstallBanner } from "@/components/install-banner";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { I18nProvider } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { getAppContext } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [ctx, locale] = await Promise.all([getAppContext(), getLocale()]);

  return (
    <I18nProvider locale={locale} messages={getMessages(locale)}>
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
            <span aria-hidden className="text-xl">⚽</span>
            <span>Weekly Football</span>
          </Link>
          <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">{ctx.group?.name}</span>
          <LocaleSwitcher />
        </div>
      </header>
      <main
        className={
          ctx.group
            ? "mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"
            : "mx-auto w-full max-w-md flex-1 px-4 py-6"
        }
      >
        {ctx.userId && <InstallBanner />}
        {children}
      </main>
      {ctx.group && <BottomNav isOrganizer={ctx.role === "organizer"} />}
    </I18nProvider>
  );
}
