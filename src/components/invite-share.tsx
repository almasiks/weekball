"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = { inviteUrl: string; groupName: string; message?: string };

export function InviteShare({ inviteUrl, groupName, message: customMessage }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const message =
    customMessage ??
    `Присоединяйся к группе «${groupName}» в Weekly Football — отмечайся на игры здесь: ${inviteUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg border bg-muted/50 px-3 py-2.5 font-mono text-sm break-all select-all"
        aria-label="Ссылка-приглашение"
      >
        {inviteUrl}
      </div>
      <div className="flex flex-col gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants(),
            "w-full bg-[#075E54] text-white hover:bg-[#064c44]",
          )}
        >
          <MessageCircle aria-hidden />
          Поделиться в WhatsApp
        </a>
        <Button variant="outline" className="w-full" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Скопировано" : "Скопировать ссылку"}
        </Button>
      </div>
      {copyFailed && (
        <p className="text-sm text-destructive">
          Не удалось скопировать. Выделите ссылку выше и скопируйте вручную.
        </p>
      )}
    </div>
  );
}
