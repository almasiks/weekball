"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/session";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/datetime";
import { errorMessage, toMessage } from "@/lib/errors";
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
  if (error) return { error: toMessage(error) };
  revalidateGame(gameId);
  return {};
}

export async function setArrivalAction(
  gameId: string,
  arrival: ArrivalStatus,
  lateMinutes?: number,
): Promise<ActionResult> {
  if (arrival === "late" && !LATE_OPTIONS.includes(lateMinutes ?? 0)) {
    return { error: errorMessage("invalid_late_minutes") };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_arrival", {
    p_game_id: gameId,
    p_arrival: arrival,
    p_late_minutes: arrival === "late" ? lateMinutes : null,
  });
  if (error) return { error: toMessage(error) };
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
  if (error) return { error: toMessage(error) };
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
function readFormat(formData: FormData): { goal_limit: number | null; match_minutes: number } | string {
  const noLimit = formData.get("noGoalLimit") === "on";
  const goalLimit = readInt(formData, "goalLimit");
  const minutes = readInt(formData, "matchMinutes");
  if (!noLimit && (goalLimit === null || goalLimit < 1 || goalLimit > 20)) {
    return "Лимит голов — от 1 до 20 (или «Без лимита голов»).";
  }
  if (minutes === null || minutes < 1 || minutes > 60) return "Длительность матча — от 1 до 60 минут.";
  return { goal_limit: noLimit ? null : goalLimit, match_minutes: minutes };
}

function readScheduleForm(formData: FormData): ScheduleInput | string {
  const weekday = readInt(formData, "weekday");
  const startTime = readText(formData, "startTime");
  const place = readText(formData, "place");
  const maxPlayers = readInt(formData, "maxPlayers");

  if (weekday === null || weekday < 0 || weekday > 6) return "Выберите день недели.";
  if (!/^\d{2}:\d{2}$/.test(startTime)) return "Укажите время начала.";
  if (place.length > 120) return "Название места слишком длинное (до 120 символов).";
  if (maxPlayers === null || maxPlayers < 2 || maxPlayers > 100) {
    return "Лимит игроков — от 2 до 100.";
  }
  const format = readFormat(formData);
  if (typeof format === "string") return format;
  return { weekday, start_time: startTime, place, max_players: maxPlayers, ...format };
}

// Per-game format (organizer, on the game page). Not-yet-started matches follow it.
export async function saveGameFormatAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gameId = readText(formData, "gameId");
  const format = readFormat(formData);
  if (typeof format === "string") return { error: format };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_game_format", {
    p_game_id: gameId,
    p_goal_limit: format.goal_limit,
    p_match_minutes: format.match_minutes,
  });
  if (error) return { error: toMessage(error) };
  revalidateGame(gameId);
  revalidatePath(`/game/${gameId}/live`);
  return { ok: true };
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
  if (!group) return { error: errorMessage("not_organizer") };

  const input = readScheduleForm(formData);
  if (typeof input === "string") return { error: input };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .insert({ ...input, group_id: group.id, timezone: DEFAULT_TIMEZONE });
  if (error) return { error: toMessage(error) };

  revalidateSchedule();
  return { ok: true };
}

export async function updateScheduleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: errorMessage("not_organizer") };

  const scheduleId = readText(formData, "scheduleId");
  const input = readScheduleForm(formData);
  if (typeof input === "string") return { error: input };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update(input)
    .eq("id", scheduleId)
    .eq("group_id", group.id)
    .select("id");
  if (error) return { error: toMessage(error) };
  if (!data?.length) return { error: "Не удалось сохранить расписание." };

  revalidateSchedule();
  return { ok: true };
}

export async function toggleScheduleAction(
  scheduleId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: errorMessage("not_organizer") };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ is_active: isActive })
    .eq("id", scheduleId)
    .eq("group_id", group.id)
    .select("id");
  if (error) return { error: toMessage(error) };
  if (!data?.length) return { error: "Не удалось изменить расписание." };

  revalidateSchedule();
  return {};
}

export async function createGameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const group = await requireOrganizerGroup();
  if (!group) return { error: errorMessage("not_organizer") };

  const date = readText(formData, "date");
  const time = readText(formData, "time");
  const place = readText(formData, "place");
  const maxPlayers = readInt(formData, "maxPlayers");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Укажите дату игры." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Укажите время начала." };
  if (place.length > 120) return { error: "Название места слишком длинное." };
  if (maxPlayers === null || maxPlayers < 2 || maxPlayers > 100) {
    return { error: "Лимит игроков — от 2 до 100." };
  }
  const format = readFormat(formData);
  if (typeof format === "string") return { error: format };

  const startsAt = zonedTimeToUtc(date, time, DEFAULT_TIMEZONE);
  if (startsAt.getTime() <= Date.now()) {
    return { error: "Время игры уже прошло — выберите будущую дату." };
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
  if (error) return { error: toMessage(error) };

  revalidateSchedule();
  return { ok: true };
}
