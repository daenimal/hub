export type ThemeId = "onyx" | "violet" | "ocean" | "ember" | "forest";

export type Theme = {
  id: ThemeId;
  name: string;
  overview: string;
  swatch: [string, string, string];
};

export const THEME_STORAGE_KEY = "microhub.theme";

export const THEMES: Theme[] = [
  {
    id: "onyx",
    name: "Onyx",
    overview: "Neutral dark surfaces",
    swatch: ["#09090b", "#18181b", "#f97316"],
  },
  {
    id: "violet",
    name: "Violet",
    overview: "Cool purple-tinted darks",
    swatch: ["#13102a", "#211c3d", "#7c3aed"],
  },
  {
    id: "ocean",
    name: "Ocean",
    overview: "Deep blue-teal tones",
    swatch: ["#101a28", "#1d2c3e", "#0ea5e9"],
  },
  {
    id: "ember",
    name: "Ember",
    overview: "Warm amber accents",
    swatch: ["#2b1515", "#472424", "#f59e0b"],
  },
  {
    id: "forest",
    name: "Forest",
    overview: "Dark green surfaces",
    swatch: ["#121e18", "#20332a", "#22c55e"],
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function getTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}