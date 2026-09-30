import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth redirect target for both Google sign-in and Google linking.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const errorCode = searchParams.get("error_code") ?? searchParams.get("error");

  if (errorCode) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(errorCode)}`, origin),
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/?auth=google", origin));
    }
  }

  return NextResponse.redirect(new URL("/?auth_error=callback_failed", origin));
}
