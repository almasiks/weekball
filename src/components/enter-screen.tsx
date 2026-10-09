import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnterForm } from "@/components/enter-form";
import { getT } from "@/lib/i18n/server";

// Shown instead of a page to someone this device doesn't know yet.
export async function EnterScreen() {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t("enter.title")}</CardTitle>
        <CardDescription>{t("enter.text")}</CardDescription>
      </CardHeader>
      <CardContent>
        <EnterForm />
      </CardContent>
    </Card>
  );
}
