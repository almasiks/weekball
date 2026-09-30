import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { teamsShareText, whatsappUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

type Props = {
  startsAt: string;
  timezone: string;
  url: string;
  teams: { emoji: string; name: string; players: string[] }[];
};

export function ShareTeamsButton(props: Props) {
  return (
    <a
      href={whatsappUrl(teamsShareText(props))}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants(), "w-full bg-[#075E54] text-white hover:bg-[#064c44]")}
    >
      <MessageCircle aria-hidden />
      Поделиться составами в WhatsApp
    </a>
  );
}
