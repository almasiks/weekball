// Mirrors supabase/migrations. Regenerate with:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts

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
  owner_id: string;
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
          created_at: string;
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
        };
        Update: {
          weekday?: number;
          start_time?: string;
          place?: string;
          max_players?: number;
          timezone?: string;
          is_active?: boolean;
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
    };
    Views: Record<never, never>;
    Functions: {
      create_group: {
        Args: { group_name: string; player_name: string };
        Returns: GroupRow;
      };
      join_group: {
        Args: { code: string; player_name: string };
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
