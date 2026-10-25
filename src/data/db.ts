import Dexie, { type EntityTable } from "dexie";

export type WeekType = "all" | "A" | "B";
export type SessionKind = "lesson" | "break" | "free";

export interface Subject {
  id: string;
  name: string;
  color: string;
  shortName?: string;
  defaultTeacherId?: string;
  defaultRoom?: string;
  notes?: string;
}

export interface Teacher {
  id: string;
  name: string;
  subjectIds: string[];
}

export interface TimetableEntry {
  id: string;
  subjectId?: string;
  weekday: number;
  start: string;
  end: string;
  teacherId?: string;
  room?: string;
  colorOverride?: string;
  inheritTeacher?: boolean;
  inheritRoom?: boolean;
  inheritColor?: boolean;
  notes?: string;
  weekType: WeekType;
  kind: SessionKind;
}

export interface ScheduleException {
  id: string;
  date: string;
  type: "holiday" | "cancelled" | "extra";
  entryId?: string;
  extra?: TimetableEntry;
}

export interface LocalSetting {
  key: string;
  value: string;
}

export interface AiPreset {
  id: string;
  name: string;
  assistantName: string;
  description: string;
  style: string;
  length: "short" | "medium" | "detailed";
  depth: "basic" | "guided" | "advanced";
  language: "auto" | "en" | "de";
  instructions: string;
  model: string;
  isDefault: boolean;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  error?: boolean;
}

export interface AiAttachment {
  id: string;
  messageId: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface AiConversation {
  id: string;
  title: string;
  updatedAt: number;
  presetId: string;
}

export type TaskPriority = "low" | "normal" | "high";

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface SchoolTask {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime?: string;
  priority: TaskPriority;
  subjectId?: string;
  category: string;
  tags: string[];
  subtasks: TaskSubtask[];
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarEvent {
  id: string;
  type: "event" | "exam";
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  taskId?: string;
  recurrence?: "daily" | "weekly" | "monthly";
  createdAt: number;
  updatedAt: number;
}

export interface SchoolNote {
  id: string;
  title: string;
  content: string;
  folder: string;
  subjectId?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type FocusKind = "focus" | "short-break" | "long-break";

export interface FocusSession {
  id: string;
  kind: FocusKind;
  startedAt: number;
  endedAt: number;
  plannedSeconds: number;
  durationSeconds: number;
  taskId?: string;
  completed: boolean;
}

export interface LocalFile {
  id: string;
  name: string;
  type: string;
  size: number;
  category: string;
  subjectId?: string;
  noteId?: string;
  createdAt: number;
  modifiedAt: number;
  blob: Blob;
}

class KxnoDatabase extends Dexie {
  subjects!: EntityTable<Subject, "id">;
  teachers!: EntityTable<Teacher, "id">;
  timetable!: EntityTable<TimetableEntry, "id">;
  exceptions!: EntityTable<ScheduleException, "id">;
  settings!: EntityTable<LocalSetting, "key">;
  aiPresets!: EntityTable<AiPreset, "id">;
  aiConversations!: EntityTable<AiConversation, "id">;
  aiMessages!: EntityTable<AiMessage, "id">;
  aiAttachments!: EntityTable<AiAttachment, "id">;
  tasks!: EntityTable<SchoolTask, "id">;
  calendarEvents!: EntityTable<CalendarEvent, "id">;
  notes!: EntityTable<SchoolNote, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;
  files!: EntityTable<LocalFile, "id">;

  constructor() {
    super("KxnoDesk");
    this.version(1).stores({
      subjects: "id, name",
      teachers: "id, name",
      timetable: "id, weekday, subjectId, teacherId, weekType",
      exceptions: "id, date, type, entryId",
      settings: "key",
    });
    this.version(2).stores({
      subjects: "id, name",
      teachers: "id, name",
      timetable: "id, weekday, subjectId, teacherId, weekType",
      exceptions: "id, date, type, entryId",
      settings: "key",
      aiPresets: "id, name",
      aiConversations: "id, updatedAt",
      aiMessages: "id, conversationId, createdAt",
    });
    this.version(3).stores({
      subjects: "id, name",
      teachers: "id, name",
      timetable: "id, weekday, subjectId, teacherId, weekType",
      exceptions: "id, date, type, entryId",
      settings: "key",
      aiPresets: "id, name",
      aiConversations: "id, updatedAt",
      aiMessages: "id, conversationId, createdAt",
      tasks: "id, dueDate, completed, subjectId, priority, updatedAt",
      calendarEvents: "id, startAt, endAt, taskId",
      notes: "id, updatedAt, pinned, folder, subjectId",
      focusSessions: "id, startedAt, endedAt, kind, taskId",
      files: "id, name, category, subjectId, noteId, modifiedAt",
    });
    this.version(4).stores({
      subjects: "id, name",
      teachers: "id, name",
      timetable: "id, weekday, subjectId, teacherId, weekType",
      exceptions: "id, date, type, entryId",
      settings: "key",
      aiPresets: "id, name",
      aiConversations: "id, updatedAt",
      aiMessages: "id, conversationId, createdAt",
      aiAttachments: "id, messageId, createdAt",
      tasks: "id, dueDate, completed, subjectId, priority, updatedAt",
      calendarEvents: "id, startAt, endAt, taskId",
      notes: "id, updatedAt, pinned, folder, subjectId",
      focusSessions: "id, startedAt, endedAt, kind, taskId",
      files: "id, name, category, subjectId, noteId, modifiedAt",
    });
  }
}

export const db = new KxnoDatabase();

export function createId(): string {
  return crypto.randomUUID();
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
