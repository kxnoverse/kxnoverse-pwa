import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPerfectStack, dropPerfectStack, resetPerfectStack, startPerfectStack, stepPerfectStack } from "../data/phase6/perfect-stack";
import { isGameControlTarget, Phase6GameFrame } from "./Phase6GameFrame";

interface Props {
  best?: number;
  onBest: (score: number) => void;
}

export function Phase6PerfectStack({ best, onBest }: Props) {
  const { t } = useTranslation();
  const [game, setGame] = useState(createPerfectStack);
  const gameRef = useRef(game);
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
        commit(stepPerfectStack(gameRef.current, accumulator));
        accumulator = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [commit, game.status]);

  const place = () => commit(dropPerfectStack(gameRef.current));
  const begin = () => commit(startPerfectStack(gameRef.current));
  const restart = () => commit(resetPerfectStack());
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.code !== "Enter") return;
      if (isGameControlTarget(event.target)) return;
      event.preventDefault();
      if (gameRef.current.status === "ready") begin();
      else if (gameRef.current.status === "playing") place();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const offsetY = Math.max(0, (game.blocks.length - 9) * 22);
  const currentY = 328 - game.blocks.length * 22 + offsetY;
  const top = game.blocks[game.blocks.length - 1];
  return (
    <Phase6GameFrame
      best={best}
      gameId="perfect-stack"
      gameKey="stack"
      onPause={() => commit({ ...gameRef.current, status: "paused" })}
      onResume={() => commit({ ...gameRef.current, status: "playing" })}
      onRestart={restart}
      onStart={begin}
      score={game.score}
      status={game.status}
    >
      <svg
        aria-label={t("arcade.phase6.stack.board")}
        className="phase6-stack__board"
        onPointerDown={(event) => {
          if (gameRef.current.status === "playing" && event.button === 0) place();
        }}
        role="img"
        viewBox="0 0 640 360"
      >
        <defs>
          <pattern height="22" id="phase6-stack-grid" patternUnits="userSpaceOnUse" width="22">
            <path d="M22 0H0V22" fill="none" stroke="var(--line)" strokeWidth=".7" />
          </pattern>
        </defs>
        <rect fill="var(--surface-0)" height="360" width="640" />
        <rect fill="url(#phase6-stack-grid)" height="360" opacity=".3" width="640" />
        <path d="M0 329.5h640" stroke="var(--line)" />
        {game.blocks.map((block, index) => {
          const y = Math.max(0, block.y + offsetY);
          return <rect fill={index === game.blocks.length - 1 ? "var(--game-accent)" : "color-mix(in srgb, var(--game-accent) 46%, var(--surface-1))"} height="20" key={`${index}-${block.x}`} rx="2" width={block.width} x={block.x} y={y} />;
        })}
        {game.status !== "over" && <rect fill="var(--game-accent-strong)" height="20" opacity=".92" rx="2" width={top.width} x={game.movingX} y={Math.max(0, currentY)} />}
      </svg>
      {game.combo > 1 && <p className="phase6-stack__combo">{t("arcade.phase6.stack.combo", { count: game.combo })}</p>}
    </Phase6GameFrame>
  );
}
