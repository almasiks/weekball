import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateGroupForm } from "@/components/create-group-form";
import { getAppContext } from "@/lib/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("start.title") };
}

export default async function StartPage() {
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("start.title")}</CardTitle>
        <CardDescription>{t("start.text")}</CardDescription>
      </CardHeader>
      <CardContent>
        <CreateGroupForm defaultName={ctx.player?.name} />
      </CardContent>
    </Card>
  );
}
