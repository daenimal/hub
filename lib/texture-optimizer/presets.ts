import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";
import type { OptimizeSettings } from "@/workers/optimizer.worker";

export type ToolPreset = {
  id: string;
  name: string;
  settings: OptimizeSettings;
  visibility: "private" | "public";
  /** Built-in presets are fixed and available to everyone. */
  builtin?: boolean;
};

const TOOL_ID = "texture-optimizer";

/** Free presets: fixed settings, usable by anyone. */
export const FREE_PRESETS: ToolPreset[] = [
  {
    id: "preset-ps1",
    name: "PS1 Classic",
    settings: {
      maxWidth: 512,
      maxHeight: 512,
      quantizeColors: 32,
      dithering: "bayer",
      ditherStrength: 1,
    },
    visibility: "public",
    builtin: true,
  },
  {
    id: "preset-gameboy",
    name: "GameBoy 4-Color",
    settings: {
      maxWidth: 256,
      maxHeight: 256,
      quantizeColors: 4,
      dithering: "ordered",
      ditherStrength: 1,
    },
    visibility: "public",
    builtin: true,
  },
  {
    id: "preset-lowres16",
    name: "Low-Res 16-Color",
    settings: {
      maxWidth: 64,
      maxHeight: 64,
      quantizeColors: 16,
      dithering: "floyd-steinberg",
      ditherStrength: 1,
    },
    visibility: "public",
    builtin: true,
  },
];

type StoredSettings = Record<string, unknown>;

function isValidSettings(settings: StoredSettings | null | undefined): boolean {
  return (
    typeof settings === "object" &&
    settings !== null &&
    typeof settings.maxWidth === "number" &&
    typeof settings.maxHeight === "number" &&
    typeof settings.quantizeColors === "number" &&
    typeof settings.dithering === "string"
  );
}

async function getSession() {
  if (!getSupabaseConfig()) {
    return null;
  }
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/** Loads the user's custom presets. No result for anonymous/free users. */
export async function loadCustomPresets(): Promise<ToolPreset[]> {
  const session = await getSession();
  if (!session) {
    return [];
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_presets")
    .select("id, name, settings, visibility")
    .eq("tool_id", TOOL_ID)
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? [])
    .filter((row) => isValidSettings(row.settings))
    .map((row) => ({
      id: row.id,
      name: row.name,
      settings: row.settings as unknown as OptimizeSettings,
      visibility: row.visibility,
    }));
}

/** Saving custom presets requires a logged-in (premium) account. */
export async function saveCustomPreset(
  name: string,
  settings: OptimizeSettings,
): Promise<ToolPreset[]> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Preset name is required.");
  }
  const session = await getSession();
  if (!session) {
    throw new Error("Sign in to save custom presets.");
  }
  const supabase = createClient();
  const { error } = await supabase.from("tool_presets").insert({
    tool_id: TOOL_ID,
    user_id: session.user.id,
    name: trimmed,
    settings: settings as unknown as Record<string, unknown>,
    visibility: "private",
  });
  if (error) {
    throw new Error(error.message);
  }
  return loadCustomPresets();
}

export async function deleteCustomPreset(id: string): Promise<ToolPreset[]> {
  const session = await getSession();
  if (!session) {
    throw new Error("Sign in to manage custom presets.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("tool_presets")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);
  if (error) {
    throw new Error(error.message);
  }
  return loadCustomPresets();
}