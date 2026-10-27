import type { TimetableEntry } from "./db";

export type LessonGridConfig = {
  durations: number[];
  breaks: Array<{ afterPeriod: number; duration: number }>;
  enabledPeriods: boolean[];
};

export type LessonPeriod = { index: number; start: string; end: string };

export const defaultLessonGrid: LessonGridConfig = {
  durations: [30, 40, 40, 40, 40, 40, 35, 45, 45],
  breaks: [
    { afterPeriod: 3, duration: 20 },
    { afterPeriod: 5, duration: 20 },
    { afterPeriod: 6, duration: 40 },
  ],
  enabledPeriods: Array.from({ length: 9 }, () => true),
};

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function parseLessonGrid(value?: string): LessonGridConfig {
  if (!value) return defaultLessonGrid;
  try {
    const parsed = JSON.parse(value) as Partial<LessonGridConfig>;
    if (
      !Array.isArray(parsed.durations) ||
      parsed.durations.length < 1 ||
      parsed.durations.length > 12 ||
      !parsed.durations.every((duration) => Number.isInteger(duration) && duration >= 20 && duration <= 120) ||
      !Array.isArray(parsed.breaks) ||
      !parsed.breaks.every((item) =>
        Number.isInteger(item.afterPeriod) &&
        item.afterPeriod >= 1 &&
        item.afterPeriod < parsed.durations!.length &&
        Number.isInteger(item.duration) &&
        item.duration >= 1 &&
        item.duration <= 90,
      ) ||
      (parsed.enabledPeriods !== undefined &&
        (!Array.isArray(parsed.enabledPeriods) ||
          parsed.enabledPeriods.length !== parsed.durations.length ||
          !parsed.enabledPeriods.every((enabled) => typeof enabled === "boolean")))
    ) return defaultLessonGrid;
    return {
      durations: parsed.durations,
      breaks: parsed.breaks,
      enabledPeriods: parsed.enabledPeriods ?? Array.from({ length: parsed.durations.length }, () => true),
    };
  } catch {
    return defaultLessonGrid;
  }
}

export function createLessonPeriods(startTime: string, config: LessonGridConfig): LessonPeriod[] {
  let cursor = minutesOfDay(startTime);
  return config.durations.map((duration, index) => {
    const period = { index, start: formatTime(cursor), end: formatTime(cursor + duration) };
    cursor += duration + (config.breaks.find((item) => item.afterPeriod === index + 1)?.duration ?? 0);
    return period;
  });
}

export function getEntryPeriod(entry: TimetableEntry, periods: LessonPeriod[]): number | undefined {
  if (Number.isInteger(entry.period) && entry.period! >= 0 && entry.period! < periods.length) return entry.period;
  const exactMatch = periods.findIndex((period) => period.start === entry.start);
  if (exactMatch >= 0) return exactMatch;
  const start = minutesOfDay(entry.start);
  const nearest = periods.reduce<{ index: number; distance: number } | undefined>((best, period) => {
    const distance = Math.abs(minutesOfDay(period.start) - start);
    return !best || distance < best.distance ? { index: period.index, distance } : best;
  }, undefined);
  return nearest && nearest.distance <= 45 ? nearest.index : undefined;
}

export function reflowTimetableEntries(
  entries: TimetableEntry[],
  previousPeriods: LessonPeriod[],
  nextPeriods: LessonPeriod[],
): TimetableEntry[] {
  return entries.map((entry) => {
    const index = getEntryPeriod(entry, previousPeriods);
    const period = index === undefined ? undefined : nextPeriods[index];
    return period ? { ...entry, period: index, start: period.start, end: period.end } : entry;
  });
}
