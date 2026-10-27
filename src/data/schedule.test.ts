import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { calculateScheduleStatus, formatDuration, getCycleWeek, mergeConsecutiveLessons } from "./schedule";
import type { ScheduleException, Subject, Teacher, TimetableEntry } from "./db";
import { resolveEntries } from "./schedule";

const monday = new Date(2026, 9, 26, 9, 20);
const anchor = "2026-10-19";

const entries: TimetableEntry[] = [
  {
    id: "math",
    subjectId: "math",
    weekday: 0,
    start: "09:00",
    end: "10:00",
    weekType: "all",
    kind: "lesson",
  },
  {
    id: "break",
    weekday: 0,
    start: "10:00",
    end: "10:15",
    weekType: "all",
    kind: "break",
  },
  {
    id: "english",
    subjectId: "english",
    weekday: 0,
    start: "10:15",
    end: "11:00",
    weekType: "B",
    kind: "lesson",
  },
];

describe("timetable schedule calculations", () => {
  it("alternates A/B weeks around a local calendar week anchor", () => {
    expect(getCycleWeek(new Date(2026, 9, 19), anchor, "A")).toBe("A");
    expect(getCycleWeek(new Date(2026, 9, 26), anchor, "A")).toBe("B");
    expect(getCycleWeek(new Date(2026, 10, 2), anchor, "A")).toBe("A");
    expect(getCycleWeek(new Date(2026, 9, 12), anchor, "A")).toBe("B");
    expect(getCycleWeek(new Date(2026, 9, 26), anchor, "B")).toBe("A");
  });

  it("calculates the active lesson, lesson progress, next break, and remaining time", () => {
    const status = calculateScheduleStatus(monday, entries, [], [], [], anchor, "A");

    expect(status.dayType).toBe("lesson");
    expect(status.current?.id).toBe("math");
    expect(status.next?.id).toBe("english");
    expect(status.nextBreak?.id).toBe("break");
    expect(status.lessonProgress).toBeCloseTo(1 / 3 * 100);
    expect(status.remainingSchoolMinutes).toBe(100);
    expect(status.remainingLessonMinutes).toBe(85);
    expect(status.entries.some((entry) => entry.id === "english")).toBe(true);
    const weekA = calculateScheduleStatus(
      new Date(2026, 9, 19, 10, 30),
      entries,
      [],
      [],
      [],
      anchor,
      "A",
    );
    expect(weekA.entries.some((entry) => entry.id === "english")).toBe(false);
  });

  it("counts time until an implicit break between lessons", () => {
    const lessons: TimetableEntry[] = [
      { ...entries[0], end: "10:00" },
      { ...entries[2], weekType: "all", start: "10:20" },
    ];
    const status = calculateScheduleStatus(monday, lessons, [], [], [], anchor, "A");

    expect(status.nextBreakInMinutes).toBe(40);
    expect(status.nextBreak).toBeUndefined();
  });

  it("does not invent a break after the final lesson", () => {
    const status = calculateScheduleStatus(
      new Date(2026, 9, 26, 9, 20),
      [{ ...entries[0], end: "10:00" }],
      [],
      [],
      [],
      anchor,
      "A",
    );

    expect(status.nextBreakInMinutes).toBeUndefined();
  });

  it("merges only contiguous matching lessons for the home schedule", () => {
    const subject: Subject = { id: "math", name: "English", color: "#228855" };
    const resolved = resolveEntries(
      [
        { ...entries[0], start: "09:00", end: "09:45" },
        { ...entries[0], id: "math-2", start: "09:45", end: "10:30" },
        { ...entries[0], id: "math-3", start: "10:40", end: "11:25" },
      ],
      [subject],
      [],
      0,
      monday,
      [],
      anchor,
      "A",
    );

    const merged = mergeConsecutiveLessons(resolved);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: "math", start: "09:00", end: "10:30", label: "English" });
    expect(merged[1]).toMatchObject({ id: "math-3", start: "10:40", end: "11:25" });
  });

  it("includes one-off lessons in the date-specific schedule", () => {
    const added: ScheduleException = {
      id: "extra",
      date: "2026-10-26",
      type: "extra",
      extra: {
        id: "extra-math",
        subjectId: "math",
        weekday: 0,
        start: "08:00",
        end: "08:45",
        weekType: "all",
        kind: "lesson",
      },
    };
    const schedule = calculateScheduleStatus(
      new Date(2026, 9, 26, 8, 20),
      entries,
      [],
      [],
      [added],
      anchor,
      "A",
    );
    expect(schedule.dayType).toBe("lesson");
    expect(schedule.current?.id).toBe("extra-math");
  });

  it("handles breaks, cancelled lessons, holidays, before/after school, and weekends", () => {
    const duringBreak = calculateScheduleStatus(
      new Date(2026, 9, 26, 10, 5),
      entries,
      [],
      [],
      [],
      anchor,
      "A",
    );
    expect(duringBreak.dayType).toBe("break");
    expect(duringBreak.current?.id).toBe("break");
    expect(duringBreak.next?.id).toBe("english");

    const cancelled = calculateScheduleStatus(
      new Date(2026, 9, 26, 9, 20),
      entries,
      [],
      [],
      [{ id: "cancel", date: "2026-10-26", type: "cancelled", entryId: "math" }],
      anchor,
      "A",
    );
    expect(cancelled.current).toBeUndefined();
    expect(cancelled.dayType).toBe("before");

    const holiday: ScheduleException = { id: "holiday", date: "2026-10-26", type: "holiday" };
    expect(calculateScheduleStatus(monday, entries, [], [], [holiday], anchor, "A").dayType).toBe("holiday");
    expect(calculateScheduleStatus(new Date(2026, 9, 26, 7), entries, [], [], [], anchor, "A").dayType).toBe("before");
    expect(calculateScheduleStatus(new Date(2026, 9, 26, 12), entries, [], [], [], anchor, "A").dayType).toBe("after");
    expect(calculateScheduleStatus(new Date(2026, 9, 25, 9), entries, [], [], [], anchor, "A").dayType).toBe("weekend");
    const saturdayClass: TimetableEntry = {
      ...entries[0],
      id: "saturday",
      weekday: 5,
      start: "09:00",
      end: "10:00",
    };
    expect(
      calculateScheduleStatus(new Date(2026, 9, 24, 9, 20), [saturdayClass], [], [], [], anchor, "A").dayType,
    ).toBe("lesson");
  });

  it("formats countdowns without negative time", () => {
    expect(formatDuration(155)).toBe("2h 35m");
    expect(formatDuration(-2)).toBe("0m");
  });

  it("resolves reusable subject defaults while preserving explicit lesson overrides", () => {
    const subject: Subject = {
      id: "math",
      name: "Mathematics",
      shortName: "Math",
      color: "#228855",
      defaultTeacherId: "teacher",
      defaultRoom: "B204",
    };
    const teacher: Teacher = { id: "teacher", name: "Local teacher", subjectIds: ["math"] };
    const inherited: TimetableEntry = {
      ...entries[0],
      inheritTeacher: true,
      inheritRoom: true,
      inheritColor: true,
    };
    const explicit: TimetableEntry = {
      ...entries[0],
      id: "explicit",
      teacherId: "other",
      room: "C101",
      colorOverride: "#885522",
    };
    const resolved = resolveEntries(
      [inherited, explicit],
      [subject],
      [teacher, { id: "other", name: "Other teacher", subjectIds: [] }],
      0,
      monday,
      [],
      anchor,
      "A",
    );
    expect(resolved[0]).toMatchObject({ teacher, room: "B204", color: "#228855" });
    expect(resolved[1]).toMatchObject({ room: "C101", color: "#885522", teacher: { name: "Other teacher" } });
  });
});
