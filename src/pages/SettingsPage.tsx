import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ImagePlus, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { BackgroundLayer } from "../components/BackgroundLayer";
import { BrandMark } from "../components/BrandMark";
import { defaultAppearance, useUiStore, type Appearance } from "../stores/ui-store";
import { builtInThemes, type ThemePreset } from "../data/theme-presets";
import { createId } from "../data/db";
import { Link } from "react-router-dom";
import { exportDataBackup, importDataBackup } from "../data/backup";
import { germanStates } from "../data/regional-calendar";
import { createLessonPeriods, minutesOfDay, parseLessonGrid, reflowTimetableEntries } from "../data/lesson-grid";
import { assistantClient, AssistantServiceError } from "../data/ai-client";
import { TurnstileChallenge } from "../components/TurnstileChallenge";

const styles: Appearance["backgroundStyle"][] = ["solid", "grid", "glow", "chrome", "custom"];

function hueFromHex(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;
  const hue = max === red
    ? ((green - blue) / delta) % 6
    : max === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return Math.round((hue * 60 + 360) % 360);
}

function hexWithHue(hex: string, hue: number, brightness?: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const sourceLightness = (max + min) / 2;
  const lightness = brightness === undefined
    ? sourceLightness
    : 0.08 + Math.min(100, Math.max(0, brightness)) / 100 * 0.84;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * sourceLightness - 1));
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = lightness - chroma / 2;
  const rgb = section < 1 ? [chroma, secondary, 0]
    : section < 2 ? [secondary, chroma, 0]
      : section < 3 ? [0, chroma, secondary]
        : section < 4 ? [0, secondary, chroma]
          : section < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return `#${rgb.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function brightnessFromHex(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 50;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const lightness = (Math.max(...channels) + Math.min(...channels)) / 2;
  return Math.round(Math.min(100, Math.max(0, (lightness - 0.08) / 0.84 * 100)));
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const appearance = useUiStore((state) => state.appearance);
  const setAppearance = useUiStore((state) => state.setAppearance);
  const image = useLiveQuery(() => db.settings.get("backgroundImage"), [], undefined)?.value;
  const profile = useLiveQuery(() => db.settings.get("profileName"), [], undefined);
  const daysSetting = useLiveQuery(() => db.settings.get("schoolDays"), [], undefined);
  const schoolStartSetting = useLiveQuery(() => db.settings.get("schoolStartTime"), [], undefined);
  const lessonGridSetting = useLiveQuery(() => db.settings.get("lessonGrid"), [], undefined);
  const schoolStateSetting = useLiveQuery(() => db.settings.get("schoolState"), [], undefined);
  const customThemesSetting = useLiveQuery(() => db.settings.get("customThemes"), [], undefined);
  const selectedTheme = useLiveQuery(() => db.settings.get("selectedTheme"), [], undefined)?.value ?? "arctic";
  const aiEndpointSetting = useLiveQuery(() => db.settings.get("aiBackendUrl"), [], undefined);
  const aiCloudEnabledSetting = useLiveQuery(() => db.settings.get("aiCloudEnabled"), [], undefined);
  const aiCloudConsentSetting = useLiveQuery(() => db.settings.get("aiCloudConsentEndpoint"), [], undefined);
  const turnstileSiteKeySetting = useLiveQuery(() => db.settings.get("turnstileSiteKey"), [], undefined);
  const localRecordCount = useLiveQuery(async () => {
    const counts = await Promise.all([
      db.subjects.count(), db.teachers.count(), db.timetable.count(), db.exceptions.count(),
      db.aiPresets.count(), db.aiConversations.count(), db.aiMessages.count(), db.tasks.count(),
      db.aiAttachments.count(),
      db.calendarEvents.count(), db.notes.count(), db.focusSessions.count(), db.files.count(),
    ]);
    return counts.reduce((total, count) => total + count, 0);
  }, [], 0);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [backupNotice, setBackupNotice] = useState("");
  const [aiEndpointDraft, setAiEndpointDraft] = useState("");
  const [turnstileSiteKeyDraft, setTurnstileSiteKeyDraft] = useState("");
  const [turnstileVersion, setTurnstileVersion] = useState(0);
  const pendingTurnstileToken = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | undefined>(undefined);
  const [aiEndpointError, setAiEndpointError] = useState("");
  const [aiEndpointSaved, setAiEndpointSaved] = useState(false);
  const [turnstileSiteKeySaved, setTurnstileSiteKeySaved] = useState(false);
  const [aiConnectionState, setAiConnectionState] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [nameDraft, setNameDraft] = useState("");
  const [themeNameDraft, setThemeNameDraft] = useState("");
  const customThemes = useMemo<ThemePreset[]>(() => {
    try {
      const items = customThemesSetting?.value ? JSON.parse(customThemesSetting.value) as ThemePreset[] : [];
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }, [customThemesSetting?.value]);
  const schoolDays = useMemo(() => {
    try {
      const days = daysSetting?.value ? JSON.parse(daysSetting.value) as boolean[] : undefined;
      return Array.from({ length: 7 }, (_, index) => days?.[index] ?? index < 5);
    } catch {
      return Array.from({ length: 7 }, (_, index) => index < 5);
    }
  }, [daysSetting?.value]);
  const aiCloudEnabled = aiCloudEnabledSetting?.value === "true";
  const aiCloudConsent = Boolean(aiEndpointSetting?.value && aiCloudConsentSetting?.value === aiEndpointSetting.value);
  const [colorDrafts, setColorDrafts] = useState({
    accent: appearance.accent,
    background: appearance.background,
    surface: appearance.surface,
  });

  useEffect(() => () => {
    const pending = pendingTurnstileToken.current;
    pendingTurnstileToken.current = undefined;
    pending?.reject(new DOMException("Turnstile request cancelled.", "AbortError"));
  }, []);

  useEffect(() => {
    setColorDrafts({
      accent: appearance.accent,
      background: appearance.background,
      surface: appearance.surface,
    });
  }, [appearance.accent, appearance.background, appearance.surface]);

  useEffect(() => setNameDraft(profile?.value ?? "User"), [profile?.value]);
  useEffect(() => setAiEndpointDraft(aiEndpointSetting?.value ?? ""), [aiEndpointSetting?.value]);
  useEffect(() => setTurnstileSiteKeyDraft(turnstileSiteKeySetting?.value ?? ""), [turnstileSiteKeySetting?.value]);
  useEffect(() => {
    const theme = [...builtInThemes, ...customThemes].find((item) => item.id === selectedTheme);
    setThemeNameDraft(theme?.name ?? "");
  }, [customThemes, selectedTheme]);

  async function saveThemeList(next: ThemePreset[]) {
    try {
      await db.settings.put({ key: "customThemes", value: JSON.stringify(next) });
      setError("");
      return true;
    } catch {
      setError("saveError");
      return false;
    }
  }

  async function applyTheme(theme: ThemePreset) {
    try {
      if (theme.id !== "custom") {
        const uiScale = useUiStore.getState().appearance.uiScale;
        useUiStore.getState().updateAppearance({ ...defaultAppearance, ...theme.appearance, uiScale });
      }
      await db.settings.put({ key: "selectedTheme", value: theme.id });
      setError("");
    } catch {
      setError("saveError");
    }
  }

  async function saveCurrentTheme() {
    const preset: ThemePreset = {
      id: createId(),
      name: themeNameDraft.trim() || t("settings.customTheme"),
      appearance: { ...appearance },
    };
    if (!await saveThemeList([...customThemes, preset])) return;
    try {
      await db.settings.put({ key: "selectedTheme", value: preset.id });
    } catch {
      setError("saveError");
    }
  }

  async function renameSelectedTheme() {
    if (!themeNameDraft.trim()) return;
    await saveThemeList(customThemes.map((theme) => theme.id === selectedTheme ? { ...theme, name: themeNameDraft.trim() } : theme));
  }

  async function duplicateSelectedTheme() {
    const selected = [...builtInThemes, ...customThemes].find((theme) => theme.id === selectedTheme);
    if (!selected) return;
    const duplicate = {
      ...selected,
      id: createId(),
      name: `${selected.name} ${t("timetable.copySuffix")}`,
      appearance: selected.id === "custom" ? { ...appearance } : { ...selected.appearance },
    };
    if (!await saveThemeList([...customThemes, { ...duplicate, builtIn: false }])) return;
    try {
      await db.settings.put({ key: "selectedTheme", value: duplicate.id });
    } catch {
      setError("saveError");
    }
  }

  async function deleteSelectedTheme() {
    if (!customThemes.some((theme) => theme.id === selectedTheme)) return;
    const next = customThemes.filter((theme) => theme.id !== selectedTheme);
    if (!await saveThemeList(next)) return;
    await applyTheme(builtInThemes.find((theme) => theme.id === "amethyst")!);
  }

  async function restoreThemeDefaults() {
    if (!window.confirm(t("settings.confirmRestoreThemes"))) return;
    if (!await saveThemeList([])) return;
    await applyTheme(builtInThemes.find((theme) => theme.id === "obsidian")!);
  }

  async function updateSchoolDay(index: number, enabled: boolean) {
    const next = schoolDays.map((day, dayIndex) => dayIndex === index ? enabled : day);
    try {
      await db.settings.put({ key: "schoolDays", value: JSON.stringify(next) });
    } catch {
      setError("saveError");
    }
  }

  async function updateSchoolStartTime(value: string) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || value > "23:00") {
      setError("saveError");
      return;
    }
    try {
      const previousStart = schoolStartSetting?.value ?? "08:15";
      const lessonGrid = parseLessonGrid(lessonGridSetting?.value);
      const previousPeriods = createLessonPeriods(previousStart, lessonGrid);
      const nextPeriods = createLessonPeriods(value, lessonGrid);
      if (minutesOfDay(nextPeriods[nextPeriods.length - 1]?.end ?? "00:00") > 23 * 60 + 59) {
        setError("saveError");
        return;
      }
      await db.transaction("rw", db.settings, db.timetable, db.exceptions, async () => {
        const entries = await db.timetable.toArray();
        await db.timetable.bulkPut(reflowTimetableEntries(entries, previousPeriods, nextPeriods));
        const exceptions = await db.exceptions.toArray();
        await db.exceptions.bulkPut(exceptions.map((exception) => exception.extra
          ? { ...exception, extra: reflowTimetableEntries([exception.extra], previousPeriods, nextPeriods)[0] }
          : exception));
        await db.settings.put({ key: "schoolStartTime", value });
      });
      setError("");
    } catch {
      setError("saveError");
    }
  }

  async function updateSchoolState(value: string) {
    if (value && !germanStates.includes(value as (typeof germanStates)[number])) {
      setError("saveError");
      return;
    }
    try {
      await db.settings.put({ key: "schoolState", value });
      setError("");
    } catch {
      setError("saveError");
    }
  }

  async function saveAiEndpoint() {
    const value = aiEndpointDraft.trim().replace(/\/+$/, "");
    setAiEndpointSaved(false);
    if (value) {
      try {
        const endpoint = new URL(value);
        const localHttp = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
        if ((endpoint.protocol !== "https:" && !localHttp) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          setAiEndpointError("invalidAiEndpoint");
          return;
        }
      } catch {
        setAiEndpointError("invalidAiEndpoint");
        return;
      }
    }
    try {
      await db.settings.put({ key: "aiBackendUrl", value });
      setAiEndpointDraft(value);
      setAiEndpointError("");
      setAiEndpointSaved(true);
      setAiConnectionState("idle");
    } catch {
      setAiEndpointError("saveError");
    }
  }

  async function setAiCloudEnabled(enabled: boolean) {
    try {
      await db.settings.put({ key: "aiCloudEnabled", value: String(enabled) });
      setAiConnectionState("idle");
    } catch {
      setAiEndpointError("saveError");
    }
  }

  async function setAiCloudConsent(approved: boolean) {
    if (!aiEndpointSetting?.value) return;
    try {
      await db.settings.put({ key: "aiCloudConsentEndpoint", value: approved ? aiEndpointSetting.value : "" });
      setAiEndpointError("");
    } catch {
      setAiEndpointError("saveError");
    }
  }

  function requestTurnstileToken(): Promise<string> {
    if (pendingTurnstileToken.current) return Promise.reject(new Error("A Turnstile request is already in progress."));
    return new Promise((resolve, reject) => {
      pendingTurnstileToken.current = { resolve, reject };
      setTurnstileVersion((version) => version + 1);
    });
  }

  function receiveTurnstileToken(token: string) {
    const pending = pendingTurnstileToken.current;
    if (!pending || !token) return;
    pendingTurnstileToken.current = undefined;
    pending.resolve(token);
  }

  function rejectTurnstileToken(error: Error) {
    const pending = pendingTurnstileToken.current;
    if (!pending) return;
    pendingTurnstileToken.current = undefined;
    pending.reject(error);
  }

  async function saveTurnstileSiteKey() {
    const value = turnstileSiteKeyDraft.trim();
    setTurnstileSiteKeySaved(false);
    if (value && !/^[A-Za-z0-9_-]{10,128}$/.test(value)) {
      setAiEndpointError("invalidTurnstileSiteKey");
      return;
    }
    try {
      await db.settings.put({ key: "turnstileSiteKey", value });
      setAiEndpointError("");
      setTurnstileSiteKeySaved(true);
      setAiConnectionState("idle");
    } catch {
      setAiEndpointError("saveError");
    }
  }

  async function testAiConnection() {
    if (!aiCloudEnabled || !aiCloudConsent || !aiEndpointSetting?.value || !turnstileSiteKeySetting?.value) return;
    setAiConnectionState("testing");
    try {
      const token = await requestTurnstileToken();
      await assistantClient.testConnection(aiEndpointSetting.value, token);
      setAiConnectionState("connected");
      setAiEndpointError("");
    } catch (cause) {
      setAiConnectionState("error");
      setAiEndpointError(cause instanceof AssistantServiceError ? `aiConnection.${cause.code}` : "aiConnection.requestFailed");
    }
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) {
      setError("imageError");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError("imageError");
    reader.onload = async () => {
      if (typeof reader.result !== "string") {
        setError("imageError");
        return;
      }
      try {
        await db.settings.put({ key: "backgroundImage", value: reader.result });
        setAppearance("backgroundStyle", "custom");
        setError("");
      } catch {
        setError("imageError");
      }
    };
    reader.readAsDataURL(file);
  }

  async function exportBackup() {
    try {
      const backup = await exportDataBackup();
      const url = URL.createObjectURL(backup);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kxnodesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setBackupNotice("");
    } catch (cause) {
      setBackupNotice(`${t("settings.backupUnavailable")}${cause instanceof Error ? ` ${cause.message}` : ""}`);
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected || !window.confirm(t("settings.confirmBackupImport"))) return;
    try {
      const summary = await importDataBackup(selected);
      const added = Object.values(summary).reduce((total, result) => total + result.added, 0);
      const skipped = Object.values(summary).reduce((total, result) => total + result.skipped, 0);
      setBackupNotice(t("settings.backupImportSuccess", { added, skipped }));
    } catch (cause) {
      setBackupNotice(`${t("settings.backupError")}${cause instanceof Error ? ` ${cause.message}` : ""}`);
    }
  }

  const range = (
    label: string,
    key: "textContrast" | "borderIntensity" | "cornerRadius" | "intensity" | "opacity" | "gridSpacing" | "imageBlur" | "imageOverlay" | "animationSpeed" | "reflectionStrength" | "accentInfluence" | "uiScale",
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="setting-row">
      <span>{label}</span>
      <input
        aria-label={label}
        max={max}
        min={min}
        onChange={(event) => setAppearance(key, Number(event.target.value))}
        step={step}
        type="range"
        value={appearance[key]}
      />
      <output>{key === "cornerRadius" || key === "gridSpacing" || key === "imageBlur" ? Math.round(appearance[key]) : `${Math.round(appearance[key] * 100)}%`}</output>
    </label>
  );

  const toggle = (
    label: string,
    key: "highlights" | "cursorReactive" | "animateBackground" | "performanceMode",
  ) => (
    <label className="setting-row setting-row--toggle">
      <span>{label}</span>
      <input
        aria-label={label}
        checked={appearance[key]}
        onChange={(event) => setAppearance(key, event.target.checked)}
        type="checkbox"
      />
    </label>
  );

  const color = (label: string, key: "accent" | "background" | "surface") => {
    const draftColor = /^#[0-9a-f]{6}$/i.test(colorDrafts[key]) ? colorDrafts[key] : appearance[key];
    const commitColor = () => {
      if (/^#[0-9a-f]{6}$/i.test(colorDrafts[key])) setAppearance(key, colorDrafts[key]);
    };

    return (
      <div className="setting-row setting-row--color">
        <span>{label}</span>
        <span className="setting-color-swatch" style={{ backgroundColor: draftColor }} aria-hidden="true" />
        <div className="setting-color-sliders">
          <input
            aria-label={`${label} hue`}
            className="setting-color-slider"
            max={359}
            min={0}
            onBlur={commitColor}
            onChange={(event) => {
              const base = /^#[0-9a-f]{6}$/i.test(colorDrafts[key]) ? colorDrafts[key] : appearance[key];
              setColorDrafts((draft) => ({ ...draft, [key]: hexWithHue(base, Number(event.target.value)) }));
            }}
            onKeyUp={commitColor}
            onPointerUp={commitColor}
            step={1}
            type="range"
            value={hueFromHex(draftColor)}
          />
          <input
            aria-label={`${label} ${t("settings.brightness")}`}
            className="setting-color-brightness"
            max={100}
            min={0}
            onBlur={commitColor}
            onChange={(event) => {
              const base = /^#[0-9a-f]{6}$/i.test(colorDrafts[key]) ? colorDrafts[key] : appearance[key];
              setColorDrafts((draft) => ({ ...draft, [key]: hexWithHue(base, hueFromHex(base), Number(event.target.value)) }));
            }}
            onKeyUp={commitColor}
            onPointerUp={commitColor}
            step={1}
            style={{ "--brightness-color": draftColor } as React.CSSProperties}
            type="range"
            value={brightnessFromHex(draftColor)}
          />
        </div>
        <input
          aria-label={`${label} HEX`}
          className="setting-color-hex"
          maxLength={7}
          pattern="#[0-9a-fA-F]{6}"
          value={colorDrafts[key]}
          onChange={(event) => {
            const next = event.target.value;
            setColorDrafts((draft) => ({ ...draft, [key]: next }));
            if (/^#[0-9a-f]{6}$/i.test(next)) setAppearance(key, next);
          }}
        />
      </div>
    );
  };

  return (
    <section className="settings-page">
      <div className="settings-heading">
        <h1>{t("settings.title")}</h1>
        <button className="icon-button" onClick={() => useUiStore.getState().updateAppearance(defaultAppearance)} title={t("settings.reset")} aria-label={t("settings.reset")} type="button">
          <RotateCcw size={15} />
        </button>
      </div>

      <section className="settings-section settings-section--profile">
        <h2>{t("settings.profile")}</h2>
        <label className="setting-row">
          <span>{t("settings.displayName")}</span>
          <input
            aria-label={t("settings.displayName")}
            maxLength={60}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => void db.settings.put({ key: "profileName", value: nameDraft.trim() }).catch(() => setError("saveError"))}
          />
        </label>
      </section>

      <section className="settings-section settings-section--language">
        <h2>{t("settings.language")}</h2>
        <label className="setting-row">
          <span>{t("settings.language")}</span>
          <select
            aria-label={t("settings.language")}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
            value={i18n.language.startsWith("de") ? "de" : "en"}
          >
            <option value="en">{t("settings.english")}</option>
            <option value="de">{t("settings.german")}</option>
          </select>
        </label>
        <label className="setting-row">
          <span>{t("settings.timeFormat")}</span>
          <select aria-label={t("settings.timeFormat")} value={appearance.hourFormat} onChange={(event) => setAppearance("hourFormat", event.target.value as "12" | "24")}>
            <option value="24">{t("settings.hour24")}</option>
            <option value="12">{t("settings.hour12")}</option>
          </select>
        </label>
      </section>

      <section className="settings-section settings-section--themes">
        <h2>{t("settings.themes")}</h2>
        <div className="theme-strip">
          {[...builtInThemes, ...customThemes].map((theme) => (
            <button
              aria-pressed={selectedTheme === theme.id}
              className={`theme-chip${selectedTheme === theme.id ? " theme-chip--selected" : ""}`}
              key={theme.id}
              onClick={() => void applyTheme(theme)}
              type="button"
            >
              <span className="theme-chip__swatches" style={{ "--theme-bg": theme.appearance.background ?? appearance.background, "--theme-surface": theme.appearance.surface ?? appearance.surface, "--theme-accent": theme.appearance.accent ?? appearance.accent } as React.CSSProperties}><i /><i /><i /></span>
              <span>{theme.name}</span>
            </button>
          ))}
        </div>
        <div className="theme-tools">
          <input aria-label={t("settings.themeName")} maxLength={32} value={themeNameDraft} onChange={(event) => setThemeNameDraft(event.target.value)} />
          <button className="button button--quiet" onClick={() => void saveCurrentTheme()} type="button">{t("settings.saveCustomTheme")}</button>
          <button className="button button--quiet" disabled={!customThemes.some((theme) => theme.id === selectedTheme)} onClick={() => void renameSelectedTheme()} type="button">{t("settings.renameTheme")}</button>
          <button className="button button--quiet" onClick={() => void duplicateSelectedTheme()} type="button">{t("settings.duplicateTheme")}</button>
          <button className="button button--quiet" disabled={!customThemes.some((theme) => theme.id === selectedTheme)} onClick={() => void deleteSelectedTheme()} type="button">{t("settings.deleteTheme")}</button>
          <button className="button button--quiet" onClick={() => void restoreThemeDefaults()} type="button">{t("settings.restoreThemeDefaults")}</button>
        </div>
      </section>

      <section className="settings-section settings-section--timetable">
        <h2>{t("settings.timetable")}</h2>
        <label className="setting-row">
          <span>{t("settings.schoolStartTime")}</span>
          <input
            aria-label={t("settings.schoolStartTime")}
            max="23:00"
            min="00:00"
            onChange={(event) => void updateSchoolStartTime(event.target.value)}
            type="time"
            value={schoolStartSetting?.value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schoolStartSetting.value) && schoolStartSetting.value <= "23:00" ? schoolStartSetting.value : "08:15"}
          />
          <output>{schoolStartSetting?.value ?? "08:15"}</output>
        </label>
        <div className="school-days">
          {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day, index) => (
            <label key={day}>
              <input aria-label={t(`weekdays.${day}`)} checked={schoolDays[index]} onChange={(event) => void updateSchoolDay(index, event.target.checked)} type="checkbox" />
              {t(`weekdays.${day}`).slice(0, 3)}
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section settings-section--region">
        <h2>{t("settings.schoolCalendar")}</h2>
        <label className="setting-row">
          <span>{t("settings.federalState")}</span>
          <select
            aria-label={t("settings.federalState")}
            onChange={(event) => void updateSchoolState(event.target.value)}
            value={germanStates.includes(schoolStateSetting?.value as (typeof germanStates)[number]) ? schoolStateSetting?.value : ""}
          >
            <option value="">{t("settings.selectFederalState")}</option>
            {germanStates.map((state) => <option key={state} value={state}>{t(`settings.states.${state}`)}</option>)}
          </select>
        </label>
        <p className="settings-hint">{t("settings.schoolCalendarHint")}</p>
      </section>

      <section className="settings-section settings-section--ai">
        <h2>{t("settings.ai")}</h2>
        <div className="ai-settings-row">
          <span>{t("settings.backendStatus")}</span>
          <span className="status-pill">{aiCloudEnabled ? t("settings.aiEnabled") : t("settings.aiDisabled")}</span>
          <Link className="button button--quiet" to="/assistant">{t("settings.openAssistant")}</Link>
        </div>
        <label className="ai-endpoint-field">
          <span>{t("settings.aiEndpoint")}</span>
          <input autoComplete="off" maxLength={300} onChange={(event) => { setAiEndpointDraft(event.target.value); setAiEndpointSaved(false); }} placeholder="https://your-worker.example.com" spellCheck={false} type="url" value={aiEndpointDraft} />
        </label>
        <div className="ai-endpoint-actions">
          <button className="button button--quiet" onClick={() => void saveAiEndpoint()} type="button">{t("settings.saveEndpoint")}</button>
          <span aria-live="polite">{aiEndpointSaved ? t("settings.aiEndpointSaved") : t("settings.aiEndpointHint")}</span>
        </div>
        <label className="ai-endpoint-field">
          <span>{t("settings.turnstileSiteKey")}</span>
          <input autoComplete="off" maxLength={128} onChange={(event) => { setTurnstileSiteKeyDraft(event.target.value); setTurnstileSiteKeySaved(false); }} placeholder={t("settings.turnstileSiteKeyPlaceholder")} spellCheck={false} type="text" value={turnstileSiteKeyDraft} />
        </label>
        <div className="ai-endpoint-actions">
          <button className="button button--quiet" onClick={() => void saveTurnstileSiteKey()} type="button">{t("settings.saveTurnstileSiteKey")}</button>
          <span aria-live="polite">{turnstileSiteKeySaved ? t("settings.turnstileSiteKeySaved") : t("settings.turnstileSiteKeyHint")}</span>
        </div>
        <label className="ai-cloud-toggle">
          <input checked={aiCloudEnabled} onChange={(event) => void setAiCloudEnabled(event.target.checked)} type="checkbox" />
          <span>{t("settings.enableCloudAi")}</span>
        </label>
        <label className="ai-cloud-toggle">
          <input checked={aiCloudConsent} disabled={!aiEndpointSetting?.value} onChange={(event) => void setAiCloudConsent(event.target.checked)} type="checkbox" />
          <span>{t("settings.aiCloudConsent")}</span>
        </label>
        <p className="settings-hint">{t("settings.aiCloudConsentHint")}</p>
        {aiCloudEnabled && turnstileSiteKeySetting?.value && (
          <TurnstileChallenge
            action="test"
            onError={rejectTurnstileToken}
            onToken={receiveTurnstileToken}
            requestId={turnstileVersion}
            siteKey={turnstileSiteKeySetting.value}
          />
        )}
        <div className="ai-endpoint-actions">
          <button className="button button--quiet" disabled={!aiCloudEnabled || !aiCloudConsent || !aiEndpointSetting?.value || !turnstileSiteKeySetting?.value || aiConnectionState === "testing"} onClick={() => void testAiConnection()} type="button">
            {aiConnectionState === "testing" ? t("settings.testingAi") : t("settings.testAiConnection")}
          </button>
          <span>{t(aiConnectionState === "connected" ? "settings.aiConnection.connected" : aiConnectionState === "error" ? "settings.aiConnection.requestFailed" : "settings.aiConnectionHint")}</span>
        </div>
        {aiEndpointError && <p className="form-error" role="alert">{t(`settings.${aiEndpointError}`)}</p>}
      </section>

      <section className="settings-section settings-section--appearance">
        <div className="settings-section__heading">
          <h2>{t("settings.appearance")}</h2>
        </div>
        <div className="appearance-layout">
          <div className="settings-controls">
            <label className="setting-row">
              <span>{t("settings.mode")}</span>
              <select
                aria-label={t("settings.mode")}
                value={appearance.mode}
                onChange={(event) => {
                  const mode = event.target.value as "dark" | "light";
                  if (
                    mode === "light" &&
                    appearance.background === defaultAppearance.background &&
                    appearance.surface === defaultAppearance.surface
                  ) {
                    useUiStore.getState().updateAppearance({
                      mode,
                      background: "#f0f1f3",
                      surface: "#f7f8fa",
                    });
                  } else if (
                    mode === "dark" &&
                    appearance.background === "#f0f1f3" &&
                    appearance.surface === "#f7f8fa"
                  ) {
                    useUiStore.getState().updateAppearance({
                      mode,
                      background: defaultAppearance.background,
                      surface: defaultAppearance.surface,
                    });
                  } else {
                    setAppearance("mode", mode);
                  }
                }}
              >
                <option value="dark">{t("settings.dark")}</option>
                <option value="light">{t("settings.light")}</option>
              </select>
            </label>
            {color(t("settings.accent"), "accent")}
            {color(t("settings.background"), "background")}
            {color(t("settings.surface"), "surface")}
            {range(t("settings.textContrast"), "textContrast", 0.7, 1.4, 0.05)}
            {range(t("settings.borderIntensity"), "borderIntensity", 0, 1, 0.05)}
            {range(t("settings.cornerRadius"), "cornerRadius", 0, 12, 1)}
            {range(t("settings.uiScale"), "uiScale", 0.8, 1.4, 0.05)}
            {error && <p className="form-error" role="alert">{t(`settings.${error}`)}</p>}
          </div>
        </div>
      </section>

      <section className="settings-section settings-section--background">
        <h2>{t("settings.backgroundSection")}</h2>
        <div className="appearance-layout">
          <div className="settings-controls">
            <label className="setting-row">
              <span>{t("settings.backgroundStyle")}</span>
              <select aria-label={t("settings.backgroundStyle")} value={appearance.backgroundStyle} onChange={(event) => setAppearance("backgroundStyle", event.target.value as Appearance["backgroundStyle"])}>
                {styles.map((style) => <option key={style} value={style}>{t(`settings.${style}`)}</option>)}
              </select>
            </label>
            {appearance.backgroundStyle !== "solid" && (
              <>
                {range(t("settings.intensity"), "intensity", 0, 1, 0.02)}
                {range(t("settings.opacity"), "opacity", 0, 0.7, 0.02)}
                {appearance.backgroundStyle === "chrome" && (
                  <>
                    {range(t("settings.animationSpeed"), "animationSpeed", 0, 1, 0.05)}
                    {range(t("settings.reflectionStrength"), "reflectionStrength", 0, 1, 0.05)}
                    {range(t("settings.accentInfluence"), "accentInfluence", 0, 1, 0.05)}
                  </>
                )}
                {appearance.backgroundStyle === "grid" && range(t("settings.spacing"), "gridSpacing", 16, 80, 2)}
                {toggle(t("settings.highlights"), "highlights")}
                {toggle(t("settings.cursorReactive"), "cursorReactive")}
                {toggle(t("settings.animate"), "animateBackground")}
                {toggle(t("settings.performance"), "performanceMode")}
              </>
            )}
            {appearance.backgroundStyle === "custom" && (
              <>
                <div className="setting-row setting-row--file">
                  <span>{t("settings.custom")}</span>
                  <button className="button button--quiet" onClick={() => fileInput.current?.click()} type="button">
                    <ImagePlus size={14} /> {t("settings.chooseImage")}
                  </button>
                  <input accept="image/*" hidden onChange={(event) => void selectImage(event)} ref={fileInput} type="file" />
                </div>
                <label className="setting-row">
                  <span>{t("settings.imagePosition")}</span>
                  <select value={appearance.imagePosition} onChange={(event) => setAppearance("imagePosition", event.target.value)}>
                    {["center", "top", "bottom", "left", "right"].map((position) => <option key={position} value={position}>{t(`settings.position.${position}`)}</option>)}
                  </select>
                </label>
                <label className="setting-row">
                  <span>{t("settings.fit")}</span>
                  <select value={appearance.imageFit} onChange={(event) => setAppearance("imageFit", event.target.value as "cover" | "contain")}>
                    <option value="cover">{t("settings.cover")}</option>
                    <option value="contain">{t("settings.contain")}</option>
                  </select>
                </label>
                {range(t("settings.blur"), "imageBlur", 0, 20, 1)}
                {range(t("settings.overlay"), "imageOverlay", 0, 0.9, 0.05)}
              </>
            )}
            {error && <p className="form-error" role="alert">{t(`settings.${error}`)}</p>}
          </div>
          <div className="appearance-preview">
            <div className="appearance-preview__label">{t("settings.preview")}</div>
            <div className="appearance-preview__screen" style={{ "--accent": appearance.accent } as React.CSSProperties}>
              <BackgroundLayer
                accent={appearance.accent}
                accentInfluence={appearance.accentInfluence}
                animationSpeed={appearance.animationSpeed}
                animate={appearance.animateBackground}
                highlights={appearance.highlights}
                image={image}
                imageBlur={appearance.imageBlur}
                imageFit={appearance.imageFit}
                imageOverlay={appearance.imageOverlay}
                imagePosition={appearance.imagePosition}
                intensity={appearance.intensity}
                opacity={appearance.opacity}
                performanceMode={appearance.performanceMode}
                reflectionStrength={appearance.reflectionStrength}
                spacing={appearance.gridSpacing}
                style={appearance.backgroundStyle}
              />
              <div className="preview-content">
                <div className="preview-content__mark"><BrandMark /></div>
                <span>{t("home.title")}</span>
                <div><span /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section settings-section--data">
        <h2>{t("settings.data")}</h2>
        <div className="ai-settings-row"><span>{t("settings.dataRecords")}</span><span className="status-pill">{t("settings.recordCount", { count: localRecordCount })}</span></div>
        <p className="backup-hint">{t("settings.backupHint")}</p>
        <div className="backup-actions">
          <button className="button button--quiet" onClick={() => void exportBackup()} type="button">{t("settings.exportBackup")}</button>
          <button className="button button--quiet" onClick={() => backupInput.current?.click()} type="button">{t("settings.importBackup")}</button>
          <input accept="application/json,.json" hidden onChange={(event) => void restoreBackup(event)} ref={backupInput} type="file" />
        </div>
        {backupNotice && <p aria-live="polite" className="backup-notice">{backupNotice}</p>}
      </section>
    </section>
  );
}
