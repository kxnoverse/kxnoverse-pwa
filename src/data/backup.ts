import { db } from "./db";
import { defaultAppearance, useUiStore } from "../stores/ui-store";
import { i18n } from "../i18n";
import { isBlobLike, readBlobAsArrayBuffer } from "./blob-utils";
import { isWorkspaceState } from "./workspace";
import { isDocumentContent, isDocsTemplate, isSchoolDocument } from "./docs";
import { isPdfProject } from "./docs-pdf";
import { isCodeLabProgress, isCodeProject } from "./code-lab";
import { isCodeGardenState } from "./code-garden";

const BACKUP_FORMAT = "kxnodesk-local-backup";
const MAX_IMPORT_BYTES = 150 * 1024 * 1024;
const MAX_RECORDS = 50_000;
const PRIVATE_RUNTIME_SETTINGS = new Set(["aiCloudConsent", "aiCloudConsentEndpoint", "aiCloudEnabled", "focusTimerState", "stopwatchState"]);
const PREFERENCE_KEYS = ["kxnodesk-ui", "kxnodesk-language"] as const;
const DATA_TABLES = [
  "subjects",
  "teachers",
  "timetable",
  "exceptions",
  "settings",
  "aiPresets",
  "aiConversations",
  "aiMessages",
  "tasks",
  "calendarEvents",
  "notes",
  "focusSessions",
  "files",
  "aiAttachments",
  "arcadeData",
  "workspace",
  "documents",
  "documentContents",
  "documentImages",
  "pdfProjects",
  "docsTemplates",
  "codeProjects",
  "codeLabProgress",
  "codeGardenState",
  "dailyCheckins",
] as const;

type DataTableName = (typeof DATA_TABLES)[number];
type BackupRecord = Record<string, unknown>;
type BackupImportSummary = Record<DataTableName, { added: number; skipped: number }> & {
  preferences: { added: number; skipped: number };
};

interface DataBackup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  data: Partial<Record<DataTableName, BackupRecord[]>>;
  preferences?: Partial<Record<(typeof PREFERENCE_KEYS)[number], string>>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("The backup contains an invalid file attachment.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isRecord(value: unknown): value is BackupRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: BackupRecord, key: string): boolean {
  return typeof record[key] === "string";
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const requiredStrings: Record<DataTableName, string[]> = {
  subjects: ["id", "name", "color"],
  teachers: ["id", "name"],
  timetable: ["id", "start", "end", "weekType", "kind"],
  exceptions: ["id", "date", "type"],
  settings: ["key", "value"],
  aiPresets: ["id", "name", "assistantName", "model"],
  aiConversations: ["id", "title", "presetId"],
  aiMessages: ["id", "conversationId", "role", "content"],
  tasks: ["id", "title", "description", "dueDate", "priority", "category"],
  calendarEvents: ["id", "type", "title", "description", "startAt", "endAt", "color"],
  dailyCheckins: ["id", "date", "plans"],
  notes: ["id", "title", "content", "folder"],
  focusSessions: ["id", "kind"],
  files: ["id", "name", "type", "category", "blobData"],
  aiAttachments: ["id", "messageId", "name", "mimeType", "blobData"],
  arcadeData: ["id", "value"],
  workspace: ["id"],
  documents: ["id", "title", "paperSize", "orientation", "header", "footer"],
  documentContents: ["id", "plainText"],
  documentImages: ["id", "name", "type", "blobData"],
  pdfProjects: ["id", "title", "sourceFileId"],
  docsTemplates: ["id", "name"],
  codeProjects: ["id", "name", "html", "css", "javascript"],
  codeLabProgress: ["id", "currentLessonId"],
  codeGardenState: ["id", "activeMissionId"],
};

function validateRecord(table: DataTableName, record: BackupRecord): void {
  if (!requiredStrings[table].every((field) => hasString(record, field))) {
    throw new Error(`The backup contains an invalid ${table} record.`);
  }
  if (table === "files" || table === "aiAttachments" || table === "documentImages") {
    if (!hasString(record, "blobData")) throw new Error("The backup contains an invalid file attachment.");
    if (table === "aiAttachments" && !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(String(record.mimeType))) {
      throw new Error("The backup contains an unsupported AI attachment.");
    }
    if (table === "documentImages" && !["image/png", "image/jpeg", "image/gif", "image/bmp"].includes(String(record.type))) {
      throw new Error("The backup contains an unsupported document image.");
    }
    const bytes = base64ToBytes(record.blobData as string);
    if (typeof record.size !== "number" || bytes.byteLength !== record.size) {
      throw new Error("The backup contains a file with an invalid size.");
    }
    const mimeType = table === "files" ? record.type : record.mimeType;
    record.blob = new Blob([bytes], { type: mimeType as string });
    delete record.blobData;
  }
  if (table === "tasks" && (!Array.isArray(record.tags) || !Array.isArray(record.subtasks) || typeof record.completed !== "boolean")) {
    throw new Error("The backup contains an invalid task.");
  }
  if (table === "notes" && typeof record.pinned !== "boolean") {
    throw new Error("The backup contains an invalid note.");
  }
  if (table === "dailyCheckins" &&
    (record.id !== record.date || !isDateKey(record.date) ||
      !(record.sleepHours === null || (typeof record.sleepHours === "number" &&
        Number.isFinite(record.sleepHours) && record.sleepHours >= 0 && record.sleepHours <= 24)) ||
      !(record.mood === null || (Number.isInteger(record.mood) && Number(record.mood) >= 1 && Number(record.mood) <= 5)) ||
      !(record.customMoodId === undefined || record.customMoodId === null ||
        (typeof record.customMoodId === "string" && record.customMoodId.length > 0 && record.customMoodId.length <= 100)) ||
      typeof record.plans !== "string" || record.plans.length > 1000 ||
      typeof record.updatedAt !== "number" || !Number.isFinite(record.updatedAt))) {
    throw new Error("The backup contains an invalid daily check-in.");
  }
  if (table === "focusSessions" && (typeof record.startedAt !== "number" || typeof record.endedAt !== "number" || typeof record.plannedSeconds !== "number" || typeof record.durationSeconds !== "number")) {
    throw new Error("The backup contains an invalid focus session.");
  }
  if (table === "workspace" && (!isWorkspaceState(record.state) || typeof record.updatedAt !== "number" || !Number.isFinite(record.updatedAt))) {
    throw new Error("The backup contains invalid workspace data.");
  }
  if (table === "documents" && !isSchoolDocument(record)) {
    throw new Error("The backup contains an invalid document.");
  }
  if (table === "documentContents" && !isDocumentContent(record)) {
    throw new Error("The backup contains invalid document content.");
  }
  if (table === "pdfProjects" && !isPdfProject(record)) {
    throw new Error("The backup contains an invalid PDF project.");
  }
  if (table === "docsTemplates" && !isDocsTemplate(record)) {
    throw new Error("The backup contains an invalid Docs template.");
  }
  if (table === "codeProjects" && !isCodeProject(record)) {
    throw new Error("The backup contains an invalid Code Lab project.");
  }
  if (table === "codeLabProgress" && !isCodeLabProgress(record)) {
    throw new Error("The backup contains invalid Code Lab progress.");
  }
  if (table === "codeGardenState" && !isCodeGardenState(record)) {
    throw new Error("The backup contains invalid Code Garden progress.");
  }
}

function validateAppearance(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The backup contains an invalid appearance preference.");
  }
  if (!isRecord(parsed) || parsed.version !== 3 || !isRecord(parsed.state) || !isRecord(parsed.state.appearance)) {
    throw new Error("The backup contains an invalid appearance preference.");
  }
  const appearance = parsed.state.appearance;
  const numericRanges: Record<string, [number, number]> = {
    textContrast: [0, 1],
    borderIntensity: [0, 1],
    cornerRadius: [0, 16],
    intensity: [0, 1],
    opacity: [0, 1],
    gridSpacing: [16, 80],
    animationSpeed: [0, 1],
    reflectionStrength: [0, 1],
    accentInfluence: [0, 1],
    imageBlur: [0, 20],
    imageOverlay: [0, 1],
    uiScale: [0.8, 1.4],
  };
  const booleanKeys = ["highlights", "cursorReactive", "animateBackground", "performanceMode"];
  const stringValues: Record<string, string[]> = {
    mode: ["dark", "light"],
    backgroundStyle: ["solid", "grid", "glow", "chrome", "custom"],
    imagePosition: ["center", "top", "bottom", "left", "right"],
    imageFit: ["cover", "contain"],
    hourFormat: ["12", "24"],
  };
  for (const [key, entry] of Object.entries(appearance)) {
    if (!(key in defaultAppearance)) throw new Error("The backup contains an unsupported appearance setting.");
    if (key === "accent" || key === "background" || key === "surface") {
      if (typeof entry !== "string" || !/^#[0-9a-fA-F]{6}$/.test(entry)) throw new Error("The backup contains an invalid theme color.");
    } else if (numericRanges[key]) {
      const [min, max] = numericRanges[key];
      if (typeof entry !== "number" || !Number.isFinite(entry) || entry < min || entry > max) throw new Error("The backup contains an invalid appearance value.");
    } else if (booleanKeys.includes(key)) {
      if (typeof entry !== "boolean") throw new Error("The backup contains an invalid appearance value.");
    } else if (stringValues[key]) {
      if (typeof entry !== "string" || !stringValues[key].includes(entry)) throw new Error("The backup contains an invalid appearance value.");
    }
  }
  return appearance;
}

export async function exportDataBackup(): Promise<Blob> {
  const data: DataBackup["data"] = {};
  for (const name of DATA_TABLES) {
    const records = (await db.table(name).toArray() as BackupRecord[])
      .filter((record) => name !== "settings" || (
        !PRIVATE_RUNTIME_SETTINGS.has(record.key as string) &&
        !(record.key as string).startsWith("regionalCalendar:")
      ));
    if (name === "files" || name === "aiAttachments" || name === "documentImages") {
      const serializedRecords: BackupRecord[] = [];
      for (const record of records) {
        const blob = record.blob;
        if (!isBlobLike(blob)) throw new Error("A local attachment could not be added to the backup.");
        const bytes = new Uint8Array(await readBlobAsArrayBuffer(blob));
        const { blob: _blob, ...rest } = record;
        serializedRecords.push({ ...rest, blobData: bytesToBase64(bytes) });
      }
      data[name] = serializedRecords;
    } else {
      data[name] = records;
    }
  }
  const preferences: DataBackup["preferences"] = {};
  for (const key of PREFERENCE_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) preferences[key] = value;
  }
  return new Blob([JSON.stringify({
    format: BACKUP_FORMAT,
    schemaVersion: 13,
    exportedAt: new Date().toISOString(),
    data,
    preferences,
  } satisfies DataBackup, null, 2)], { type: "application/json" });
}

export async function importDataBackup(file: File): Promise<BackupImportSummary> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("This backup is larger than the 150 MB import limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("The selected file is not valid backup JSON.");
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT || typeof parsed.schemaVersion !== "number" || parsed.schemaVersion < 2 || parsed.schemaVersion > 13 || !isRecord(parsed.data)) {
    throw new Error("This file is not a supported Kxno Desk backup.");
  }

  const data = parsed.data;
  const preferences = parsed.preferences === undefined ? {} : parsed.preferences;
  if (!isRecord(preferences) || Object.keys(preferences).some((key) => !PREFERENCE_KEYS.includes(key as (typeof PREFERENCE_KEYS)[number])) ||
    Object.values(preferences).some((value) => typeof value !== "string" || value.length > MAX_IMPORT_BYTES)) {
    throw new Error("The backup contains invalid application preferences.");
  }
  if (typeof preferences["kxnodesk-language"] === "string" && !["en", "de"].includes(preferences["kxnodesk-language"])) {
    throw new Error("The backup contains an unsupported language preference.");
  }
  const importedAppearance = typeof preferences["kxnodesk-ui"] === "string" ? validateAppearance(preferences["kxnodesk-ui"]) : undefined;
  const recordsByTable = {} as Record<DataTableName, BackupRecord[]>;
  let total = 0;
  for (const name of DATA_TABLES) {
    const records = data[name];
    if (records === undefined && ((parsed.schemaVersion < 3 && DATA_TABLES.indexOf(name) >= 8) || (parsed.schemaVersion < 4 && name === "aiAttachments") || (parsed.schemaVersion < 5 && name === "arcadeData") || (parsed.schemaVersion < 6 && name === "workspace") || (parsed.schemaVersion < 7 && ["documents", "documentContents", "documentImages"].includes(name)) || (parsed.schemaVersion < 8 && name === "pdfProjects") || (parsed.schemaVersion < 9 && name === "docsTemplates") || (parsed.schemaVersion < 10 && ["codeProjects", "codeLabProgress"].includes(name)) || (parsed.schemaVersion < 11 && name === "codeGardenState") || (parsed.schemaVersion < 13 && name === "dailyCheckins"))) {
      recordsByTable[name] = [];
      continue;
    }
    if (!Array.isArray(records)) throw new Error(`The backup is missing its ${name} data.`);
    total += records.length;
    if (total > MAX_RECORDS) throw new Error("The backup contains too many records.");
    records.forEach((record) => {
      if (!isRecord(record)) throw new Error(`The backup contains an invalid ${name} record.`);
      validateRecord(name, record);
    });
    recordsByTable[name] = records;
  }

  const summary = Object.fromEntries(DATA_TABLES.map((name) => [name, { added: 0, skipped: 0 }])) as Record<DataTableName, { added: number; skipped: number }>;
  async function addTableRecords(name: DataTableName) {
    const table = db.table(name);
    const keyPath = table.schema.primKey.keyPath;
    if (typeof keyPath !== "string") throw new Error(`Cannot safely restore ${name} records.`);
    for (const record of recordsByTable[name]) {
      const key = record[keyPath];
      if (key === undefined || key === null) throw new Error(`A ${name} record is missing its identifier.`);
      if (name === "settings" && PRIVATE_RUNTIME_SETTINGS.has(String(key))) {
        summary[name].skipped += 1;
        continue;
      }
      if (await table.get(key as string | number) !== undefined) {
        summary[name].skipped += 1;
      } else {
        await table.add(record);
        summary[name].added += 1;
      }
    }
  }
  await db.transaction("rw", db.subjects, db.teachers, db.timetable, db.exceptions, db.settings, async () => {
    for (const name of DATA_TABLES.slice(0, 5)) await addTableRecords(name);
  });
  await db.transaction("rw", [db.aiPresets, db.aiConversations, db.aiMessages, db.tasks, db.calendarEvents, db.aiAttachments], async () => {
    for (const name of DATA_TABLES.slice(5, 10)) await addTableRecords(name);
    await addTableRecords("aiAttachments");
  });
  await db.transaction("rw", db.notes, db.focusSessions, db.files, db.arcadeData, db.workspace, async () => {
    for (const name of DATA_TABLES.slice(10, 13)) await addTableRecords(name);
    await addTableRecords("arcadeData");
    await addTableRecords("workspace");
  });
  await db.transaction("rw", db.documents, db.documentContents, db.documentImages, async () => {
    await addTableRecords("documents");
    await addTableRecords("documentContents");
    await addTableRecords("documentImages");
  });
  await db.transaction("rw", db.pdfProjects, async () => {
    await addTableRecords("pdfProjects");
  });
  await db.transaction("rw", db.docsTemplates, async () => {
    await addTableRecords("docsTemplates");
  });
  await db.transaction("rw", db.codeProjects, db.codeLabProgress, async () => {
    await addTableRecords("codeProjects");
    await addTableRecords("codeLabProgress");
  });
  await db.transaction("rw", db.codeGardenState, async () => {
    await addTableRecords("codeGardenState");
  });
  await db.transaction("rw", db.dailyCheckins, async () => {
    await addTableRecords("dailyCheckins");
  });
  const preferenceSummary = { added: 0, skipped: 0 };
  for (const key of PREFERENCE_KEYS) {
    const value = preferences[key];
    if (typeof value !== "string") continue;
    if (localStorage.getItem(key) !== null) {
      preferenceSummary.skipped += 1;
      continue;
    }
    localStorage.setItem(key, value);
    preferenceSummary.added += 1;
    if (key === "kxnodesk-ui" && importedAppearance) {
      useUiStore.getState().updateAppearance(importedAppearance as Partial<typeof defaultAppearance>);
    }
    if (key === "kxnodesk-language") await i18n.changeLanguage(value);
  }
  return { ...summary, preferences: preferenceSummary };
}
