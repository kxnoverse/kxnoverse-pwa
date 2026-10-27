import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GameId } from "../data/arcade";

export type Phase6Status = "ready" | "playing" | "paused" | "levelComplete" | "over";

export function isGameControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest("button, a, input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

interface Phase6GameFrameProps {
  gameId: GameId;
  gameKey: string;
  status: Phase6Status;
  score: number;
  best?: number;
  children: ReactNode;
  onStart?: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onNextLevel?: () => void;
  error?: string;
  statusMessage?: string;
  hideActions?: boolean;
  hideOverlay?: boolean;
}

export function Phase6GameFrame({
  gameId,
  gameKey,
  status,
  score,
  best,
  children,
  onStart,
  onPause,
  onResume,
  onRestart,
  onNextLevel,
  error,
  statusMessage,
  hideActions = false,
  hideOverlay = false,
}: Phase6GameFrameProps) {
  const { t } = useTranslation();
  const overlayKey = status === "paused"
    ? "arcade.phase6.paused"
    : status === "over"
      ? `arcade.phase6.${gameKey}.over`
      : status === "levelComplete"
        ? `arcade.phase6.${gameKey}.complete`
        : status === "ready"
          ? `arcade.phase6.${gameKey}.ready`
          : "";

  return (
    <div className={`phase6-game phase6-game--${gameKey}`} data-game={gameId}>
      <div className="phase6-game__toolbar">
        <div className="phase6-game__stats">
          <span>{t("arcade.score")} <strong>{score}</strong></span>
          <span>{t("arcade.best")} <strong>{best ?? "—"}</strong></span>
        </div>
        {!hideActions && <div className="phase6-game__actions">
          {status === "ready" && onStart && <button className="button button--primary" onClick={onStart} type="button"><Play size={13} />{t("arcade.start")}</button>}
          {status === "playing" && <button className="button button--quiet" onClick={onPause} type="button"><Pause size={13} />{t("arcade.pause")}</button>}
          {status === "paused" && <button className="button button--primary" onClick={onResume} type="button"><Play size={13} />{t("arcade.resume")}</button>}
          {status === "levelComplete" && onNextLevel && <button className="button button--primary" onClick={onNextLevel} type="button"><ArrowRight size={13} />{t(`arcade.phase6.${gameKey}.next`)}</button>}
          {(status === "over" || status === "levelComplete") && <button className="button button--quiet" onClick={onRestart} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>}
        </div>}
      </div>
      <div className="phase6-game__stage" data-status={status}>
        {children}
        {!hideOverlay && overlayKey && <div className="phase6-game__overlay" role="status"><span>{statusMessage ?? t(overlayKey)}</span></div>}
      </div>
      {error && <p className="phase6-game__error" role="alert">{error}</p>}
    </div>
  );
}
