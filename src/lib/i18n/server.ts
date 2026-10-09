import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { errorMessage as errorText, toMessage as toText } from "@/lib/errors";
import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import { translator } from "./index";
import type { T } from "./messages";

// Language of this request: the choice saved on the device, else the phone's language, else Russian.
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return matchLocale((await headers()).get("accept-language"));
});

export async function getT(): Promise<T> {
  return translator(await getLocale());
}

// For server actions: the message in the language of the person who made the request.
export async function errorMessage(code: string): Promise<string> {
  return errorText(await getT(), code);
}

export async function toMessage(error: { message?: string } | null | undefined): Promise<string> {
  return toText(await getT(), error);
}
