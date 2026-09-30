// Static layout for offline shells: no cookies, no user data, safe to precache.
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4 font-semibold">
          <span aria-hidden className="text-xl">⚽</span>
          <span>Weekly Football</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">{children}</main>
    </>
  );
}
