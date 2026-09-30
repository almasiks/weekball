import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignupEntry } from "@/lib/games";

// Organizer view: who is on the pitch, who is late, who hasn't checked in.
export function ArrivalOverview({ going }: { going: SignupEntry[] }) {
  const arrived = going.filter((s) => s.arrival === "arrived");
  const late = going
    .filter((s) => s.arrival === "late")
    .sort((a, b) => (a.lateMinutes ?? 0) - (b.lateMinutes ?? 0));
  const pending = going.filter((s) => s.arrival === "pending");

  const groups = [
    { title: "На месте", items: arrived.map((s) => s.name), tone: "text-primary" },
    {
      title: "Опаздывают",
      items: late.map((s) => `${s.name} — на ${s.lateMinutes} мин`),
      tone: "text-amber-700 dark:text-amber-400",
    },
    { title: "Ещё не отметились", items: pending.map((s) => s.name), tone: "text-muted-foreground" },
  ];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Прибытие</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {going.length === 0 ? (
          <p className="text-sm text-muted-foreground">В составе пока никого нет.</p>
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
