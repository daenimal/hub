"use client";

import { useEffect, useSyncExternalStore, useState } from "react";

import {
  THEMES,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";

function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.classList.add("dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // storage unavailable (private mode): theme still applies for the session
  }
}

let currentTheme: ThemeId = "onyx";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentTheme;
}

function getServerSnapshot() {
  return "onyx" as ThemeId;
}

function setTheme(id: ThemeId) {
  currentTheme = id;
  applyTheme(id);
  listeners.forEach((listener) => listener());
}

function syncFromStorage() {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  setTheme(isThemeId(stored) ? stored : "onyx");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    syncFromStorage();
  }, []);

  return <>{children}</>;
}

export function ThemeToggle() {
  const themeId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [open, setOpen] = useState(false);

  const current = THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];

  function select(id: ThemeId) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Switch theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-9 place-items-center rounded-lg border border-zinc-300 px-0 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <span
          className="size-4 rounded-full border border-zinc-300 dark:border-zinc-600"
          style={{
            background: `linear-gradient(135deg, ${current.swatch[0]} 0%, ${current.swatch[1]} 55%, ${current.swatch[2]} 100%)`,
          }}
        />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Theme
            </p>
            {THEMES.map((theme) => {
              const selected = theme.id === themeId;
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => select(theme.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-200 dark:border-zinc-700"
                    style={{
                      background: `linear-gradient(135deg, ${theme.swatch[0]} 0%, ${theme.swatch[1]} 60%, ${theme.swatch[2]} 100%)`,
                    }}
                  >
                    {selected ? (
                      <svg
                        className="size-4 text-white drop-shadow"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {theme.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {theme.overview}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}