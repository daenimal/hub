import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";
import type { OptimizeSettings } from "@/workers/optimizer.worker";

export type ToolPreset = {
  id: string;
  name: string;
  settings: OptimizeSettings;
  visibility: "private" | "public";
};

type StoredPreset = {
  id: string;
  name: string;
  settings: Record<string, unknown>;
};

const TOOL_ID = "texture-optimizer";
const STORAGE_KEY = "microhub.presets.texture-optimizer";

function readLocalPresets(): StoredPreset[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPresets(presets: StoredPreset[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

async function isAuthenticated(): Promise<boolean> {
  try {
    if (!getSupabaseConfig()) {
      return false;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return Boolean(session);
  } catch {
    return false;
  }
}

function fromStored(presets: StoredPreset[]): ToolPreset[] {
  return presets
    .filter((p) => isValidSettings(p.settings))
    .map((p) => ({
      id: p.id,
      name: p.name,
      settings: p.settings as OptimizeSettings,
      visibility: "private",
    }));
}

function isValidSettings(settings: Record<string, unknown>): boolean {
  return (
    typeof settings.maxWidth === "number" &&
    typeof settings.maxHeight === "number" &&
    typeof settings.quantizeColors === "number" &&
    typeof settings.dithering === "string"
  );
}

export async function loadPresets(): Promise<ToolPreset[]> {
  if (await isAuthenticated()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tool_presets")
      .select("id, name, settings, visibility")
      .eq("tool_id", TOOL_ID)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? [])
      .filter((p) => isValidSettings(p.settings ?? {}))
      .map((p) => ({
        id: p.id,
        name: p.name,
        settings: p.settings as unknown as OptimizeSettings,
        visibility: p.visibility,
      }));
  }
  return fromStored(readLocalPresets());
}

export async function savePreset(
  name: string,
  settings: OptimizeSettings,
): Promise<ToolPreset[]> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Preset name is required.");
  }

  if (await isAuthenticated()) {
    const supabase = createClient();
    const { error } = await supabase.from("tool_presets").insert({
      tool_id: TOOL_ID,
      name: trimmed,
      settings: settings as unknown as Record<string, unknown>,
      visibility: "private",
    });
    if (error) {
      throw new Error(error.message);
    }
    return loadPresets();
  }

  const presets = readLocalPresets();
  presets.push({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
    name: trimmed,
    settings: settings as unknown as Record<string, unknown>,
  });
  writeLocalPresets(presets);
  return fromStored(presets);
}

export async function deletePreset(id: string): Promise<ToolPreset[]> {
  if (await isAuthenticated()) {
    const supabase = createClient();
    const { error } = await supabase.from("tool_presets").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
    return loadPresets();
  }

  writeLocalPresets(readLocalPresets().filter((p) => p.id !== id));
  return fromStored(readLocalPresets());
}