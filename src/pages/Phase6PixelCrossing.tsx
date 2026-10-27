import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPixelCrossing, movePixelCrossing, resetPixelCrossing, startPixelCrossing, stepPixelCrossing, type CrossingObstacle, type CrossingRow } from "../data/phase6/pixel-crossing";
import { isGameControlTarget, Phase6GameFrame } from "./Phase6GameFrame";

interface Props {
  best?: number;
  onBest: (score: number) => void;
}

function drawVehicle(row: CrossingRow, obstacle: CrossingObstacle, rowIndex: number, index: number) {
  const width = Math.max(24, obstacle.width * 24);
  const bodyWidth = Math.max(20, width - 2);
  const color = ["#d0a76e", "#c9776a", "#75a7a5"][obstacle.variant % 3];
  const x = obstacle.x * 24;
  const y = rowIndex * 24;
  const frontX = row.direction > 0 ? x + bodyWidth - 3 : x + 3;
  return (
    <g key={`vehicle-${rowIndex}-${index}`} className="phase6-crossing__vehicle">
      <rect fill="#10171a" opacity=".55" height="13" rx="4" width={bodyWidth} x={x + 2} y={y + 7} />
      <rect fill="#141a1d" height="4" rx="1" width={bodyWidth - 8} x={x + 4} y={y + 4} />
      <rect fill="#141a1d" height="4" rx="1" width={bodyWidth - 8} x={x + 4} y={y + 16} />
      <rect fill={color} height="13" rx="4" stroke="#1b2225" strokeWidth="1" width={bodyWidth} x={x + 1} y={y + 5.5} />
      <rect fill="#9eb9b6" height="8" rx="2.5" width={Math.max(9, bodyWidth * .4)} x={x + bodyWidth * .3} y={y + 8} />
      <path d={`M${x + bodyWidth * .48} ${y + 9}v6`} stroke="#26363a" strokeOpacity=".7" />
      <rect fill="#f3d996" height="2.4" rx="1" width="2.4" x={frontX} y={y + 7} />
      <rect fill="#ef8975" height="2.2" rx="1" width="2.2" x={row.direction > 0 ? x + 1 : x + bodyWidth - 3} y={y + 15} />
      <path d={`M${x + 7} ${y + 7}h${Math.max(4, bodyWidth * .16)}M${x + bodyWidth - 7} ${y + 17}h-${Math.max(4, bodyWidth * .16)}`} stroke="#f2e8c9" strokeOpacity=".55" strokeWidth="1" />
    </g>
  );
}

function drawLog(obstacle: CrossingObstacle, rowIndex: number, index: number) {
  const x = obstacle.x * 24;
  const y = rowIndex * 24;
  const width = obstacle.width * 24;
  const bark = ["#806247", "#765840", "#8d6a48"][obstacle.variant % 3];
  return (
    <g key={`log-${rowIndex}-${index}`} className="phase6-crossing__log">
      <rect fill="#10242a" opacity=".55" height="15" rx="7" width={width} x={x + 1} y={y + 6} />
      <rect fill={bark} height="13" rx="6" stroke="#493d33" strokeWidth="1" width={width} x={x} y={y + 4.5} />
      <path d={`M${x + 8} ${y + 8}h${Math.max(2, width - 16)}M${x + 12} ${y + 14}h${Math.max(1, width - 25)}`} fill="none" stroke="#b89971" strokeOpacity=".55" strokeWidth="1" />
      <ellipse cx={x + 5} cy={y + 11} fill="#b08b61" rx="3" ry="5.5" />
      <ellipse cx={x + 5} cy={y + 11} fill="none" rx="1.2" ry="2.6" stroke="#70553d" strokeWidth=".7" />
      <ellipse cx={x + width - 5} cy={y + 11} fill="#b08b61" rx="3" ry="5.5" />
      <ellipse cx={x + width - 5} cy={y + 11} fill="none" rx="1.2" ry="2.6" stroke="#70553d" strokeWidth=".7" />
    </g>
  );
}

export function Phase6PixelCrossing({ best, onBest }: Props) {
  const { t } = useTranslation();
  const [game, setGame] = useState(createPixelCrossing);
  const gameRef = useRef(game);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const commit = useCallback((next: typeof game) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  useEffect(() => {
    if (game.score > (best ?? 0)) onBest(game.score);
  }, [best, game.score, onBest]);

  useEffect(() => {
    if (game.status !== "playing") return undefined;
    let frame = 0;
    let last = 0;
    let accumulator = 0;
    const tick = (time: number) => {
      if (last) accumulator += Math.min(0.05, (time - last) / 1000);
      last = time;
      if (accumulator >= 1 / 30) {
        commit(stepPixelCrossing(gameRef.current, accumulator));
        accumulator = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [commit, game.status]);

  const move = (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => commit(movePixelCrossing(gameRef.current, dx, dy));
  const begin = () => commit(startPixelCrossing(gameRef.current));
  const restart = () => commit(resetPixelCrossing());
  const failureMessage = game.collision === "road"
    ? t("arcade.phase6.crossing.roadHit")
    : game.collision === "river"
      ? t("arcade.phase6.crossing.riverHit")
      : game.collision === "edge"
        ? t("arcade.phase6.crossing.edgeHit")
        : undefined;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isGameControlTarget(event.target)) return;
      if (gameRef.current.status === "ready" && (event.code === "Space" || event.code === "Enter")) {
        event.preventDefault();
        begin();
        return;
      }
      if (gameRef.current.status !== "playing") return;
      const movement: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = {
        ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
        ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
      };
      const direction = movement[event.key] ?? movement[event.key.toLowerCase()];
      if (!direction) return;
      event.preventDefault();
      move(direction[0], direction[1]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Phase6GameFrame
      best={best}
      gameId="pixel-crossing"
      gameKey="crossing"
      statusMessage={failureMessage}
      onPause={() => commit({ ...gameRef.current, status: "paused" })}
      onResume={() => commit({ ...gameRef.current, status: "playing" })}
      onRestart={restart}
      onStart={begin}
      score={game.score}
      status={game.status}
    >
      <svg
        aria-label={t("arcade.phase6.crossing.board")}
        className="phase6-crossing__board"
        onPointerDown={(event) => {
          swipeStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start || gameRef.current.status !== "playing") return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
          if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
          else move(0, dy > 0 ? 1 : -1);
        }}
        role="img"
        viewBox="0 0 360 312"
      >
        <defs>
          <linearGradient id="crossing-river" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#284857" />
            <stop offset="50%" stopColor="#345b68" />
            <stop offset="100%" stopColor="#263f4c" />
          </linearGradient>
          <pattern height="24" id="crossing-grass" patternUnits="userSpaceOnUse" width="24">
            <rect fill="#293d34" height="24" width="24" />
            <path d="M3 5h2m12 4h2M8 18h2m9 3h2" stroke="#719076" strokeOpacity=".38" strokeWidth="1.5" />
            <path d="M6 13h1m11-9h1m-13 17h1" stroke="#b29b6e" strokeOpacity=".32" />
          </pattern>
        </defs>
        <g className="phase6-crossing__world">
          {game.rows.map((row, rowIndex) => {
            const y = rowIndex * 24;
            return (
              <g className={`phase6-crossing__lane phase6-crossing__lane--${row.kind}`} key={rowIndex}>
                <rect fill={row.kind === "river" ? "url(#crossing-river)" : row.kind === "road" ? "#30373b" : "url(#crossing-grass)"} height="24" width="360" y={y} />
                {row.kind === "road" && <>
                  <path d={`M0 ${y + 1}h360M0 ${y + 23}h360`} stroke="#d4b777" strokeOpacity=".62" strokeWidth="1" />
                  <path d={`M0 ${y + 3}h360M0 ${y + 21}h360`} stroke="#687276" strokeOpacity=".42" />
                  <path d={`M0 ${y + 12}h360`} stroke="#d9d3bb" strokeDasharray="7 12" strokeOpacity=".42" strokeWidth=".8" />
                  {Array.from({ length: 4 }, (_, mark) => <path key={mark} d={`M${mark * 96 + 12} ${y + 5}v2m${mark * 96 + 45} ${y + 16}v2`} stroke="#87908b" strokeOpacity=".35" />)}
                </>}
                {row.kind === "river" && <>
                  <path d={`M0 ${y + 2}h360M0 ${y + 22}h360`} stroke="#91b5b4" strokeOpacity=".48" />
                  <path className="phase6-crossing__water" d={`M0 ${y + 5}q12-4 24 0t24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0 24 0`} fill="none" stroke="#a9d0cc" strokeOpacity=".3" strokeWidth="1" />
                  <path className="phase6-crossing__water phase6-crossing__water--slow" d={`M0 ${y + 19}q9-3 18 0t18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0 18 0`} fill="none" stroke="#b9d8d1" strokeOpacity=".24" strokeWidth=".8" />
                </>}
                {row.kind === "safe" && <>
                  <path d={`M${(rowIndex * 13) % 40 + 8} ${y + 17}l2-4 2 4m${(rowIndex * 19) % 60 + 27} ${y + 8}l2-3 2 3`} fill="none" stroke="#9bb27c" strokeOpacity=".55" strokeWidth="1" />
                  {(rowIndex % 3 === 1) && <g fill="#95a779" opacity=".7"><circle cx={(rowIndex * 29) % 280 + 28} cy={y + 7} r="1.3" /><circle cx={(rowIndex * 37) % 260 + 43} cy={y + 18} r="1.5" /></g>}
                </>}
                {row.obstacles.map((obstacle, index) => row.kind === "river"
                  ? drawLog(obstacle, rowIndex, index)
                  : row.kind === "road"
                    ? drawVehicle(row, obstacle, rowIndex, index)
                    : null)}
                <path d={`M0 ${y + 24}h360`} stroke="var(--surface-0)" strokeOpacity=".16" />
              </g>
            );
          })}
        </g>
        {Array.from({ length: 16 }, (_, index) => <path key={`grid-${index}`} d={`M${index * 24} 0v312`} stroke="var(--surface-0)" strokeOpacity=".075" pointerEvents="none" />)}
        <g className={`phase6-crossing__player${game.status === "over" ? " is-hit" : ""}`} transform={`translate(${game.playerX * 24} ${game.playerY * 24})`}>
          <ellipse cx="12" cy="21" fill="#101614" opacity=".55" rx="9" ry="2.5" />
          <path d="M5 16v4m14-4v4" stroke="#d48b52" strokeLinecap="round" strokeWidth="3" />
          <ellipse cx="12" cy="13" fill="#d7a35f" rx="8" ry="7" stroke="#493d33" strokeWidth="1" />
          <path d="M7 10q5-7 10 0v7H7z" fill="#81a28c" stroke="#31443d" strokeWidth="1" />
          <circle cx="12" cy="10" fill="#92b39a" r="5" stroke="#31443d" strokeWidth="1" />
          <circle cx="10.5" cy="9.5" fill="#f0ead6" r="1.3" />
          <circle cx="14" cy="9.5" fill="#f0ead6" r="1.3" />
          <circle cx="10.7" cy="9.7" fill="#273231" r=".55" />
          <circle cx="14.1" cy="9.7" fill="#273231" r=".55" />
          <path d="M11 12h2l-1 1.6z" fill="#d98755" />
          <path d="M6 13l-2 2m12-2 2 2" stroke="#bcd1bb" strokeLinecap="round" strokeWidth="1.4" />
        </g>
      </svg>
      <div aria-label={t("arcade.phase6.crossing.controls")} className="phase6-crossing__controls">
        <span />
        <button aria-label={t("arcade.phase6.crossing.up")} onClick={() => move(0, -1)} type="button">↑</button>
        <span />
        <button aria-label={t("arcade.phase6.crossing.left")} onClick={() => move(-1, 0)} type="button">←</button>
        <button aria-label={t("arcade.phase6.crossing.down")} onClick={() => move(0, 1)} type="button">↓</button>
        <button aria-label={t("arcade.phase6.crossing.right")} onClick={() => move(1, 0)} type="button">→</button>
      </div>
      <p className="phase6-game__hint">{t("arcade.phase6.crossing.hint")}</p>
    </Phase6GameFrame>
  );
}
