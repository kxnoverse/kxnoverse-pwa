import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { applyPwaUpdate, subscribeToPwaUpdate } from "../data/pwa-update-state";

export function PwaUpdateNotice() {
  const { t } = useTranslation();
  const location = useLocation();
  const [available, setAvailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isPlaying = location.pathname.startsWith("/minigames/");

  useEffect(() => {
    return subscribeToPwaUpdate((next) => {
      setAvailable(next.available);
      setFailed(next.failed);
      setDismissed(false);
    });
  }, []);

  async function applyUpdate() {
    if (!window.confirm(t("app.updateConfirm"))) return;
    setApplying(true);
    setFailed(false);
    try {
      await applyPwaUpdate();
    } catch (error) {
      console.error("Kxno Desk service worker update failed.", error);
      setApplying(false);
      setFailed(true);
    }
  }

  if (isPlaying || dismissed || (!available && !failed)) return null;

  return (
    <aside aria-live="polite" className="pwa-update-notice" role="status">
      <span>{failed ? t("app.updateFailed") : t("app.updateAvailable")}</span>
      {available && (
        <button className="button button--primary" disabled={applying} onClick={() => void applyUpdate()} type="button">
          {t("app.updateNow")}
        </button>
      )}
      <button aria-label={t("app.updateLater")} className="inline-button" onClick={() => setDismissed(true)} type="button">
        {t("app.updateLater")}
      </button>
    </aside>
  );
}
