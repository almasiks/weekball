import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";

// Letters and names: stats.result.<W|D|L>.label / .title
const STYLE: Record<string, string> = {
  W: "bg-emerald-600 text-white",
  D: "bg-neutral-400 text-neutral-950 dark:bg-neutral-500",
  L: "bg-red-600 text-white",
};

/** Last results, oldest → newest. Colour is always paired with a letter. */
export async function FormDots({ form, className }: { form: string; className?: string }) {
  const t = await getT();
  const text = (r: string, part: "label" | "title") => (STYLE[r] ? t(`stats.result.${r}.${part}` as MessageKey) : "");
  const results = form.split("").slice(-5);
  if (results.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn("inline-flex gap-0.5", className)}
      aria-label={t("stats.form", { results: results.map((r) => text(r, "title")).join(", ") })}
    >
      {results.map((r, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "flex size-4 items-center justify-center rounded-sm text-[10px] font-bold",
            STYLE[r],
          )}
        >
          {text(r, "label")}
        </span>
      ))}
    </span>
  );
}
