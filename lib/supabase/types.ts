export type UserRole = "user" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  premium: boolean;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Pick<Profile, "id"> & Partial<Omit<Profile, "id">>;
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_presets: {
        Row: {
          id: string;
          tool_id: string;
          name: string;
          settings: Record<string, unknown>;
          visibility: "private" | "public";
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          tool_id: string;
          name: string;
          settings: Record<string, unknown>;
          visibility: "private" | "public";
          user_id: string;
          created_at: string;
          updated_at: string;
        }>;
        Update: Partial<{ name: string; settings: Record<string, unknown>; visibility: "private" | "public" }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};