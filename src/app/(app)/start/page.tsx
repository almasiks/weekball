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

export const metadata: Metadata = { title: "Новая группа" };

export default async function StartPage() {
  const ctx = await getAppContext();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Новая группа</CardTitle>
        <CardDescription>
          Вы станете организатором и получите ссылку-приглашение для чата.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateGroupForm defaultName={ctx.player?.name} />
      </CardContent>
    </Card>
  );
}
