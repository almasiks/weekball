"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getGameView } from "@/lib/games";
import { errorMessage, toMessage } from "@/lib/errors";
import { balanceTeams } from "@/lib/teams/balance";
import { nextFreeColor, teamColor } from "@/lib/teams/colors";
import { playerStrength } from "@/lib/teams/strength";

export type ActionResult = { error?: string };

function revalidateTeams(gameId: string) {
  revalidatePath("/");
  revalidatePath(`/game/${gameId}`);
  revalidatePath(`/game/${gameId}/teams`);
}

async function rpcResult(
  gameId: string,
  call: PromiseLike<{ error: { message?: string } | null }>,
): Promise<ActionResult> {
  const { error } = await call;
  if (error) return { error: toMessage(error) };
  revalidateTeams(gameId);
  return {};
}

// --- Team setup ---

export async function setTeamCountAction(gameId: string, count: number): Promise<ActionResult> {
  if (count !== 2 && count !== 3) return { error: "Можно 2 или 3 команды." };
  const view = await getGameView(gameId);
  if (!view) return { error: errorMessage("game_not_found") };

  const supabase = await createClient();
  const teams = view.teams;

  if (teams.length < count) {
    const used = teams.map((t) => t.team.color);
    for (let i = teams.length; i < count; i++) {
      const color = nextFreeColor(used);
      if (!color) return { error: "Закончились свободные цвета." };
      used.push(color.hex);
      const { error } = await supabase.rpc("create_team", {
        p_game_id: gameId,
        p_name: color.teamName,
        p_color: color.hex,
      });
      if (error) return { error: toMessage(error) };
    }
  } else {
    // Remove the last teams; their players go back to "unassigned".
    for (const t of teams.slice(count).reverse()) {
      const { error } = await supabase.rpc("delete_team", { p_team_id: t.team.id });
      if (error) return { error: toMessage(error) };
    }
  }

  revalidateTeams(gameId);
  return {};
}

export async function updateTeamAction(
  gameId: string,
  teamId: string,
  input: { name: string; color: string; captainId: string | null },
): Promise<ActionResult> {
  const name = input.name.trim() || teamColor(input.color).teamName;
  const supabase = await createClient();
  return rpcResult(
    gameId,
    supabase.rpc("update_team", {
      p_team_id: teamId,
      p_name: name,
      p_color: input.color,
      p_captain_id: input.captainId,
    }),
  );
}

// --- Assignments ---

const signature = (teams: string[][]) =>
  teams.map((t) => [...t].sort().join(",")).join("|");

// Auto-balance all non-locked players. Tries a few seeds so "Пересобрать"
// always shows a different split when one exists.
export async function autoBuildAction(gameId: string, seed: number): Promise<ActionResult> {
  const view = await getGameView(gameId);
  if (!view) return { error: errorMessage("game_not_found") };
  if (view.teams.length < 2) return { error: "Сначала создайте 2 или 3 команды." };
  if (view.going.length === 0) return { error: "На игру пока никто не записан." };

  const teamIds = view.teams.map((t) => t.team.id);
  const locked: Record<string, number> = {};
  view.teams.forEach((t, index) =>
    t.players.forEach((p) => {
      if (p.isLocked) locked[p.playerId] = index;
    }),
  );
  const players = view.going.map((p) => ({
    id: p.playerId,
    position: p.position,
    strength: playerStrength(p),
  }));
  const current = signature(view.teams.map((t) => t.players.map((p) => p.playerId)));

  let result = balanceTeams({ players, teamCount: teamIds.length, locked, seed });
  for (let attempt = 1; attempt < 12 && signature(result.teams) === current; attempt++) {
    result = balanceTeams({ players, teamCount: teamIds.length, locked, seed: seed + attempt });
  }

  const assignments = result.teams.flatMap((ids, index) =>
    ids.map((playerId) => ({ player_id: playerId, team_id: teamIds[index] })),
  );
  const supabase = await createClient();
  return rpcResult(
    gameId,
    supabase.rpc("apply_assignments", { p_game_id: gameId, p_assignments: assignments }),
  );
}

export async function movePlayerAction(
  gameId: string,
  playerId: string,
  teamId: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  return rpcResult(
    gameId,
    supabase.rpc("move_player", { p_game_id: gameId, p_player_id: playerId, p_team_id: teamId }),
  );
}

// Late arrival: smallest team; on a tie, the weaker team (by playerStrength) first.
export async function addLatePlayerAction(gameId: string, playerId: string): Promise<ActionResult> {
  const view = await getGameView(gameId);
  if (!view) return { error: errorMessage("game_not_found") };
  const order = [...view.teams]
    .sort((a, b) => a.strength - b.strength)
    .map((t) => t.team.id);

  const supabase = await createClient();
  return rpcResult(
    gameId,
    supabase.rpc("add_to_smallest_team", {
      p_game_id: gameId,
      p_player_id: playerId,
      p_team_order: order,
    }),
  );
}

export async function setLockedAction(
  gameId: string,
  playerId: string,
  locked: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  return rpcResult(
    gameId,
    supabase.rpc("set_player_locked", { p_game_id: gameId, p_player_id: playerId, p_locked: locked }),
  );
}

// --- Publishing & draft ---

export async function setPublishedAction(gameId: string, published: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  return rpcResult(
    gameId,
    published
      ? supabase.rpc("publish_teams", { p_game_id: gameId })
      : supabase.rpc("unpublish_teams", { p_game_id: gameId }),
  );
}

export async function startDraftAction(gameId: string): Promise<ActionResult> {
  const supabase = await createClient();
  return rpcResult(gameId, supabase.rpc("start_draft", { p_game_id: gameId }));
}

export async function endDraftAction(gameId: string): Promise<ActionResult> {
  const supabase = await createClient();
  return rpcResult(gameId, supabase.rpc("end_draft", { p_game_id: gameId }));
}

export async function draftPickAction(gameId: string, playerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  return rpcResult(
    gameId,
    supabase.rpc("draft_pick", { p_game_id: gameId, p_player_id: playerId }),
  );
}

// --- Player profile ---

export async function setPlayerLevelAction(playerId: string, level: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_player_level", {
    p_player_id: playerId,
    p_level: level,
  });
  if (error) return { error: toMessage(error) };
  revalidatePath("/roster");
  return {};
}
