"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/session";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/datetime";
import type { T } from "@/lib/i18n";
import { errorMessage, getT, toMessage } from "@/lib/i18n/server";
import { readInt, readText, type FormState } from "@/lib/forms";
import type { ArrivalStatus, GameStatus } from "@/lib/supabase/database.types";

export type ActionResult = { error?: string };

const LATE_OPTIONS = [5, 10, 15, 30];

function revalidateGame(gameId: string) {
  revalidatePath("/");
  revalidatePath(`/game/${gameId}`);
}

export async function setSignupAction(
  gameId: string,
  wantsToCome: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_signup", {
    p_game_id: gameId,
    wants_to_come: wantsToCome,
  });
  if (error) return { error: await toMessage(error) };
  revalidateGame(gameId);
  return {};
}

export async function setArrivalAction(
  gameId: string,
  arrival: ArrivalStatus,
  lateMinutes?: number,
): Promise<ActionResult> {
  if (arrival === "late" && !LATE_OPTIONS.includes(lateMinutes ?? 0)) {
    return { error: await errorMessage("invalid_late_minutes") };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_arrival", {
    p_game_id: gameId,
    p_arrival: arrival,
    p_late_minutes: arrival === "late" ? lateMinutes : null,
  });
  if (error) return { error: await toMessage(error) };
  revalidateGame(gameId);
  return {};
}

export async function setGameStatusAction(
  gameId: string,
  status: Extract<GameStatus, "signup" | "closed" | "cancelled">,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_game_status", {
    p_game_id: gameId,
    new_status: status,
  });
  if (error) return { error: await toMessage(error) };
  revalidateGame(gameId);
  return {};
}

// --- Schedules & one-off games (organizer only; RLS enforces it too) ---

type ScheduleInput = {
  weekday: number;
  start_time: string;
  place: string;
  max_players: number;
  goal_limit: number | null;
  match_minutes: number;
};

// Match format fields (see FormatFields): "no limit" checkbox wins over the number.
function readFormat(t: T, formData: FormData): { goal_limit: number | null; match_minutes: number } | string {
  const noLimit = formData.get("noGoalLimit") === "on";
  const goalLimit = readInt(formData, "goalLimit");
  const minutes = readInt(formData, "matchMinutes");
  if (!noLimit && (goalLimit === null || goalLimit < 1 || goalLimit > 20)) {
    return t("schedule.error.goalLimit");
  }
  if (minutes === null || minutes < 1 || minutes > 60) return t("schedule.error.matchMinutes");
  return { goal_limit: noLimit ? null : goalLimit, match_minutes: minutes };
}

function readScheduleForm(t: T, formData: FormData): ScheduleInput | string {
  const weekday = readInt(formData, "weekday");
  const startTime = readText(formData, "startTime");
  const place = readText(formData, "place");
  const maxPlayers = readInt(formData, "maxPlayers");

  if (weekday === null || weekday < 0 || weekday > 6) return t("schedule.error.weekday");
  if (!/^\d{2}:\d{2}$/.test(startTime)) return t("schedule.error.startTime");
  if (place.length > 120) return t("schedule.error.placeTooLong");
  if (maxPlayers === null || maxPlayers < 2 || maxPlayers > 100) {
    return t("schedule.error.maxPlayers");
  }
  const format = readFormat(t, formData);
  if (typeof format === "string") return format;
  return { weekday, start_time: startTime, place, max_players: maxPlayers, ...format };
}

async function requireOrganizerGroup() {
  const ctx = await getAppContext();
  if (!ctx.group || ctx.role !== "organizer") return null;
  return ctx.group;
}

function revalidateSchedule() {
  revalidatePath("/");
  revalidatePath("/admin/schedule");
}

export async function createScheduleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: await errorMessage("not_organizer") };

  const t = await getT();
  const input = readScheduleForm(t, formData);
  if (typeof input === "string") return { error: input };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .insert({ ...input, group_id: group.id, timezone: DEFAULT_TIMEZONE });
  if (error) return { error: await toMessage(error) };

  revalidateSchedule();
  return { ok: true };
}

export async function updateScheduleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: await errorMessage("not_organizer") };

  const scheduleId = readText(formData, "scheduleId");
  const t = await getT();
  const input = readScheduleForm(t, formData);
  if (typeof input === "string") return { error: input };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update(input)
    .eq("id", scheduleId)
    .eq("group_id", group.id)
    .select("id");
  if (error) return { error: await toMessage(error) };
  if (!data?.length) return { error: t("schedule.error.saveFailed") };

  revalidateSchedule();
  return { ok: true };
}

export async function toggleScheduleAction(
  scheduleId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: await errorMessage("not_organizer") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ is_active: isActive })
    .eq("id", scheduleId)
    .eq("group_id", group.id)
    .select("id");
  if (error) return { error: await toMessage(error) };
  if (!data?.length) return { error: (await getT())("schedule.error.toggleFailed") };

  revalidateSchedule();
  return {};
}

export async function createGameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: await errorMessage("not_organizer") };

  const t = await getT();
  const date = readText(formData, "date");
  const time = readText(formData, "time");
  const place = readText(formData, "place");
  const maxPlayers = readInt(formData, "maxPlayers");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: t("schedule.error.date") };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: t("schedule.error.startTime") };
  if (place.length > 120) return { error: t("schedule.error.placeLong") };
  if (maxPlayers === null || maxPlayers < 2 || maxPlayers > 100) {
    return { error: t("schedule.error.maxPlayers") };
  }
  const format = readFormat(t, formData);
  if (typeof format === "string") return { error: format };

  const startsAt = zonedTimeToUtc(date, time, DEFAULT_TIMEZONE);
  if (startsAt.getTime() <= Date.now()) {
    return { error: t("schedule.error.past") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("games").insert({
    group_id: group.id,
    starts_at: startsAt.toISOString(),
    place,
    max_players: maxPlayers,
    timezone: DEFAULT_TIMEZONE,
    ...format,
  });
  if (error) return { error: await toMessage(error) };

  revalidateSchedule();
  return { ok: true };
}
