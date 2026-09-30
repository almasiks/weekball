import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { InstallBanner } from "@/components/install-banner";
import { getAppContext } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getAppContext();

  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold">
            <span aria-hidden className="text-xl">⚽</span>
            <span>Weekly Football</span>
          </Link>
          {ctx.group && (
            <span className="ml-auto truncate text-sm text-muted-foreground">{ctx.group.name}</span>
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
        {ctx.userId && <InstallBanner />}
        {children}
      </main>
      {ctx.group && <BottomNav isOrganizer={ctx.role === "organizer"} />}
    </>
  );
}
