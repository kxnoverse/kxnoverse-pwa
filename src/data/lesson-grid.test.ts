import { describe, expect, it } from "vitest";
import { createLessonPeriods, defaultLessonGrid, parseLessonGrid } from "./lesson-grid";

describe("lesson grid", () => {
  it("matches the screenshot's lesson times and break gaps", () => {
    expect(createLessonPeriods("08:15", defaultLessonGrid)).toEqual([
      { index: 0, start: "08:15", end: "08:45" },
      { index: 1, start: "08:45", end: "09:25" },
      { index: 2, start: "09:25", end: "10:05" },
      { index: 3, start: "10:25", end: "11:05" },
      { index: 4, start: "11:05", end: "11:45" },
      { index: 5, start: "12:05", end: "12:45" },
      { index: 6, start: "13:25", end: "14:00" },
      { index: 7, start: "14:00", end: "14:45" },
      { index: 8, start: "14:45", end: "15:30" },
    ]);
  });

  it("keeps legacy grid settings enabled when no availability flags exist", () => {
    const config = parseLessonGrid(JSON.stringify({ durations: [30, 40], breaks: [] }));

    expect(config.enabledPeriods).toEqual([true, true]);
  });
});
