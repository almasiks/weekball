import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center">
      <p className="text-5xl" aria-hidden>
        🥅
      </p>
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <p className="text-muted-foreground">Похоже, мяч улетел за пределы поля.</p>
      <Link href="/" className={buttonVariants()}>
        На главную
      </Link>
    </div>
  );
}
