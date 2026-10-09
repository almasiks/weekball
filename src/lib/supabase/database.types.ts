// Mirrors supabase/migrations. Regenerate with:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
import type { LiveEvent, LiveMatch, StandingRow } from "@/lib/match/types";

export type PlayerPosition = "gk" | "def" | "mid" | "fwd";
export type MemberRole = "organizer" | "player";
export type GameStatus =
  | "signup"
  | "closed"
  | "teams"
  | "live"
  | "finished"
  | "cancelled";
export type SignupStatus = "going" | "waitlist" | "declined";
export type ArrivalStatus = "pending" | "late" | "arrived";

type GroupRow = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string | null;
  created_at: string;
};

export type ScheduleRow = {
  id: string;
  group_id: string;
  weekday: number;
  start_time: string;
  place: string;
  max_players: number;
  timezone: string;
  is_active: boolean;
  created_at: string;
  goal_limit: number | null;
  match_minutes: number;
};

export type GameRow = {
  id: string;
  group_id: string;
  schedule_id: string | null;
  starts_at: string;
  place: string;
  max_players: number;
  timezone: string;
  status: GameStatus;
  created_at: string;
  teams_published_at: string | null;
  draft_active: boolean;
  draft_turn: number;
  teams_updated_at: string | null;
  live_token: string | null;
  stats_processed_at: string | null;
  goal_limit: number | null;
  match_minutes: number;
  auto_sounds: boolean;
  title: string | null;
  deleted_at: string | null;
  created_by: string | null;
  match_periods: number;
  mvp_player_id: string | null;
};

export type SoundRow = {
  id: string;
  group_id: string;
  name: string;
  file_path: string;
  builtin_key: "minute" | "out" | "whistle" | "final" | "finished" | null;
  sort_order: number;
  created_at: string;
};

export type MatchRow = LiveMatch & {
  game_id: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type EventRow = LiveEvent & {
  void_reason: "manual" | "reset" | null;
  game_id: string;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
};

export type LeaderboardRow = {
  player_id: string;
  name: string;
  avatar_url: string | null;
  position: PlayerPosition | null;
  rating: number;
  rated_games: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  win_pct: number;
  goals: number;
  own_goals: number;
  assists: number;
  goals_per_match: number | string;
  yellows: number;
  reds: number;
  finished_games: number;
  games_played: number;
  attendance_pct: number;
  no_shows: number;
  form: string; // oldest -> newest, e.g. "WDLWW"
  mvp_count: number;
};

export type GamePlayerStatRow = {
  player_id: string;
  name: string;
  team_id: string;
  team_name: string;
  team_color: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  own_goals: number;
  yellows: number;
  reds: number;
};

export type GameHistoryRow = {
  game_id: string;
  starts_at: string;
  timezone: string;
  place: string;
  matches: {
    team_a: string;
    color_a: string;
    score_a: number;
    team_b: string;
    color_b: string;
    score_b: number;
  }[];
  top_scorers: { player_id: string; name: string; goals: number }[];
};

export type TeamRow = {
  id: string;
  game_id: string;
  name: string;
  color: string;
  captain_id: string | null;
  sort_order: number;
  created_at: string;
};

export type TeamPlayerRow = {
  team_id: string;
  game_id: string;
  player_id: string;
  added_late: boolean;
  is_locked: boolean;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string;
          name: string;
          avatar_url: string | null;
          position: PlayerPosition | null;
          level: number;
          rating: number;
          rated_games: number;
          created_at: string;
          user_id: string | null;
          created_by: string | null;
          is_regular: boolean;
          archived_at: string | null;
        };
        Insert: never;
        Update: {
          name?: string;
          avatar_url?: string | null;
          position?: PlayerPosition | null;
        };
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: never;
        Update: { name?: string };
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          player_id: string;
          role: MemberRole;
          joined_at: string;
        };
        Insert: never;
        Update: { role?: MemberRole };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      schedules: {
        Row: ScheduleRow;
        Insert: {
          group_id: string;
          weekday: number;
          start_time: string;
          place?: string;
          max_players?: number;
          timezone?: string;
          is_active?: boolean;
          goal_limit?: number | null;
          match_minutes?: number;
        };
        Update: {
          weekday?: number;
          start_time?: string;
          place?: string;
          max_players?: number;
          timezone?: string;
          is_active?: boolean;
          goal_limit?: number | null;
          match_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: GameRow;
        Insert: {
          group_id: string;
          starts_at: string;
          place?: string;
          max_players?: number;
          timezone?: string;
          goal_limit?: number | null;
          match_minutes?: number;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "games_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "games_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      signups: {
        Row: {
          game_id: string;
          player_id: string;
          status: SignupStatus;
          arrival: ArrivalStatus;
          late_minutes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "signups_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signups_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: TeamRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "teams_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      sounds: {
        Row: SoundRow;
        Insert: {
          group_id: string;
          name: string;
          file_path: string;
          builtin_key?: SoundRow["builtin_key"];
          sort_order?: number;
        };
        Update: { name?: string; sort_order?: number };
        Relationships: [];
      };
      matches: {
        Row: MatchRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      events: {
        Row: EventRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      team_players: {
        Row: TeamPlayerRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "team_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      enter_app: { Args: { p_name: string }; Returns: PlayerRow };
      rename_me: { Args: { p_name: string }; Returns: PlayerRow };
      create_group: {
        Args: { group_name: string; player_name: string };
        Returns: GroupRow;
      };
      join_group: {
        Args: { code: string; player_name: string; p_claim_player_id?: string | null };
        Returns: GroupRow;
      };
      create_upcoming_games: {
        Args: { days_ahead?: number };
        Returns: number;
      };
      set_signup: {
        Args: { p_game_id: string; wants_to_come: boolean };
        Returns: SignupStatus;
      };
      set_arrival: {
        Args: {
          p_game_id: string;
          p_arrival: ArrivalStatus;
          p_late_minutes?: number | null;
        };
        Returns: undefined;
      };
      set_game_status: {
        Args: { p_game_id: string; new_status: GameStatus };
        Returns: GameStatus;
      };
      create_team: {
        Args: { p_game_id: string; p_name: string; p_color: string; p_captain_id?: string | null };
        Returns: TeamRow;
      };
      update_team: {
        Args: { p_team_id: string; p_name: string; p_color: string; p_captain_id?: string | null };
        Returns: TeamRow;
      };
      delete_team: { Args: { p_team_id: string }; Returns: undefined };
      move_player: {
        Args: { p_game_id: string; p_player_id: string; p_team_id: string | null };
        Returns: undefined;
      };
      apply_assignments: {
        Args: { p_game_id: string; p_assignments: { player_id: string; team_id: string }[] };
        Returns: undefined;
      };
      add_to_smallest_team: {
        Args: { p_game_id: string; p_player_id: string; p_team_order?: string[] | null };
        Returns: string;
      };
      set_player_locked: {
        Args: { p_game_id: string; p_player_id: string; p_locked: boolean };
        Returns: undefined;
      };
      publish_teams: { Args: { p_game_id: string }; Returns: undefined };
      unpublish_teams: { Args: { p_game_id: string }; Returns: undefined };
      start_draft: { Args: { p_game_id: string }; Returns: undefined };
      draft_pick: { Args: { p_game_id: string; p_player_id: string }; Returns: string };
      end_draft: { Args: { p_game_id: string }; Returns: undefined };
      set_player_level: { Args: { p_player_id: string; p_level: number }; Returns: undefined };
      create_match: {
        Args: {
          p_game_id: string;
          p_team_a_id: string;
          p_team_b_id: string;
          p_periods?: number;
          p_period_seconds?: number;
        };
        Returns: MatchRow;
      };
      generate_round_robin: {
        Args: { p_game_id: string; p_periods?: number; p_period_seconds?: number };
        Returns: MatchRow[];
      };
      update_match_settings: {
        Args: { p_match_id: string; p_periods: number; p_period_seconds: number };
        Returns: MatchRow;
      };
      delete_match: { Args: { p_match_id: string }; Returns: undefined };
      timer_start: { Args: { p_match_id: string; p_client_ts?: string | null }; Returns: MatchRow };
      timer_pause: { Args: { p_match_id: string; p_client_ts?: string | null }; Returns: MatchRow };
      timer_resume: { Args: { p_match_id: string; p_client_ts?: string | null }; Returns: MatchRow };
      timer_break: {
        Args: { p_match_id: string; p_period: number; p_client_ts?: string | null };
        Returns: MatchRow;
      };
      timer_next_period: {
        Args: { p_match_id: string; p_period: number; p_client_ts?: string | null };
        Returns: MatchRow;
      };
      finish_match: {
        Args: { p_match_id: string; p_client_ts?: string | null; p_reason?: "manual" | "time" };
        Returns: MatchRow;
      };
      update_game_format: {
        Args: {
          p_game_id: string;
          p_goal_limit: number | null;
          p_match_minutes: number;
          p_auto_sounds?: boolean | null;
          p_periods?: number | null;
        };
        Returns: GameRow;
      };
      reopen_match: { Args: { p_match_id: string }; Returns: MatchRow };
      add_event: { Args: { payload: Omit<LiveEvent, "voided_at"> }; Returns: EventRow };
      void_event: { Args: { p_event_id: string }; Returns: EventRow };
      game_standings: { Args: { p_game_id: string }; Returns: StandingRow[] };
      finish_game: { Args: { p_game_id: string }; Returns: undefined };
      set_live_link: {
        Args: { p_game_id: string; p_enabled: boolean; p_regenerate?: boolean };
        Returns: string | null;
      };
      get_live_game: { Args: { p_token: string }; Returns: unknown };
      group_claimable_players: { Args: { p_code: string }; Returns: { id: string; name: string }[] };
      add_players: { Args: { p_group_id: string; p_names: string[] }; Returns: PlayerRow[] };
      rename_player: { Args: { p_player_id: string; p_name: string }; Returns: undefined };
      set_player_position: {
        Args: { p_player_id: string; p_position: PlayerPosition | null };
        Returns: undefined;
      };
      set_player_archived: { Args: { p_player_id: string; p_archived: boolean }; Returns: undefined };
      unlink_player: { Args: { p_player_id: string }; Returns: undefined };
      merge_players: { Args: { p_from: string; p_to: string }; Returns: undefined };
      set_attendance: {
        Args: { p_game_id: string; p_player_id: string; p_present: boolean };
        Returns: unknown;
      };
      create_player_quick: {
        Args: {
          p_game_id: string;
          p_name: string;
          p_is_regular?: boolean;
          p_position?: PlayerPosition | null;
          p_level?: number | null;
          p_player_id?: string | null;
        };
        Returns: PlayerRow;
      };
      update_game: {
        Args: { p_game_id: string; p_title: string | null; p_starts_at: string; p_place: string };
        Returns: GameRow;
      };
      set_game_mvp: { Args: { p_game_id: string; p_player_id: string | null }; Returns: undefined };
      reset_game_results: { Args: { p_game_id: string }; Returns: undefined };
      delete_game: { Args: { p_game_id: string }; Returns: undefined };
      game_player_stats: { Args: { p_game_id: string }; Returns: GamePlayerStatRow[] };
      server_time: { Args: Record<string, never>; Returns: string };
      leaderboard: { Args: { p_group_id: string; p_from?: string | null }; Returns: LeaderboardRow[] };
      player_profile: { Args: { p_group_id: string; p_player_id: string }; Returns: unknown };
      game_top_scorers: {
        Args: { p_game_id: string };
        Returns: { player_id: string; name: string; goals: number }[];
      };
      game_history: { Args: { p_group_id: string; p_limit?: number }; Returns: GameHistoryRow[] };
      apply_rating_history: {
        Args: {
          p_group_id: string;
          payload: {
            history: {
              player_id: string;
              game_id: string;
              rating_before: number;
              rating_after: number;
              delta: number;
            }[];
            players: { player_id: string; rating: number; rated_games: number }[];
            processed_game_ids: string[];
          };
        };
        Returns: undefined;
      };
    };
    Enums: {
      player_position: PlayerPosition;
      member_role: MemberRole;
      game_status: GameStatus;
      signup_status: SignupStatus;
      arrival_status: ArrivalStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
