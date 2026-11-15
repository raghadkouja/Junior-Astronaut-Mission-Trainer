"use client";


import { useEffect, useRef, useState } from "react";
import { FAULTS, PARTS, RADIATION, radiationSpeed } from "@/lib/mission/config";
import type { Dest, PartId, SystemId } from "@/lib/mission/config";
import { SOURCE_LABEL, factsFor } from "@/lib/mission/facts";
import type { Apod, SpaceWeather } from "@/lib/mission/nasaData";
import { prettyDate } from "@/lib/mission/nasaData";
import type { Objective } from "@/lib/mission/sim";
import { drawPortrait } from "@/components/game/outpostEngine";
import { SettingsRows } from "./SettingsMenu";
import { play } from "@/lib/sfx";
import "./menus.css";

export type InventoryData = {
  name: string;
  dest: Dest;
  parts: Record<PartId, number>;
  broken: SystemId[];
  patched: SystemId[];
  facts: string[];
  toNextFact: number;
  objectives: Objective[];
  doseMsv: number;
  sick: boolean;
  weather: SpaceWeather | null;
  apod: Apod | null;
  log: string[]; //         newest first
  // outpost status (same numbers as under the clock on the game screen)
  solarPct: number;
  solarEff: number;
  outsideC: number;
  oneWay: string;
  commsWeak: boolean;
  calling: number; //       seconds until Houston replies, -1 = no call
};

export type Tab = "objectives" | "facts" | "sources" | "settings";
const TABS: Tab[] = ["objectives", "facts", "sources", "settings"];

const CONTROLS: [string, string][] = [
  ["W A S D / ARROWS", "Walk around the outpost"],
  ["SHIFT (hold)", "Sprint (not while resting)"],
  ["SPACE / ENTER / F", "Use the building you are standing next to"],
  ["CLICK", "Walk to a spot, or walk to a building and use it"],
  ["1 – 7", "Walk to a station and use it (same as the hotbar)"],
  ["E / TAB / I", "Open or close this inventory"],
  ["ESC", "Open settings · close any menu"],
  ["1 2 3 4 (in here)", "Switch tabs"],
];

export default function InventoryPanel({
  data,
  onClose,
  initialTab = "objectives",
  onExit,
  exitLabel,
}: {
  data: InventoryData;
  onClose: () => void;
  initialTab?: Tab;
  onExit?: () => void;
  exitLabel?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [open, setOpen] = useState<string | null>(null);
  const portrait = useRef<HTMLCanvasElement>(null);
  const all = factsFor(data.dest);

  useEffect(() => {
    if (portrait.current) drawPortrait(portrait.current, data.dest);
  }, [data.dest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "e" || k === "escape" || k === "tab" || k === "i") {
        e.preventDefault();
        onClose();
      }
      const n = Number(k);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (t: Tab) => {
    setTab(t);
    play("click");
  };

  const w = data.weather;
  const donkiStatus = !w ? "Loading…" : w.live ? "LIVE" : "ARCHIVED";

  // radiation bar: 0 → career limit, with the "slows you down" zone marked
  const radPct = (v: number) => Math.min(100, (v / RADIATION.careerLimit) * 100);
  const speed = radiationSpeed(data.doseMsv) * (data.sick ? 0.8 : 1);
  const radLevel = data.doseMsv >= RADIATION.slowMax ? "high" : data.doseMsv >= RADIATION.slowFrom ? "mid" : "ok";

  return (
    <div className="inv-backdrop" role="dialog" aria-label="Inventory" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inv-panel">
        <span className="inv-rivet tl" /><span className="inv-rivet tr" /><span className="inv-rivet bl" /><span className="inv-rivet br" />

        {/* ---------- LEFT: astronaut ---------- */}
        <section className="inv-left">
          <canvas ref={portrait} width={140} height={180} className="inv-portrait" aria-label="Your astronaut" />
          <div className="inv-name">{data.name.toUpperCase() || "ASTRONAUT"}</div>

          <div className={`inv-radbox ${radLevel}`} aria-label="Radiation dose">
            <p className="inv-radhead">
              <span>RADIATION</span>
              <b>{data.doseMsv.toFixed(1)} mSv</b>
            </p>
            <div className="inv-radbar" role="meter" aria-valuenow={Math.round(data.doseMsv)} aria-valuemin={0} aria-valuemax={RADIATION.careerLimit}>
              <i className="zone slow" style={{ left: `${radPct(RADIATION.slowFrom)}%`, width: `${radPct(RADIATION.slowMax) - radPct(RADIATION.slowFrom)}%` }} />
              <i className="zone heavy" style={{ left: `${radPct(RADIATION.slowMax)}%`, right: 0 }} />
              <i className="fill" style={{ width: `${radPct(data.doseMsv)}%` }} />
            </div>
            <p className="inv-radtxt">
              {data.sick
                ? `Resting after a big storm dose · moving at ${Math.round(speed * 100)}% speed`
                : radLevel === "ok"
                  ? `Fit for duty · full speed until ${RADIATION.slowFrom} mSv`
                  : `High dose makes you tired · moving at ${Math.round(speed * 100)}% speed`}
            </p>
            <p className="inv-radtxt dim">Career limit {RADIATION.careerLimit} mSv (NASA-STD-3001)</p>
          </div>

          <p className="inv-head">OUTPOST STATUS</p>
          <dl className="inv-status">
            <div className={data.solarPct > 3 ? "" : "off"}>
              <dt>SOLAR</dt>
              <dd>
                {data.solarPct > 3 ? `${data.solarPct}%` : "OFFLINE"}
                {data.solarEff < 0.95 && <em> · dusty {Math.round(data.solarEff * 100)}%</em>}
              </dd>
            </div>
            <div>
              <dt>OUTSIDE</dt>
              <dd>
                {data.outsideC} °C <em>({data.dest === "mars" ? "Curiosity REMS" : "LRO Diviner"})</em>
              </dd>
            </div>
            <div className={data.commsWeak ? "off" : ""}>
              <dt>RADIO DELAY</dt>
              <dd>
                {data.oneWay}
                {data.commsWeak ? <em> · no signal</em> : data.calling >= 0 ? <em> · reply in {data.calling}s</em> : null}
              </dd>
            </div>
          </dl>
        </section>

        {/* ---------- RIGHT: objectives / fact book / sources ---------- */}
        <section className="inv-right">
          <div className="inv-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "objectives"} className={tab === "objectives" ? "on" : ""} onClick={() => pick("objectives")}>
              🎯 OBJECTIVES
            </button>
            <button role="tab" aria-selected={tab === "facts"} className={tab === "facts" ? "on" : ""} onClick={() => pick("facts")}>
              📘 FACT BOOK <b>{data.facts.length}/{all.length}</b>
            </button>
            <button role="tab" aria-selected={tab === "sources"} className={tab === "sources" ? "on" : ""} onClick={() => pick("sources")}>
              🛰 DATA SOURCES
            </button>
            <button role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "on" : ""} onClick={() => pick("settings")}>
              ⚙ SETTINGS
            </button>
          </div>

          <div className="inv-page">
            {tab === "objectives" && (
              <>
                <ul className="inv-obj">
                  {data.objectives.map((o) => (
                    <li key={o.text} className={o.done ? "done" : ""}>
                      <span className="box">{o.done ? "✔" : ""}</span>
                      {o.text}
                    </li>
                  ))}
                </ul>
                {data.broken.length > 0 && (
                  <div className="inv-alert">
                    <b>⚠ BROKEN SYSTEMS</b>
                    {data.broken.map((b) => (
                      <p key={b}>
                        {FAULTS[b].name}: {FAULTS[b].effect} <em>Needs: {PARTS[FAULTS[b].part].icon} {PARTS[FAULTS[b].part].name}</em>
                      </p>
                    ))}
                  </div>
                )}
                {data.patched.length > 0 && (
                  <p className="inv-note">🩹 Patched (will break again soon): {data.patched.map((b) => FAULTS[b].name).join(", ")}</p>
                )}
                <p className="inv-note">📘 Next fact unlocks in {data.toNextFact} job{data.toNextFact === 1 ? "" : "s"}.</p>

                <p className="inv-head inv-loghead">MISSION LOG</p>
                {data.log.length ? (
                  <ul className="inv-log">
                    {data.log.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="inv-note">Nothing yet. Your jobs and events will show up here.</p>
                )}
              </>
            )}

            {tab === "facts" && (
              <>
                <div className="inv-apod">
                  {data.apod?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.apod.image} alt={data.apod.title} loading="lazy" />
                  ) : (
                    <div className="inv-apod-empty">🌌</div>
                  )}
                  <div>
                    <span className={`badge ${data.apod?.live ? "live" : "arch"}`}>{data.apod?.live ? "LIVE NASA APOD" : "APOD OFFLINE"}</span>
                    <p className="inv-apod-title">{data.apod?.title ?? "Loading the sky photo…"}</p>
                    {data.apod?.date && (
                      <p className="inv-apod-credit">
                        {prettyDate(data.apod.date)} · © {data.apod.credit} ·{" "}
                        <a href={data.apod.link} target="_blank" rel="noreferrer">apod.nasa.gov</a>
                      </p>
                    )}
                  </div>
                </div>
                <ul className="inv-facts">
                  {[...all].sort((a, b) => Number(data.facts.includes(b.id)) - Number(data.facts.includes(a.id))).map((f) => {
                    const got = data.facts.includes(f.id);
                    const isOpen = open === f.id;
                    return (
                      <li key={f.id} className={got ? "got" : "locked"}>
                        <button disabled={!got} onClick={() => setOpen(isOpen ? null : f.id)}>
                          <span className="src">{got ? SOURCE_LABEL[f.source] : "LOCKED"}</span>
                          <b>{got ? f.title : "??? Finish more jobs to unlock"}</b>
                        </button>
                        {got && isOpen && (
                          <div className="inv-fact-body">
                            <p>{f.text}</p>
                            <p className="cred">
                              Source: {f.credit}
                              {f.url && (
                                <>
                                  {" "}·{" "}
                                  <a href={f.url} target="_blank" rel="noreferrer">link</a>
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {tab === "sources" && (
              <div className="inv-sources">
                <p className="inv-note">
                  <span className="badge live">LIVE</span> = fetched from NASA while you play.{" "}
                  <span className="badge arch">ARCHIVED</span> = a real NASA measurement saved inside the game.
                </p>
                <dl>
                  <dt><span className={`badge ${w?.live ? "live" : "arch"}`}>{donkiStatus}</span> NASA DONKI: space weather</dt>
                  <dd>
                    Solar flares for the Day 2 and Day 5 storms. Stronger real flares make harder storms.
                    {w && (
                      <>
                        {" "}Last 30 days{w.live ? "" : " (archived Sept 2017 record)"}: <b>{w.counts.X}</b> X-class, <b>{w.counts.M}</b> M-class flares.
                        Your storms: <b>{w.storms[0].classType}</b> ({prettyDate(w.storms[0].peak)}) and{" "}
                        <b>{w.storms[1].classType}</b> ({prettyDate(w.storms[1].peak)}).
                      </>
                    )}
                  </dd>
                  <dt><span className={`badge ${data.apod?.live ? "live" : "arch"}`}>{data.apod?.live ? "LIVE" : "OFFLINE"}</span> NASA APOD</dt>
                  <dd>A random real Astronomy Picture of the Day on the Fact Book cover, so every play has a different sky.</dd>
                  <dt><span className="badge arch">ARCHIVED</span> ISS radiation dosimetry (RadLab-type data)</dt>
                  <dd>ISS crews get about {RADIATION.issPerDay.low}–{RADIATION.issPerDay.high} mSv/day. That&apos;s the &ldquo;normal&rdquo; line on the storm radiation meter. Limits: {RADIATION.stormEventLimit} mSv per solar storm, {RADIATION.careerLimit} mSv career (NASA-STD-3001).</dd>
                  <dt><span className="badge arch">ARCHIVED</span> Surface radiation</dt>
                  <dd>Moon 1.37 mSv/day (Chang&apos;e 4), Mars 0.64 mSv/sol (Curiosity RAD). Your dosimeter adds this up every second.</dd>
                  <dt><span className="badge arch">ARCHIVED</span> LRO Diviner &amp; Curiosity REMS: temperature</dt>
                  <dd>Moon about +120 °C by day and −130 °C at night, −249 °C in shadowed craters. Mars (Gale Crater) about 0 °C to −70 °C. Goal zone 18–27 °C = the ISS cabin range.</dd>
                  <dt><span className="badge arch">ARCHIVED</span> NASA OSDR / Human Research Program</dt>
                  <dd>Bone loss (1–1.5% per month), sleep and plant-growth findings in the Fact Book.</dd>
                  <dt><span className="badge arch">ARCHIVED</span> CSA Food Production toolkit</dt>
                  <dd>How food grows on the Moon and how space farms help remote places on Earth.</dd>
                </dl>
                <p className="inv-note">
                  The game is a simplified model: meters are 0–100 and storm doses are scaled for play, but the numbers above are real.
                </p>
              </div>
            )}

            {tab === "settings" && (
              <div className="inv-settings">
                <p className="inv-head">SETTINGS</p>
                <SettingsRows onExit={onExit} exitLabel={exitLabel} />
                <p className="inv-note">↑↓ choose · ←→ change · ENTER select</p>

                <p className="inv-head inv-loghead">CONTROLS</p>
                <dl className="inv-controls">
                  {CONTROLS.map(([key, what]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </section>

        {/* ---------- BOTTOM: spare-parts hotbar ---------- */}
        <section className="inv-hotbar" aria-label="Spare parts">
          {(Object.keys(PARTS) as PartId[]).map((p) => (
            <span key={p} className={`inv-slot part ${data.parts[p] === 0 ? "empty" : ""}`} title={`${PARTS[p].name} ×${data.parts[p]}`}>
              {PARTS[p].icon}
              <b>{data.parts[p]}</b>
              <small>{PARTS[p].name}</small>
            </span>
          ))}
        </section>
        <p className="inv-help">E / ESC CLOSE · 1 2 3 4 SWITCH TABS · CLICK A FACT TO READ IT</p>
      </div>
    </div>
  );
}
