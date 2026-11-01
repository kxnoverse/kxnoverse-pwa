import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Moon, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Surface } from "./Surface";
import { createId, db, localDateKey, type DailyCheckin } from "../data/db";
import { getCheckinHeatLevel, getCheckinYearGrid, type CheckinMood } from "../data/calendar-checkins";

const CUSTOM_FEELINGS_SETTING_KEY = "calendarCheckinFeelings";

interface CustomCheckinFeeling {
  id: string;
  name: string;
  emoji: string;
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function parseCustomFeelings(value: string | undefined): CustomCheckinFeeling[] | null {
  if (value === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((feeling) =>
      typeof feeling === "object" && feeling !== null &&
      typeof feeling.id === "string" && feeling.id.length > 0 &&
      typeof feeling.name === "string" && feeling.name.trim().length > 0 && feeling.name.length <= 32 &&
      typeof feeling.emoji === "string" && feeling.emoji.length > 0 && feeling.emoji.length <= 8,
    )) return null;
    return parsed as CustomCheckinFeeling[];
  } catch {
    return null;
  }
}

function describeCheckin(
  date: string,
  entry: DailyCheckin | undefined,
  feelings: CustomCheckinFeeling[],
  t: TFunction,
): string {
  if (!entry) return t("calendar.checkins.dayWithoutEntry", { date });
  const customMood = feelings.find((feeling) => feeling.id === entry.customMoodId);
  const details = [
    entry.sleepHours === null ? "" : t("calendar.checkins.sleepSummary", { hours: entry.sleepHours }),
    customMood ? `${customMood.emoji} ${customMood.name}` : entry.mood === null ? "" : t(`calendar.checkins.moods.${entry.mood}`),
  ].filter(Boolean);
  return details.length
    ? t("calendar.checkins.dayWithEntry", { date, details: details.join(", ") })
    : t("calendar.checkins.dayWithoutSleep", { date });
}

export function CalendarCheckins({ selectedDate, onSelectDate }: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const entries = useLiveQuery(() => db.dailyCheckins.toArray(), [], []);
  const feelingsSetting = useLiveQuery(() => db.settings.get(CUSTOM_FEELINGS_SETTING_KEY), [], undefined);
  const customFeelings = useMemo(
    () => parseCustomFeelings(feelingsSetting?.value),
    [feelingsSetting?.value],
  );
  const feelings = customFeelings ?? [];
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
  const [year, setYear] = useState(() => Number(selectedDate.slice(0, 4)));
  const [sleepHours, setSleepHours] = useState("");
  const [mood, setMood] = useState<CheckinMood | null>(null);
  const [customMoodId, setCustomMoodId] = useState<string | null>(null);
  const [plans, setPlans] = useState("");
  const [feelingName, setFeelingName] = useState("");
  const [feelingEmoji, setFeelingEmoji] = useState("✨");
  const [feelingError, setFeelingError] = useState("");
  const [savingFeeling, setSavingFeeling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const feelingSettingsInvalid = feelingsSetting !== undefined && customFeelings === null;
  const selectedEntry = entryMap.get(selectedDate);
  const locale = i18n.language;
  const { weeks, months } = useMemo(() => getCheckinYearGrid(year, locale), [locale, year]);
  const selectedDateLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(dateFromKey(selectedDate)),
    [locale, selectedDate],
  );
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + index)),
    ),
    [locale],
  );
  const daysLogged = entries.filter((entry) => entry.date.startsWith(`${year}-`)).length;

  useEffect(() => {
    setSleepHours(selectedEntry?.sleepHours === null || selectedEntry === undefined ? "" : String(selectedEntry.sleepHours));
    setMood(selectedEntry?.mood ?? null);
    setCustomMoodId(selectedEntry?.customMoodId ?? null);
    setPlans(selectedEntry?.plans ?? "");
  }, [selectedDate, selectedEntry?.customMoodId, selectedEntry?.updatedAt]);

  useEffect(() => {
    setStatus("");
    setError("");
  }, [selectedDate]);

  function shiftYear(amount: number) {
    const nextYear = year + amount;
    setYear(nextYear);
    const [, month, day] = selectedDate.split("-").map(Number);
    const nextDate = new Date(nextYear, month - 1, day);
    if (nextDate.getMonth() !== month - 1) nextDate.setDate(0);
    onSelectDate(localDateKey(nextDate));
  }

  async function addCustomFeeling() {
    const name = feelingName.trim();
    if (!name) {
      setFeelingError(t("calendar.checkins.feelingNameRequired"));
      return;
    }
    if (feelingSettingsInvalid) {
      setFeelingError(t("calendar.checkins.feelingLoadError"));
      return;
    }
    if (feelings.some((feeling) => feeling.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFeelingError(t("calendar.checkins.feelingAlreadyExists"));
      return;
    }
    setSavingFeeling(true);
    setFeelingError("");
    const feeling: CustomCheckinFeeling = { id: createId(), name, emoji: feelingEmoji.trim() || "✨" };
    try {
      await db.settings.put({
        key: CUSTOM_FEELINGS_SETTING_KEY,
        value: JSON.stringify([...feelings, feeling]),
      });
      setFeelingName("");
      setFeelingEmoji("✨");
      setCustomMoodId(feeling.id);
      setMood(null);
    } catch {
      setFeelingError(t("calendar.checkins.feelingSaveError"));
    } finally {
      setSavingFeeling(false);
    }
  }

  async function saveCheckin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");
    const parsedSleep = sleepHours.trim() ? Number(sleepHours) : null;
    if (parsedSleep !== null && (!Number.isFinite(parsedSleep) || parsedSleep < 0 || parsedSleep > 24)) {
      setError(t("calendar.checkins.invalidSleep"));
      setSaving(false);
      return;
    }
    const cleanPlans = plans.trim();
    if (parsedSleep === null && mood === null && customMoodId === null && !cleanPlans) {
      setStatus(t("calendar.checkins.nothingToSave"));
      setSaving(false);
      return;
    }
    try {
      await db.dailyCheckins.put({
        id: selectedDate,
        date: selectedDate,
        sleepHours: parsedSleep,
        mood: customMoodId ? null : mood,
        customMoodId,
        plans: cleanPlans,
        updatedAt: Date.now(),
      });
      setStatus(t("calendar.checkins.saved"));
    } catch {
      setError(t("calendar.checkins.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCheckin() {
    if (!selectedEntry || !window.confirm(t("calendar.checkins.confirmDelete", { date: selectedDateLabel }))) return;
    setError("");
    setStatus("");
    try {
      await db.dailyCheckins.delete(selectedEntry.id);
      setStatus(t("calendar.checkins.deleted"));
    } catch {
      setError(t("calendar.checkins.saveError"));
    }
  }

  return (
    <section aria-label={t("calendar.checkins.title")} className="calendar-checkins">
      <header className="calendar-checkins__heading">
        <div>
          <span className="calendar-page__eyebrow"><Moon size={13} />{t("calendar.checkins.yearLabel")}</span>
          <h2>{t("calendar.checkins.title")}</h2>
          <p>{t("calendar.checkins.subtitle")}</p>
        </div>
        <div className="calendar-checkins__year-controls">
          <button aria-label={t("calendar.checkins.previousYear")} className="icon-button" onClick={() => shiftYear(-1)} type="button"><ChevronLeft size={15} /></button>
          <strong aria-live="polite">{year}</strong>
          <button aria-label={t("calendar.checkins.nextYear")} className="icon-button" onClick={() => shiftYear(1)} type="button"><ChevronRight size={15} /></button>
        </div>
      </header>

      <Surface className="calendar-checkins__overview" variant="panel">
        <div className="calendar-checkins__overview-heading">
          <div>
            <h3>{year}</h3>
            <span>{t("calendar.checkins.daysLogged", { count: daysLogged })}</span>
          </div>
          <span className="calendar-checkins__overview-hint">{t("calendar.checkins.selectDay")}</span>
        </div>
        <div aria-label={t("calendar.checkins.heatmap")} className="calendar-checkins__scroll" role="region" tabIndex={0}>
          <div className="calendar-checkins__chart">
            <div className="calendar-checkins__weekdays" aria-hidden="true">
              {weekdayLabels.map((weekday, index) => <span key={index}>{index % 2 === 0 ? weekday : ""}</span>)}
            </div>
            <div className="calendar-checkins__grid-wrap">
              <div className="calendar-checkins__months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 11px)` }}>
                {months.map((month) => <span key={month.weekIndex} style={{ gridColumnStart: month.weekIndex + 1 }}>{month.label}</span>)}
              </div>
              <div className="calendar-checkins__weeks">
                {weeks.map((week, weekIndex) => (
                  <div className="calendar-checkins__week" key={weekIndex}>
                    {week.days.map((date, weekday) => {
                      if (!date) return <span aria-hidden="true" className="calendar-checkins__day calendar-checkins__day--outside" key={weekday} />;
                      const entry = entryMap.get(date);
                      const level = getCheckinHeatLevel(entry?.sleepHours ?? null);
                      const hasEntry = Boolean(entry);
                      const selected = date === selectedDate;
                      return (
                        <button
                          aria-label={describeCheckin(
                            new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(dateFromKey(date)),
                            entry,
                            feelings,
                            t,
                          )}
                          aria-pressed={selected}
                          className={`calendar-checkins__day calendar-checkins__day--level-${level}${hasEntry ? " calendar-checkins__day--logged" : ""}${selected ? " is-selected" : ""}`}
                          key={date}
                          onClick={() => {
                            onSelectDate(date);
                            setYear(Number(date.slice(0, 4)));
                          }}
                          title={describeCheckin(
                            new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(dateFromKey(date)),
                            entry,
                            feelings,
                            t,
                          )}
                          type="button"
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div aria-label={t("calendar.checkins.legend")} className="calendar-checkins__legend">
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level}><i className={`calendar-checkins__day calendar-checkins__day--level-${level}`} />{t(`calendar.checkins.levels.${level}`)}</span>
          ))}
        </div>
      </Surface>

      <Surface as="form" className="calendar-checkins__form" onSubmit={(event) => void saveCheckin(event)} variant="panel">
        <div className="calendar-checkins__form-heading">
          <div><span>{t("calendar.checkins.dailyEntry")}</span><h3>{selectedDateLabel}</h3></div>
          {selectedEntry && <span className="calendar-checkins__logged">{t("calendar.checkins.logged")}</span>}
        </div>
        <div className="calendar-checkins__fields">
          <label className="calendar-checkins__sleep">
            <span>{t("calendar.checkins.sleepHours")}</span>
            <span className="calendar-checkins__sleep-input">
              <input aria-describedby="checkin-sleep-help" aria-label={t("calendar.checkins.sleepHours")} max="24" min="0" onChange={(event) => setSleepHours(event.target.value)} placeholder="—" step="0.5" type="number" value={sleepHours} />
              <span>{t("calendar.checkins.hoursUnit")}</span>
            </span>
            <small id="checkin-sleep-help">{t("calendar.checkins.sleepHelp")}</small>
          </label>
          <fieldset className="calendar-checkins__mood">
            <legend>{t("calendar.checkins.mood")}</legend>
            <div className="calendar-checkins__mood-options">
              {([1, 2, 3, 4, 5] as const).map((value) => (
                <label className={mood === value ? "is-selected" : ""} key={value}>
                  <input checked={mood === value && customMoodId === null} name="checkin-mood" onChange={() => { setMood(value); setCustomMoodId(null); }} type="radio" value={value} />
                  <span aria-hidden="true">{["😞", "🙁", "😐", "🙂", "😊"][value - 1]}</span>
                  <small>{t(`calendar.checkins.moods.${value}`)}</small>
                </label>
              ))}
              {feelings.map((feeling) => (
                <label className={customMoodId === feeling.id ? "is-selected" : ""} key={feeling.id}>
                  <input checked={customMoodId === feeling.id} name="checkin-mood" onChange={() => { setCustomMoodId(feeling.id); setMood(null); }} type="radio" value={feeling.id} />
                  <span aria-hidden="true">{feeling.emoji}</span>
                  <small>{feeling.name}</small>
                </label>
              ))}
            </div>
            <div className="calendar-checkins__feeling-creator">
              <label>
                <span>{t("calendar.checkins.feelingName")}</span>
                <input maxLength={32} onChange={(event) => setFeelingName(event.target.value)} placeholder={t("calendar.checkins.feelingNamePlaceholder")} value={feelingName} />
              </label>
              <label>
                <span>{t("calendar.checkins.feelingEmoji")}</span>
                <input aria-label={t("calendar.checkins.feelingEmoji")} maxLength={8} onChange={(event) => setFeelingEmoji(event.target.value)} value={feelingEmoji} />
              </label>
              <button className="button button--quiet" disabled={savingFeeling || feelingSettingsInvalid} onClick={() => void addCustomFeeling()} type="button">
                {savingFeeling ? t("calendar.checkins.feelingAdding") : t("calendar.checkins.feelingAdd")}
              </button>
            </div>
            {feelingSettingsInvalid && <p className="form-error" role="alert">{t("calendar.checkins.feelingLoadError")}</p>}
            {feelingError && <p className="form-error" role="alert">{feelingError}</p>}
          </fieldset>
          <label className="calendar-checkins__plans">
            <span>{t("calendar.checkins.plans")}</span>
            <textarea maxLength={1000} onChange={(event) => setPlans(event.target.value)} placeholder={t("calendar.checkins.plansPlaceholder")} rows={3} value={plans} />
          </label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {status && <p className="calendar-checkins__status" role="status">{status}</p>}
        <div className="calendar-checkins__actions">
          {selectedEntry && <button className="button button--quiet" onClick={() => void deleteCheckin()} type="button"><Trash2 size={13} />{t("calendar.checkins.delete")}</button>}
          <button className="button button--primary" disabled={saving} type="submit"><Save size={13} />{saving ? t("calendar.checkins.saving") : t("calendar.checkins.save")}</button>
        </div>
      </Surface>
    </section>
  );
}
