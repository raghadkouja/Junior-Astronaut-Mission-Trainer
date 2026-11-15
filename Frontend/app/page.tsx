"use client";

import { useState } from "react";
import { startState } from "@/lib/turn-game/gameLogic";
import type { Dest, GameState } from "@/lib/turn-game/gameLogic";
import HoustonCall from "@/components/briefing/HoustonCall";
import HomeHud from "@/components/home/HomeHud";
import GameScreen from "@/components/game/GameScreen";

export default function Home() {
  const [screen, setScreen] = useState<"title" | "name" | "call" | "game">("title");
  const [dest, setDest] = useState<Dest>("moon");
  const [name, setName] = useState("");
  const [game, setGame] = useState<GameState>(startState());

  const cleanName = name.trim();

  function begin() {
    if (!cleanName) return;
    setGame(startState(dest));
    setScreen("call");
  }
  function retry() {
    setGame(startState(dest));
  }
  function backToTitle() {
    setGame(startState());
    setScreen("title");
  }

  // Homepage (title + name screens): spaceship HUD
  if (screen === "title" || screen === "name") {
    return (
      <HomeHud
        screen={screen}
        dest={dest}
        setDest={setDest}
        name={name}
        setName={setName}
        onLaunch={() => setScreen("name")}
        onBegin={begin}
      />
    );
  }

  // Houston call plays over the top-down outpost, then the game starts
  return (
    <>
      <GameScreen
        dest={dest}
        name={cleanName}
        game={game}
        setGame={setGame}
        paused={screen === "call"}
        onRetry={retry}
        onBack={backToTitle}
      />
      {screen === "call" && (
        <HoustonCall name={cleanName} dest={dest} onDone={() => setScreen("game")} />
      )}
    </>
  );
}
