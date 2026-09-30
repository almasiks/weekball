import { cn } from "@/lib/utils";

const STYLE: Record<string, { label: string; title: string; className: string }> = {
  W: { label: "В", title: "победа", className: "bg-emerald-600 text-white" },
  D: { label: "Н", title: "ничья", className: "bg-neutral-400 text-neutral-950 dark:bg-neutral-500" },
  L: { label: "П", title: "поражение", className: "bg-red-600 text-white" },
};

/** Last results, oldest → newest. Colour is always paired with a letter. */
export function FormDots({ form, className }: { form: string; className?: string }) {
  const results = form.split("").slice(-5);
  if (results.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn("inline-flex gap-0.5", className)}
      aria-label={`Форма: ${results.map((r) => STYLE[r]?.title).join(", ")}`}
    >
      {results.map((r, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "flex size-4 items-center justify-center rounded-sm text-[10px] font-bold",
            STYLE[r]?.className,
          )}
        >
          {STYLE[r]?.label}
        </span>
      ))}
    </span>
  );
}
