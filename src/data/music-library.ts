import {
  db,
  type MusicDirectoryHandle,
  type MusicFolderSource,
} from "./db";
import { createMusicTrack, isSupportedAudioFile, type MusicTrack } from "./music";

type MusicDirectoryPicker = (
  options?: { mode: "read" },
) => Promise<MusicDirectoryHandle>;

const MUSIC_FOLDER_ID = "library";

export type MusicFolderStatus =
  | { kind: "unsupported" }
  | { kind: "none" }
  | { kind: "permission-required"; source: MusicFolderSource }
  | { kind: "ready"; source: MusicFolderSource };

export interface MusicScanResult {
  tracks: MusicTrack[];
  unsupportedCount: number;
  inaccessibleCount: number;
}

export function supportsMusicFolderPicker(): boolean {
  return typeof (window as Window & { showDirectoryPicker?: MusicDirectoryPicker })
    .showDirectoryPicker === "function";
}

export async function chooseMusicFolder(): Promise<MusicFolderSource | null> {
  const picker = (window as Window & { showDirectoryPicker?: MusicDirectoryPicker })
    .showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker.call(window, { mode: "read" });
  const source: MusicFolderSource = {
    id: MUSIC_FOLDER_ID,
    name: handle.name,
    handle,
    updatedAt: Date.now(),
  };
  await db.musicSources.put(source);
  return source;
}

export async function getSavedMusicFolder(): Promise<MusicFolderStatus> {
  if (!supportsMusicFolderPicker()) return { kind: "unsupported" };
  const source = await db.musicSources.get(MUSIC_FOLDER_ID);
  if (!source) return { kind: "none" };
  const handle = source.handle;
  const permission = await handle.queryPermission({ mode: "read" });
  return permission === "granted"
    ? { kind: "ready", source }
    : { kind: "permission-required", source };
}

export async function requestMusicFolderPermission(
  source: MusicFolderSource,
): Promise<boolean> {
  const handle = source.handle;
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}

async function collectFolderFiles(
  directory: MusicDirectoryHandle,
  parentPath: string,
  files: Array<{ file: File; sourcePath: string }>,
  result: Pick<MusicScanResult, "unsupportedCount" | "inaccessibleCount">,
): Promise<void> {
  for await (const entry of directory.values()) {
    if (entry.kind === "directory") {
      await collectFolderFiles(entry, `${parentPath}${entry.name}/`, files, result);
      continue;
    }
    try {
      const file = await entry.getFile();
      if (!isSupportedAudioFile(file)) {
        result.unsupportedCount += 1;
        continue;
      }
      files.push({ file, sourcePath: `${parentPath}${entry.name}` });
    } catch {
      result.inaccessibleCount += 1;
    }
  }
}

export async function scanMusicFolder(
  source: MusicFolderSource,
): Promise<MusicScanResult> {
  const result: MusicScanResult = {
    tracks: [],
    unsupportedCount: 0,
    inaccessibleCount: 0,
  };
  const handle = source.handle;
  const files: Array<{ file: File; sourcePath: string }> = [];
  await collectFolderFiles(handle, "", files, result);
  for (const { file, sourcePath } of files) {
    try {
      result.tracks.push(await createMusicTrack(file, sourcePath, "folder"));
    } catch {
      result.inaccessibleCount += 1;
    }
  }
  return result;
}

export async function scanSelectedMusicFiles(files: FileList | File[]): Promise<MusicScanResult> {
  const result: MusicScanResult = {
    tracks: [],
    unsupportedCount: 0,
    inaccessibleCount: 0,
  };
  for (const file of Array.from(files)) {
    if (!isSupportedAudioFile(file)) {
      result.unsupportedCount += 1;
      continue;
    }
    try {
      result.tracks.push(
        await createMusicTrack(file, file.webkitRelativePath || file.name),
      );
    } catch {
      result.inaccessibleCount += 1;
    }
  }
  return result;
}

export async function forgetMusicFolder(): Promise<void> {
  await db.musicSources.delete(MUSIC_FOLDER_ID);
}
