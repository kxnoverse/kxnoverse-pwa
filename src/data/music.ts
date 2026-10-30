export const supportedAudioExtensions = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
]);

export interface MusicTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  fileName: string;
  sourcePath: string;
  sourceType: "folder" | "files";
  file: File;
  duration: number | null;
  artwork?: Blob;
  addedAt: number;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  description?: string;
  cover?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MusicFloatingPlayerBounds {
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export async function createPlaylistCover(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the playlist cover.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Playlist cover images must be 12 MB or smaller.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192) {
      throw new Error("This image cannot be used as a playlist cover.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Playlist cover image processing is unavailable.");
    const scale = Math.max(320 / image.naturalWidth, 320 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (320 - width) / 2, (320 - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export type MusicRepeatMode = "off" | "all" | "one";
export type MusicView = "now-playing" | "library" | "playlists" | "favorites";

export interface MusicTags {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: Blob;
}

const audioMimeTypes: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
};

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedAudioFile(file: Pick<File, "name" | "type">): boolean {
  const extension = extensionOf(file.name);
  return supportedAudioExtensions.has(extension) ||
    (file.type.startsWith("audio/") &&
      Object.values(audioMimeTypes).includes(file.type.toLowerCase()));
}

export function getAudioMimeType(file: Pick<File, "name" | "type">): string {
  return file.type || audioMimeTypes[extensionOf(file.name)] || "audio/mpeg";
}

function decodeId3Text(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const encoding = bytes[0];
  const text = bytes.subarray(1);
  try {
    if (encoding === 1) return new TextDecoder("utf-16").decode(text).replace(/\0+$/g, "").trim();
    if (encoding === 2) return new TextDecoder("utf-16be").decode(text).replace(/\0+$/g, "").trim();
    if (encoding === 3) return new TextDecoder("utf-8").decode(text).replace(/\0+$/g, "").trim();
    return new TextDecoder("windows-1252").decode(text).replace(/\0+$/g, "").trim();
  } catch {
    return "";
  }
}

function readFrameSize(bytes: Uint8Array, version: number): number {
  if (version === 4) {
    return ((bytes[0] & 0x7f) << 21) |
      ((bytes[1] & 0x7f) << 14) |
      ((bytes[2] & 0x7f) << 7) |
      (bytes[3] & 0x7f);
  }
  return (
    bytes[0] * 0x1000000 +
    bytes[1] * 0x10000 +
    bytes[2] * 0x100 +
    bytes[3]
  );
}

function parsePictureFrame(frame: Uint8Array): Blob | undefined {
  if (frame.length < 5) return undefined;
  const encoding = frame[0];
  let mimeEnd = 1;
  while (mimeEnd < frame.length && frame[mimeEnd] !== 0) mimeEnd += 1;
  const mimeType = new TextDecoder("ascii").decode(frame.subarray(1, mimeEnd));
  const descriptionStart = Math.min(mimeEnd + 2, frame.length);
  const terminatorWidth = encoding === 1 || encoding === 2 ? 2 : 1;
  let imageStart = descriptionStart;
  while (imageStart + terminatorWidth <= frame.length) {
    if (
      frame[imageStart] === 0 &&
      (terminatorWidth === 1 || frame[imageStart + 1] === 0)
    ) {
      imageStart += terminatorWidth;
      break;
    }
    imageStart += terminatorWidth;
  }
  const image = frame.subarray(imageStart);
  if (image.length === 0 || image.length > 4 * 1024 * 1024) return undefined;
  return new Blob([image], { type: mimeType.startsWith("image/") ? mimeType : "image/jpeg" });
}

export async function readMp3Tags(file: Blob): Promise<MusicTags> {
  if (file.size < 10) return {};
  const header = new Uint8Array(await readBlobArrayBuffer(file.slice(0, 10)));
  if (
    header[0] !== 0x49 ||
    header[1] !== 0x44 ||
    header[2] !== 0x33 ||
    header[3] < 3 ||
    header[3] > 4
  ) {
    return {};
  }
  const version = header[3];
  const tagSize =
    ((header[6] & 0x7f) << 21) |
    ((header[7] & 0x7f) << 14) |
    ((header[8] & 0x7f) << 7) |
    (header[9] & 0x7f);
  const availableSize = Math.min(tagSize, file.size - 10, 4 * 1024 * 1024);
  if (availableSize <= 0) return {};
  const data = new Uint8Array(
    await readBlobArrayBuffer(file.slice(10, 10 + availableSize)),
  );
  const tags: MusicTags = {};
  const frameHeaderSize = 10;
  let offset = header[5] & 0x40 ? 14 : 0;
  let frameCount = 0;
  while (offset + frameHeaderSize <= data.length && frameCount < 512) {
    const frameId = String.fromCharCode(...data.subarray(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
    const size = readFrameSize(data.subarray(offset + 4, offset + 8), version);
    if (size <= 0 || offset + frameHeaderSize + size > data.length) break;
    const frame = data.subarray(offset + frameHeaderSize, offset + frameHeaderSize + size);
    if (frameId === "TIT2") tags.title = decodeId3Text(frame) || undefined;
    else if (frameId === "TPE1") tags.artist = decodeId3Text(frame) || undefined;
    else if (frameId === "TALB") tags.album = decodeId3Text(frame) || undefined;
    else if (frameId === "APIC") tags.artwork = parsePictureFrame(frame);
    offset += frameHeaderSize + size;
    frameCount += 1;
  }
  return tags;
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Unable to read audio metadata."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read audio metadata."));
    reader.onabort = () => reject(new DOMException("Audio metadata read was aborted.", "AbortError"));
    reader.readAsArrayBuffer(blob);
  });
}

function stableTrackId(sourcePath: string, file: Pick<File, "name" | "size" | "lastModified">): string {
  const input = `${sourcePath}\u0000${file.name}\u0000${file.size}\u0000${file.lastModified}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `track-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function createMusicTrack(
  file: File,
  sourcePath = file.name,
  sourceType: "folder" | "files" = "files",
): Promise<MusicTrack> {
  const tags = extensionOf(file.name) === "mp3" ? await readMp3Tags(file) : {};
  const fallbackTitle = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
  return {
    id: stableTrackId(sourcePath, file),
    title: tags.title || fallbackTitle,
    artist: tags.artist,
    album: tags.album,
    fileName: file.name,
    sourcePath,
    sourceType,
    file,
    duration: null,
    ...(tags.artwork ? { artwork: tags.artwork } : {}),
    addedAt: Date.now(),
  };
}

export function sortMusicTracks(
  tracks: MusicTrack[],
  sortBy: "title" | "artist" | "album" | "recent",
): MusicTrack[] {
  return [...tracks].sort((a, b) => {
    if (sortBy === "recent") return b.addedAt - a.addedAt || a.title.localeCompare(b.title);
    const aValue = sortBy === "title" ? a.title : a[sortBy] ?? "";
    const bValue = sortBy === "title" ? b.title : b[sortBy] ?? "";
    return aValue.localeCompare(bValue, undefined, { sensitivity: "base" }) ||
      a.title.localeCompare(b.title);
  });
}

export function formatMusicDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function getNextTrackIndex(
  queue: string[],
  currentIndex: number,
  repeat: MusicRepeatMode,
  shuffle: boolean,
  random = Math.random,
): number {
  if (queue.length === 0) return -1;
  if (repeat === "one") return currentIndex;
  if (shuffle && queue.length > 1) {
    const choices = queue.map((_, index) => index).filter((index) => index !== currentIndex);
    return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  }
  if (currentIndex + 1 < queue.length) return currentIndex + 1;
  return repeat === "all" ? 0 : -1;
}

export function getPreviousTrackIndex(
  queue: string[],
  currentIndex: number,
  repeat: MusicRepeatMode,
): number {
  if (queue.length === 0) return -1;
  if (currentIndex > 0) return currentIndex - 1;
  return repeat === "all" ? queue.length - 1 : -1;
}

export async function probeAudioDuration(file: File): Promise<number | null> {
  const audio = document.createElement("audio");
  const url = URL.createObjectURL(file);
  audio.preload = "metadata";
  return new Promise((resolve) => {
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const onLoaded = () =>
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    const onError = () => finish(null);
    const timeout = window.setTimeout(() => finish(null), 12_000);
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.src = url;
    audio.load();
  });
}
