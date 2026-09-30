import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberList } from "@/components/member-list";
import { Notice } from "@/components/notice";
import { getAppContext, getGroupMembers } from "@/lib/session";

export const metadata: Metadata = { title: "Участники" };

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");

  const [{ joined }, members] = await Promise.all([
    searchParams,
    getGroupMembers(ctx.group.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {joined === "1" && (
        <Notice variant="success">
          Вы в группе «{ctx.group.name}». Добро пожаловать!
        </Notice>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Участники <span className="text-muted-foreground">· {members.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MemberList members={members} currentUserId={ctx.userId} />
        </CardContent>
      </Card>
    </div>
  );
}
