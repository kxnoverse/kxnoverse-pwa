import type { DailyCheckin } from "./db";

export type CheckinMood = NonNullable<DailyCheckin["mood"]>;

export interface CheckinWeek {
  days: Array<string | null>;
}

export interface CheckinMonthLabel {
  label: string;
  weekIndex: number;
}

export function getCheckinHeatLevel(sleepHours: number | null): number {
  if (sleepHours === null) return 0;
  if (sleepHours < 4) return 1;
  if (sleepHours < 6) return 2;
  if (sleepHours < 8) return 3;
  return 4;
}

export function getCheckinYearGrid(year: number, locale: string): {
  weeks: CheckinWeek[];
  months: CheckinMonthLabel[];
} {
  const firstDay = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31);
  const firstGridDate = new Date(year, 0, 1 - ((firstDay.getDay() + 6) % 7));
  const weeks: CheckinWeek[] = [];

  for (let cursor = new Date(firstGridDate); cursor <= lastDay; cursor.setDate(cursor.getDate() + 7)) {
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + weekday);
      return date.getFullYear() === year ? dateKey(date) : null;
    });
    weeks.push({ days });
  }

  const months = Array.from({ length: 12 }, (_, month) => {
    const date = new Date(year, month, 1);
    const daysFromGridStart = Math.floor(
      (Date.UTC(year, month, 1) - Date.UTC(firstGridDate.getFullYear(), firstGridDate.getMonth(), firstGridDate.getDate())) / 86_400_000,
    );
    return {
      label: new Intl.DateTimeFormat(locale, { month: "short" }).format(date),
      weekIndex: Math.floor(daysFromGridStart / 7),
    };
  });

  return { weeks, months };
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
