import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignupEntry } from "@/lib/games";
import { getT } from "@/lib/i18n/server";

// Organizer view: who is on the pitch, who is late, who hasn't checked in.
export async function ArrivalOverview({ going }: { going: SignupEntry[] }) {
  const t = await getT();
  const arrived = going.filter((s) => s.arrival === "arrived");
  const late = going
    .filter((s) => s.arrival === "late")
    .sort((a, b) => (a.lateMinutes ?? 0) - (b.lateMinutes ?? 0));
  const pending = going.filter((s) => s.arrival === "pending");

  const groups = [
    { title: t("arrival.onPitch"), items: arrived.map((s) => s.name), tone: "text-primary" },
    {
      title: t("arrival.lateGroup"),
      items: late.map((s) => t("arrival.lateItem", { name: s.name, minutes: s.lateMinutes ?? 0 })),
      tone: "text-amber-700 dark:text-amber-400",
    },
    { title: t("arrival.notMarked"), items: pending.map((s) => s.name), tone: "text-muted-foreground" },
  ];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("arrival.overview")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {going.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("arrival.empty")}</p>
        ) : (
          groups.map((g) => (
            <div key={g.title}>
              <p className={`text-sm font-medium ${g.tone}`}>
                {g.title} · {g.items.length}
              </p>
              {g.items.length > 0 && (
                <p className="text-sm">{g.items.join(", ")}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
