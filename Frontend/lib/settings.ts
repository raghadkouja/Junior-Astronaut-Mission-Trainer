// =====================================================================
// lib/settings.ts  (NEW)
// Music + sound volume, shared by the Esc settings menu, the background
// music and the sound effects. Saved in the browser between visits.
// =====================================================================

import { useSyncExternalStore } from "react";

export type Settings = { music: number; sounds: number; narrator: number }; // 0–10 each
export const DEFAULT_SETTINGS: Settings = { music: 6, sounds: 7, narrator: 0 };
const KEY = "jamt-settings";

let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage blocked: keep defaults */
  }
}

export function getSettings(): Settings {
  load();
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  load();
  const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));
  current = {
    music: clamp(patch.music ?? current.music),
    sounds: clamp(patch.sounds ?? current.sounds),
    narrator: clamp(patch.narrator ?? current.narrator),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function resetSettings() {
  setSettings(DEFAULT_SETTINGS);
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
}
