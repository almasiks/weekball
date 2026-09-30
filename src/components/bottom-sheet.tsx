"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

// Mobile-friendly action sheet: slides up from the bottom, closes on backdrop / Esc.
export function BottomSheet({ open, title, onClose, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 id={titleId} className="flex-1 truncate text-base font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}
