import type { ScheduleException, Subject, Teacher, TimetableEntry, WeekType } from "./db";
import { localDateKey } from "./db";

export interface ResolvedEntry extends TimetableEntry {
  subject?: Subject;
  teacher?: Teacher;
  label: string;
  color: string;
}

export interface ScheduleStatus {
  dayType: "weekend" | "holiday" | "empty" | "before" | "lesson" | "break" | "free" | "after";
  current?: ResolvedEntry;
  next?: ResolvedEntry;
  nextBreak?: ResolvedEntry;
  startMinute?: number;
  endMinute?: number;
  nowMinute: number;
  firstMinute?: number;
  lastMinute?: number;
  remainingLessonMinutes: number;
  remainingSchoolMinutes?: number;
  dayProgress: number;
  lessonProgress: number;
  entries: ResolvedEntry[];
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatDuration(totalMinutes: number): string {
  const rounded = Math.max(0, Math.ceil(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function mondayUtc(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = new Date(utc).getUTCDay();
  return utc - ((weekday + 6) % 7) * 86_400_000;
}

export function getCycleWeek(
  date: Date,
  anchorDate: string,
  anchorWeek: "A" | "B",
): "A" | "B" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return anchorWeek;
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);
  if (Number.isNaN(anchor.getTime())) return anchorWeek;
  const weekDifference = Math.round((mondayUtc(date) - mondayUtc(anchor)) / 604_800_000);
  return Math.abs(weekDifference) % 2 === 0
    ? anchorWeek
    : anchorWeek === "A"
      ? "B"
      : "A";
}

export function resolveEntries(
  entries: TimetableEntry[],
  subjects: Subject[],
  teachers: Teacher[],
  weekday: number,
  date: Date,
  exceptions: ScheduleException[],
  anchorDate: string,
  anchorWeek: "A" | "B",
): ResolvedEntry[] {
  const dateKey = localDateKey(date);
  const applicableWeek: WeekType = getCycleWeek(date, anchorDate, anchorWeek);
  const cancelled = new Set(
    exceptions
      .filter((exception) => exception.date === dateKey && exception.type === "cancelled")
      .map((exception) => exception.entryId),
  );
  const scheduled = entries.filter(
    (entry) =>
      entry.weekday === weekday &&
      (entry.weekType === "all" || entry.weekType === applicableWeek) &&
      !cancelled.has(entry.id),
  );
  const additions = exceptions
    .filter((exception) => exception.date === dateKey && exception.type === "extra" && exception.extra)
    .map((exception) => exception.extra!);

  return [...scheduled, ...additions]
    .map((entry) => {
      const subject = subjects.find((item) => item.id === entry.subjectId);
      const teacherId = entry.inheritTeacher ? subject?.defaultTeacherId : entry.teacherId;
      const room = entry.inheritRoom ? subject?.defaultRoom : entry.room;
      return {
        ...entry,
        teacherId,
        room,
        subject,
        teacher: teachers.find((item) => item.id === teacherId),
        label:
          entry.kind === "break"
            ? "break"
            : entry.kind === "free"
              ? "free"
              : subject?.name ?? "",
        color: entry.inheritColor ? subject?.color ?? "#8294a3" : entry.colorOverride ?? subject?.color ?? "#8294a3",
      };
    })
    .sort((left, right) => minutesOfDay(left.start) - minutesOfDay(right.start));
}

export function calculateScheduleStatus(
  now: Date,
  entries: TimetableEntry[],
  subjects: Subject[],
  teachers: Teacher[],
  exceptions: ScheduleException[],
  anchorDate: string,
  anchorWeek: "A" | "B",
): ScheduleStatus {
  const weekday = (now.getDay() + 6) % 7;
  const nowMinute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const empty = (dayType: ScheduleStatus["dayType"]): ScheduleStatus => ({
    dayType,
    nowMinute,
    remainingLessonMinutes: 0,
    dayProgress: 0,
    lessonProgress: 0,
    entries: [],
  });
  const todayExceptions = exceptions.filter((item) => item.date === localDateKey(now));
  if (todayExceptions.some((item) => item.type === "holiday")) return empty("holiday");
  const today = resolveEntries(entries, subjects, teachers, weekday, now, exceptions, anchorDate, anchorWeek);
  if (today.length === 0) return empty(weekday > 4 ? "weekend" : "empty");

  const firstMinute = Math.min(...today.map((entry) => minutesOfDay(entry.start)));
  const lastMinute = Math.max(...today.map((entry) => minutesOfDay(entry.end)));
  const current = today.find(
    (entry) => nowMinute >= minutesOfDay(entry.start) && nowMinute < minutesOfDay(entry.end),
  );
  const next = today.find((entry) => minutesOfDay(entry.start) > nowMinute && entry.kind === "lesson");
  const nextBreak = today.find(
    (entry) => entry.kind === "break" && minutesOfDay(entry.start) > nowMinute,
  );
  const remainingLessonMinutes = today.reduce((remaining, entry) => {
    if (entry.kind !== "lesson") return remaining;
    const start = minutesOfDay(entry.start);
    const end = minutesOfDay(entry.end);
    return remaining + Math.max(0, end - Math.max(nowMinute, start));
  }, 0);
  const dayProgress = Math.max(0, Math.min(100, ((nowMinute - firstMinute) / (lastMinute - firstMinute)) * 100));
  const lessonProgress = current
    ? Math.max(
        0,
        Math.min(
          100,
          ((nowMinute - minutesOfDay(current.start)) /
            (minutesOfDay(current.end) - minutesOfDay(current.start))) *
            100,
        ),
      )
    : 0;

  let dayType: ScheduleStatus["dayType"];
  if (current?.kind === "lesson") dayType = "lesson";
  else if (current?.kind === "break") dayType = "break";
  else if (current?.kind === "free") dayType = "free";
  else if (nowMinute < firstMinute) dayType = "before";
  else if (nowMinute >= lastMinute) dayType = "after";
  else dayType = "free";

  return {
    dayType,
    current,
    next,
    nextBreak,
    startMinute: current ? minutesOfDay(current.start) : undefined,
    endMinute: current ? minutesOfDay(current.end) : undefined,
    nowMinute,
    firstMinute,
    lastMinute,
    remainingLessonMinutes,
    remainingSchoolMinutes: Math.max(0, lastMinute - nowMinute),
    dayProgress,
    lessonProgress,
    entries: today,
  };
}
