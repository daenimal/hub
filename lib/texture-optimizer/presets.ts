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

/**
 * Free presets: fixed settings, usable by anyone.
 *
 * Single PSX preset for the ORIGINAL PlayStation hardware (not just a "retro
 * look"): it stays within a 256×256 texture page, uses an 8-bit CLUT size
 * (256 colors), pre-dithers with error diffusion so gradients survive on
 * modern screens, and lets the worker snap colors to the console's 15-bit
 * (5:5:5) output. See docs/psx-texture-presets.md for the hardware details.
 */
export const FREE_PRESETS: ToolPreset[] = [
  {
    id: "preset-psx-8bit",
    name: "PSX 8-bit",
    settings: {
      maxWidth: 256,
      maxHeight: 256,
      quantizeColors: 256,
      dithering: "floyd-steinberg",
      ditherStrength: 1,
    },
    visibility: "public",
    builtin: true,
  },
];

type StoredSettings = Record<string, unknown>;

const DITHERINGS = ["none", "floyd-steinberg", "bayer", "ordered"] as const;
type Dithering = (typeof DITHERINGS)[number];

function isDithering(value: unknown): value is Dithering {
  return typeof value === "string" && (DITHERINGS as readonly string[]).includes(value);
}

function isValidSettings(settings: StoredSettings | null | undefined): boolean {
  return (
    typeof settings === "object" &&
    settings !== null &&
    typeof settings.maxWidth === "number" &&
    typeof settings.maxHeight === "number" &&
    typeof settings.quantizeColors === "number" &&
    typeof settings.ditherStrength === "number" &&
    isDithering(settings.dithering)
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