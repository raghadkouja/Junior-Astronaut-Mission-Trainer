// lib/narrator.ts
// Reads text out loud using the browser's built-in voice.
// Used by the Houston call and the in-game narrator.

import { getSettings } from "./settings";

const PREFERRED_VOICES = ["Alex", "Aaron", "Google US English", "Microsoft Guy", "Microsoft David", "Fred", "Daniel"];

export function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices();
  for (const n of PREFERRED_VOICES) {
    const v = voices.find((x) => x.name.includes(n) && x.lang.startsWith("en"));
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-US") ?? voices.find((v) => v.lang.startsWith("en"));
}

export function speak(text: string, interrupt = true) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  const volume = getSettings().narrator;
  if (!synth || volume === 0) return; // 0 = narrator off
  if (!interrupt && synth.speaking) return; // don't cut off something more important

  // remove emojis like ⚠ ☢ 🔌 so they aren't read out loud
  const clean = text.replace(/[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|\uFE0F/g, "");

  synth.cancel(); // stop the old line so lines don't pile up
  const u = new SpeechSynthesisUtterance(clean);
  const v = pickVoice(synth);
  if (v) u.voice = v;
  u.lang = "en-US";
  u.rate = 0.9; // a little slow for kids
  u.volume = volume / 10;
  synth.speak(u);
}