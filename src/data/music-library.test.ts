import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseMusicFolder,
  getSavedMusicFolder,
  requestMusicFolderPermission,
  scanMusicFolder,
  scanSelectedMusicFiles,
  supportsMusicFolderPicker,
} from "./music-library";
import { db, type MusicDirectoryHandle, type MusicFileHandle } from "./db";

type DirectoryPicker = (options?: { mode: "read" }) => Promise<MusicDirectoryHandle>;

const originalPicker = Object.getOwnPropertyDescriptor(window, "showDirectoryPicker");

function setDirectoryPicker(picker: DirectoryPicker | undefined): void {
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: picker,
  });
}

function directory(
  name: string,
  entries: Array<MusicDirectoryHandle | MusicFileHandle> = [],
  permission: PermissionState = "granted",
): MusicDirectoryHandle {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    async *values() {
      yield* entries;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalPicker) {
    Object.defineProperty(window, "showDirectoryPicker", originalPicker);
  } else {
    delete (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  }
});

describe("local music library access", () => {
  it("persists a selected folder and reports whether permission must be requested", async () => {
    const handle = directory("My Music", [], "prompt");
    const picker = vi.fn(async () => handle);
    setDirectoryPicker(picker);
    const put = vi.spyOn(db.musicSources, "put").mockResolvedValue("library");
    const get = vi.spyOn(db.musicSources, "get").mockResolvedValue({
      id: "library",
      name: "My Music",
      handle,
      updatedAt: 123,
    });

    const source = await chooseMusicFolder();
    expect(picker).toHaveBeenCalledWith({ mode: "read" });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      id: "library",
      name: "My Music",
      handle,
    }));
    await expect(getSavedMusicFolder()).resolves.toMatchObject({
      kind: "permission-required",
      source: { id: "library", name: "My Music" },
    });
    expect(get).toHaveBeenCalledWith("library");
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: "read" });
    await expect(requestMusicFolderPermission(source!)).resolves.toBe(false);
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "read" });
  });

  it("scans nested folders and counts unsupported or unreadable files", async () => {
    const song = new File(["audio"], "song.wav", { type: "audio/wav", lastModified: 1 });
    const root = directory("Music", [
      {
        kind: "file",
        name: "notes.pdf",
        getFile: async () => new File(["not audio"], "notes.pdf", { type: "application/pdf" }),
      },
      {
        kind: "file",
        name: "locked.wav",
        getFile: async () => { throw new DOMException("Permission denied", "NotAllowedError"); },
      },
      directory("Albums", [{
        kind: "file",
        name: "song.wav",
        getFile: async () => song,
      }]),
    ]);

    const result = await scanMusicFolder({
      id: "library",
      name: "Music",
      handle: root,
      updatedAt: 1,
    });

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toMatchObject({
      title: "song",
      sourcePath: "Albums/song.wav",
      sourceType: "folder",
    });
    expect(result.unsupportedCount).toBe(1);
    expect(result.inaccessibleCount).toBe(1);
  });

  it("falls back to file import when directory selection is unavailable", async () => {
    setDirectoryPicker(undefined);
    expect(supportsMusicFolderPicker()).toBe(false);
    await expect(getSavedMusicFolder()).resolves.toEqual({ kind: "unsupported" });

    const result = await scanSelectedMusicFiles([
      new File(["audio"], "song.ogg", { type: "audio/ogg" }),
      new File(["text"], "readme.txt", { type: "text/plain" }),
    ]);
    expect(result.tracks.map((track) => track.title)).toEqual(["song"]);
    expect(result.tracks[0].sourceType).toBe("files");
    expect(result.unsupportedCount).toBe(1);
  });
});
