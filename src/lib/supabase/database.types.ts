// Mirrors supabase/migrations. Regenerate with:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts

export type PlayerPosition = "gk" | "def" | "mid" | "fwd";
export type MemberRole = "organizer" | "player";

type GroupRow = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
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
    };
    Enums: {
      player_position: PlayerPosition;
      member_role: MemberRole;
    };
    CompositeTypes: Record<never, never>;
  };
};
