"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button size="lg" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      Попробовать снова
    </Button>
  );
}
