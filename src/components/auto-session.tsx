"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { useT } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

// One sign-in per page load, even if the component mounts twice.
let signingIn: Promise<boolean> | null = null;

function ensureSession(): Promise<boolean> {
  signingIn ??= (async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    const { error } = await supabase.auth.signInAnonymously();
    return !error;
  })();
  return signingIn;
}

// First visit of a device: nobody is asked anything. The browser quietly gets an
// anonymous session (so the data can be read), then the page loads with the game.
// It runs in the browser on purpose: link-preview robots don't run scripts, so they
// don't create accounts, and Supabase counts sign-ins per visitor, not per server.
export function AutoSession() {
  const t = useT();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureSession().then((ok) => {
      if (cancelled) return;
      if (ok) router.refresh();
      else {
        signingIn = null;
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!failed) return null;
  return (
    <div className="flex flex-col gap-3">
      <Notice variant="error">{t("common.pageError")}</Notice>
      <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
    </div>
  );
}
