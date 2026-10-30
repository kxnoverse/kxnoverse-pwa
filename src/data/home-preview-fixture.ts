import type { CalendarEvent, SchoolTask, Subject, TimetableEntry } from "./db";
import { localDateKey } from "./db";

export interface HomePreviewFixture {
  subjects: Subject[];
  timetable: TimetableEntry[];
  tasks: SchoolTask[];
  calendarEvents: CalendarEvent[];
}

export function createHomePreviewDate(): Date {
  return new Date(2026, 9, 29, 11, 35);
}

export function createHomePreviewFixture(date: Date): HomePreviewFixture {
  const weekday = (date.getDay() + 6) % 7;
  const dayAfter = new Date(date);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const twoDaysAfter = new Date(date);
  twoDaysAfter.setDate(twoDaysAfter.getDate() + 2);
  const now = date.getTime();

  const subjects: Subject[] = [
    { id: "preview-check-in", name: "Check-in", color: "#70aaa6" },
    { id: "preview-math", name: "Mathematics", color: "#62a87a" },
    { id: "preview-german", name: "German", color: "#c5a06f" },
    { id: "preview-sport", name: "Sport", color: "#81a5c1" },
  ];

  const timetable: TimetableEntry[] = [
    { id: "preview-check-in", subjectId: "preview-check-in", weekday, start: "08:00", end: "08:20", weekType: "all", kind: "lesson", room: "" },
    { id: "preview-math-1", subjectId: "preview-math", weekday, start: "08:30", end: "09:15", weekType: "all", kind: "lesson", room: "B204" },
    { id: "preview-math-2", subjectId: "preview-math", weekday, start: "09:20", end: "10:05", weekType: "all", kind: "lesson", room: "B204" },
    { id: "preview-german-1", subjectId: "preview-german", weekday, start: "10:25", end: "11:10", weekType: "all", kind: "lesson", room: "A108" },
    { id: "preview-german-2", subjectId: "preview-german", weekday, start: "11:15", end: "12:00", weekType: "all", kind: "lesson", room: "A108" },
    { id: "preview-sport-1", subjectId: "preview-sport", weekday, start: "12:20", end: "13:05", weekType: "all", kind: "lesson", room: "Gym" },
    { id: "preview-sport-2", subjectId: "preview-sport", weekday, start: "13:10", end: "13:55", weekType: "all", kind: "lesson", room: "Gym" },
  ];

  const tasks: SchoolTask[] = [
    { id: "preview-task-physics", title: "Physics worksheet", description: "", dueDate: localDateKey(dayAfter), priority: "normal", category: "", tags: [], subtasks: [], completed: false, createdAt: now, updatedAt: now },
    { id: "preview-task-history", title: "History · read chapter 4", description: "", dueDate: localDateKey(twoDaysAfter), priority: "normal", category: "", tags: [], subtasks: [], completed: false, createdAt: now, updatedAt: now },
    { id: "preview-task-vocabulary", title: "Vocabulary unit 6", description: "", dueDate: localDateKey(twoDaysAfter), priority: "normal", category: "", tags: [], subtasks: [], completed: false, createdAt: now, updatedAt: now },
  ];

  const calendarEvents: CalendarEvent[] = [
    {
      id: "preview-event-english-test",
      type: "exam",
      title: "English test",
      description: "",
      startAt: new Date(dayAfter.getFullYear(), dayAfter.getMonth(), dayAfter.getDate(), 9, 0).toISOString(),
      endAt: new Date(dayAfter.getFullYear(), dayAfter.getMonth(), dayAfter.getDate(), 10, 0).toISOString(),
      allDay: false,
      color: "#ff514b",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "preview-event-math-quiz",
      type: "exam",
      title: "Maths quiz",
      description: "",
      startAt: new Date(twoDaysAfter.getFullYear(), twoDaysAfter.getMonth(), twoDaysAfter.getDate(), 11, 0).toISOString(),
      endAt: new Date(twoDaysAfter.getFullYear(), twoDaysAfter.getMonth(), twoDaysAfter.getDate(), 11, 30).toISOString(),
      allDay: false,
      color: "#93a9ca",
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { subjects, timetable, tasks, calendarEvents };
}
