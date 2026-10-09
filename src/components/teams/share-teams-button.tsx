import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { T } from "@/lib/i18n";
import { teamsShareText, whatsappUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

type Props = {
  // Used on a server page and inside the client team builder: the caller passes its translator.
  t: T;
  startsAt: string;
  timezone: string;
  url: string;
  teams: { emoji: string; name: string; players: string[] }[];
};

export function ShareTeamsButton({ t, ...props }: Props) {
  return (
    <a
      href={whatsappUrl(teamsShareText(t, props))}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants(), "w-full bg-[#075E54] text-white hover:bg-[#064c44]")}
    >
      <MessageCircle aria-hidden />
      {t("teams.share")}
    </a>
  );
}
