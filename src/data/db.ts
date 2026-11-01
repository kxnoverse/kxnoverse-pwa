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
  period?: number;
  start: string;
  end: string;
  teacherId?: string;
  room?: string;
  colorOverride?: string;
  inheritTeacher?: boolean;
  inheritRoom?: boolean;
  inheritColor?: boolean;
  notes?: string;
  title?: string;
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

export interface DailyCheckin {
  id: string;
  date: string;
  sleepHours: number | null;
  mood: 1 | 2 | 3 | 4 | 5 | null;
  customMoodId?: string | null;
  plans: string;
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

export interface ArcadeRecord {
  id: string;
  value: string;
  updatedAt: number;
}

export type WorkspaceElementKind = "text" | "note" | "image" | "file" | "document";

export interface WorkspaceElement {
  id: string;
  kind: WorkspaceElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  borderColor: string;
  fontSize?: number;
  title: string;
  content: string;
  fileId?: string;
  noteId?: string;
  documentId?: string;
}

export interface WorkspaceConnection {
  id: string;
  fromId: string;
  toId: string;
}

export interface WorkspaceState {
  elements: WorkspaceElement[];
  connections: WorkspaceConnection[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface WorkspaceRecord {
  id: "default";
  state: WorkspaceState;
  updatedAt: number;
}

export interface SchoolDocument {
  id: string;
  title: string;
  subjectId?: string;
  createdAt: number;
  updatedAt: number;
  paperSize: "A4";
  orientation: "portrait" | "landscape";
  margins: { top: number; right: number; bottom: number; left: number };
  header: string;
  footer: string;
}

export interface SchoolDocumentContent {
  id: string;
  content: Record<string, unknown>;
  plainText: string;
}

export interface DocsTemplate {
  id: string;
  name: string;
  content: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SchoolDocumentImage {
  id: string;
  name: string;
  type: "image/png" | "image/jpeg" | "image/gif" | "image/bmp";
  size: number;
  blob: Blob;
  createdAt: number;
}

export type DiagramShape = "rounded" | "rectangle" | "circle" | "diamond";

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: DiagramShape;
  color: string;
}

export interface DiagramConnector {
  id: string;
  from: string;
  to: string;
  label: string;
  color: string;
}

export interface DiagramProject {
  id: string;
  name: string;
  nodes: DiagramNode[];
  connectors: DiagramConnector[];
  createdAt: number;
  updatedAt: number;
}

export type PresentationElementKind = "text" | "shape" | "image";
export type PresentationShape = "rectangle" | "rounded" | "circle" | "line";

export interface PresentationElement {
  id: string;
  kind: PresentationElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  shape?: PresentationShape;
  color?: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  blob?: Blob;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  imageName?: string;
}

export interface PresentationSlide {
  id: string;
  title: string;
  background: string;
  layout: string;
  elements: PresentationElement[];
}

export interface PresentationProject {
  id: string;
  name: string;
  templateId: string;
  slides: PresentationSlide[];
  createdAt: number;
  updatedAt: number;
}

export type PdfAnnotationTool = "text" | "highlight" | "draw";

export interface PdfAnnotation {
  id: string;
  page: number;
  type: PdfAnnotationTool;
  color: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  points?: Array<{ x: number; y: number }>;
}

export interface PdfProject {
  id: string;
  title: string;
  subjectId?: string;
  sourceFileId: string;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  annotations: PdfAnnotation[];
}

export interface CodeProject {
  id: string;
  name: string;
  html: string;
  css: string;
  javascript: string;
  createdAt: number;
  updatedAt: number;
}

export interface CodeLabProgress {
  id: "default";
  currentLessonId: string;
  completedLessonIds: string[];
  lessonCode: Record<string, { html: string; css: string; javascript: string }>;
  updatedAt: number;
}

export interface CodeGardenState {
  id: "default";
  activeMissionId: string;
  completedMissionIds: string[];
  resources: { plants: number; wood: number; stone: number; seeds: number; energy: number };
  upgrades: string[];
  programs?: Record<string, string>;
  bestResults?: Record<string, {
    instructions: number;
    harvested: number;
    collected: number;
    energyConsumed: number;
    energyGenerated: number;
  }>;
  activeRun?: {
    missionId: string;
    robot: { x: number; y: number; direction: string };
    tiles: Array<{ x: number; y: number; kind: string; growth?: number }>;
    harvested: number;
    collected: number;
    steps: number;
    completed: boolean;
    storageCapacity: number;
  };
  updatedAt: number;
}

export interface MusicFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

export interface MusicDirectoryHandle {
  kind: "directory";
  name: string;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
  values(): AsyncIterableIterator<MusicFileHandle | MusicDirectoryHandle>;
}

export interface MusicFolderSource {
  id: "library";
  name: string;
  handle: MusicDirectoryHandle;
  updatedAt: number;
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
  dailyCheckins!: EntityTable<DailyCheckin, "id">;
  notes!: EntityTable<SchoolNote, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;
  files!: EntityTable<LocalFile, "id">;
  arcadeData!: EntityTable<ArcadeRecord, "id">;
  workspace!: EntityTable<WorkspaceRecord, "id">;
  documents!: EntityTable<SchoolDocument, "id">;
  documentContents!: EntityTable<SchoolDocumentContent, "id">;
  docsTemplates!: EntityTable<DocsTemplate, "id">;
  documentImages!: EntityTable<SchoolDocumentImage, "id">;
  diagramProjects!: EntityTable<DiagramProject, "id">;
  presentations!: EntityTable<PresentationProject, "id">;
  pdfProjects!: EntityTable<PdfProject, "id">;
  codeProjects!: EntityTable<CodeProject, "id">;
  codeLabProgress!: EntityTable<CodeLabProgress, "id">;
  codeGardenState!: EntityTable<CodeGardenState, "id">;
  musicSources!: EntityTable<MusicFolderSource, "id">;

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
    this.version(5).stores({
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
      arcadeData: "id, updatedAt",
    });
    this.version(6).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
    });
    this.version(7).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
    });
    this.version(8).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
    });
    this.version(9).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
    });
    this.version(10).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
      codeProjects: "id, updatedAt",
      codeLabProgress: "id",
    });
    this.version(11).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
      codeProjects: "id, updatedAt",
      codeLabProgress: "id",
      codeGardenState: "id",
    });
    this.version(12).stores({
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
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
      codeProjects: "id, updatedAt",
      codeLabProgress: "id",
      codeGardenState: "id",
      musicSources: "id",
    });
    this.version(13).stores({
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
      dailyCheckins: "id",
      notes: "id, updatedAt, pinned, folder, subjectId",
      focusSessions: "id, startedAt, endedAt, kind, taskId",
      files: "id, name, category, subjectId, noteId, modifiedAt",
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
      codeProjects: "id, updatedAt",
      codeLabProgress: "id",
      codeGardenState: "id",
      musicSources: "id",
    });
    this.version(14).stores({
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
      dailyCheckins: "id",
      notes: "id, updatedAt, pinned, folder, subjectId",
      focusSessions: "id, startedAt, endedAt, kind, taskId",
      files: "id, name, category, subjectId, noteId, modifiedAt",
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
      codeProjects: "id, updatedAt",
      codeLabProgress: "id",
      codeGardenState: "id",
      musicSources: "id",
      diagramProjects: "id, updatedAt",
    });
    this.version(15).stores({
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
      dailyCheckins: "id",
      notes: "id, updatedAt, pinned, folder, subjectId",
      focusSessions: "id, startedAt, endedAt, kind, taskId",
      files: "id, name, category, subjectId, noteId, modifiedAt",
      arcadeData: "id, updatedAt",
      workspace: "id",
      documents: "id, updatedAt",
      documentContents: "id",
      documentImages: "id, type, createdAt",
      pdfProjects: "id, updatedAt, sourceFileId",
      docsTemplates: "id, updatedAt",
      codeProjects: "id, updatedAt",
      codeLabProgress: "id",
      codeGardenState: "id",
      musicSources: "id",
      diagramProjects: "id, updatedAt",
      presentations: "id, updatedAt",
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
