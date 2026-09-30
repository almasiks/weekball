import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Rendered with the root layout only (no header), so it brings its own frame.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-4 pt-16 text-center">
      <p className="text-5xl" aria-hidden>
        🥅
      </p>
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <p className="text-muted-foreground">Похоже, мяч улетел за пределы поля.</p>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        На главную
      </Link>
    </main>
  );
}
