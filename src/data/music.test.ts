import { describe, expect, it, vi } from "vitest";
import {
  createMusicTrack,
  createPlaylistCover,
  formatMusicDuration,
  getNextTrackIndex,
  getPreviousTrackIndex,
  isSupportedAudioFile,
  readMp3Tags,
  sortMusicTracks,
} from "./music";
import { MusicPlaybackController, type MusicAudioPort } from "./music-playback";

function frame(id: string, value: string): Uint8Array {
  const text = new TextEncoder().encode(value);
  const payload = new Uint8Array([3, ...text]);
  return new Uint8Array([
    ...new TextEncoder().encode(id),
    (payload.length >>> 24) & 0xff,
    (payload.length >>> 16) & 0xff,
    (payload.length >>> 8) & 0xff,
    payload.length & 0xff,
    0,
    0,
    ...payload,
  ]);
}

function id3File(title: string, artist: string): File {
  const frames = new Uint8Array([...frame("TIT2", title), ...frame("TPE1", artist)]);
  const size = [
    (frames.length >>> 21) & 0x7f,
    (frames.length >>> 14) & 0x7f,
    (frames.length >>> 7) & 0x7f,
    frames.length & 0x7f,
  ];
  return new File([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...size]), frames], "sample.mp3", {
    type: "audio/mpeg",
    lastModified: 1,
  });
}

class MockAudio extends EventTarget implements MusicAudioPort {
  currentTime = 0;
  duration = 90;
  volume = 1;
  src = "";
  paused = true;
  preload = "";
  error: MediaError | null = null;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
}

describe("local music helpers", () => {
  it("rejects non-image playlist covers with a clear error", async () => {
    await expect(
      createPlaylistCover(new File(["not an image"], "cover.txt", { type: "text/plain" })),
    ).rejects.toThrow("Choose an image file for the playlist cover.");
  });

  it("recognizes supported audio files without treating arbitrary files as music", () => {
    expect(isSupportedAudioFile({ name: "song.MP3", type: "" })).toBe(true);
    expect(isSupportedAudioFile({ name: "recording.oga", type: "" })).toBe(true);
    expect(isSupportedAudioFile({ name: "document.pdf", type: "application/pdf" })).toBe(false);
    expect(isSupportedAudioFile({ name: "unknown.bin", type: "audio/mpeg" })).toBe(true);
  });

  it("uses ID3 title and artist metadata and falls back to the filename", async () => {
    const file = id3File("A song", "An artist");
    await expect(readMp3Tags(file)).resolves.toMatchObject({
      title: "A song",
      artist: "An artist",
    });
    await expect(createMusicTrack(file)).resolves.toMatchObject({
      title: "A song",
      artist: "An artist",
      duration: null,
      sourceType: "files",
    });
    await expect(createMusicTrack(new File(["x"], "fallback-name.wav"))).resolves.toMatchObject({
      title: "fallback-name",
      fileName: "fallback-name.wav",
    });
  });

  it("sorts by the requested metadata and formats durations safely", async () => {
    const beta = await createMusicTrack(new File(["x"], "Beta.mp3"));
    const alpha = await createMusicTrack(new File(["x"], "Alpha.mp3"));
    const tracks = [
      { ...beta, artist: "Zed", addedAt: 1 },
      { ...alpha, artist: "Ada", addedAt: 2 },
    ];
    expect(sortMusicTracks(tracks, "title").map((track) => track.title)).toEqual(["Alpha", "Beta"]);
    expect(sortMusicTracks(tracks, "artist").map((track) => track.artist)).toEqual(["Ada", "Zed"]);
    expect(sortMusicTracks(tracks, "recent").map((track) => track.title)).toEqual(["Alpha", "Beta"]);
    expect(formatMusicDuration(3661.9)).toBe("61:01");
    expect(formatMusicDuration(null)).toBe("--:--");
    expect(formatMusicDuration(Number.NaN)).toBe("--:--");
  });

  it("selects queue progression for repeat, shuffle, and previous-track behavior", () => {
    expect(getNextTrackIndex(["a", "b", "c"], 0, "off", false)).toBe(1);
    expect(getNextTrackIndex(["a", "b"], 1, "off", false)).toBe(-1);
    expect(getNextTrackIndex(["a", "b"], 1, "all", false)).toBe(0);
    expect(getNextTrackIndex(["a", "b"], 0, "one", true)).toBe(0);
    expect(getNextTrackIndex(["a", "b", "c"], 1, "off", true, () => 0)).toBe(0);
    expect(getPreviousTrackIndex(["a", "b"], 0, "off")).toBe(-1);
    expect(getPreviousTrackIndex(["a", "b"], 0, "all")).toBe(1);
  });

  it("keeps playback state and object URLs synchronized and releases listeners on disposal", async () => {
    const audio = new MockAudio();
    const onPlayingChange = vi.fn();
    const onTimeChange = vi.fn();
    const onMetadata = vi.fn();
    const onEnded = vi.fn();
    const onError = vi.fn();
    const revoke = vi.fn();
    const controller = new MusicPlaybackController(
      audio,
      { onPlayingChange, onTimeChange, onMetadata, onEnded, onError },
      () => "blob:local-track",
      revoke,
    );
    const track = await createMusicTrack(new File(["audio"], "song.mp3"));
    controller.load(track);
    expect(audio.src).toBe("blob:local-track");
    expect(audio.load).toHaveBeenCalled();
    await controller.play();
    expect(onPlayingChange).toHaveBeenCalledWith(true);
    audio.currentTime = 12;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(onTimeChange).toHaveBeenCalledWith(12, 90);
    audio.dispatchEvent(new Event("loadedmetadata"));
    expect(onMetadata).toHaveBeenCalledWith(90);
    audio.dispatchEvent(new Event("ended"));
    expect(onEnded).toHaveBeenCalledOnce();
    controller.setVolume(2);
    expect(audio.volume).toBe(1);
    controller.seek(500);
    expect(audio.currentTime).toBe(90);
    controller.dispose();
    expect(revoke).toHaveBeenCalledWith("blob:local-track");
    audio.dispatchEvent(new Event("ended"));
    expect(onEnded).toHaveBeenCalledOnce();
  });
});
