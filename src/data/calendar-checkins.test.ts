import { describe, expect, it } from "vitest";
import { getCheckinHeatLevel, getCheckinYearGrid } from "./calendar-checkins";

describe("daily check-in calendar", () => {
  it("maps sleep duration to neutral, readable contribution levels", () => {
    expect([null, 0, 3.5, 4, 5.5, 6, 7.5, 8, 24].map(getCheckinHeatLevel)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });

  it("builds a Monday-first year grid with each date exactly once", () => {
    const { weeks, months } = getCheckinYearGrid(2024, "en");
    const days = weeks.flatMap((week) => week.days).filter((date): date is string => date !== null);

    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
    expect(days).toHaveLength(366);
    expect(new Set(days).size).toBe(366);
    expect(days[0]).toBe("2024-01-01");
    expect(days.at(-1)).toBe("2024-12-31");
    expect(weeks[0].days[0]).toBe("2024-01-01");
    expect(months).toHaveLength(12);
    expect(months[0].weekIndex).toBe(0);
    expect(months.at(-1)?.weekIndex).toBeGreaterThan(months[0].weekIndex);
  });

  it("places a year beginning on Sunday at the last weekday row", () => {
    const { weeks } = getCheckinYearGrid(2023, "en");
    expect(weeks[0].days.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0].days[6]).toBe("2023-01-01");
    expect(weeks.flatMap((week) => week.days).filter(Boolean)).toHaveLength(365);
  });
});
