import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SoundsManager } from "@/components/admin/sounds-manager";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("sounds.title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SoundsPage({ searchParams }: PageProps<"/admin/sounds">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");
  if (ctx.role !== "organizer") redirect("/admin");

  const [supabase, t, { from }] = await Promise.all([createClient(), getT(), searchParams]);
  // Opened from the match console ("Добавить звук"): the back link returns there.
  const matchHref = typeof from === "string" && UUID.test(from) ? `/game/${from}/live` : null;
  const { data: sounds } = await supabase
    .from("sounds")
    .select("id, name, file_path, builtin_key, sort_order")
    .eq("group_id", ctx.group.id)
    .order("sort_order");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={matchHref ?? "/admin"}
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {matchHref ? t("sounds.toMatch") : t("nav.admin")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("sounds.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("sounds.pageText")}
        </p>
      </header>
      <SoundsManager groupId={ctx.group.id} sounds={sounds ?? []} />
    </div>
  );
}
