export type ThemeId = "onyx" | "blue" | "green";

export type Theme = {
  id: ThemeId;
  name: string;
  overview: string;
  swatch: [string, string, string];
};

export const THEME_STORAGE_KEY = "hub.theme";

export const THEMES: Theme[] = [
  {
    id: "onyx",
    name: "Onyx",
    overview: "Black surfaces, orange accent",
    swatch: ["#09090b", "#18181b", "#f97316"],
  },
  {
    id: "blue",
    name: "Sapphire",
    overview: "Black surfaces, sky accent",
    swatch: ["#09090b", "#18181b", "#0ea5e9"],
  },
  {
    id: "green",
    name: "Emerald",
    overview: "Black surfaces, emerald accent",
    swatch: ["#09090b", "#18181b", "#10b981"],
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function getTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}