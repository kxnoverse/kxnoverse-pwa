import "fake-indexeddb/auto";
/// <reference types="node" />
import { Blob as NodeBlob } from "node:buffer";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { db } from "./data/db";
import { i18n } from "./i18n";
import { defaultAppearance, useUiStore } from "./stores/ui-store";
import { readBlobAsArrayBuffer } from "./data/blob-utils";

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  await Promise.all([
    db.subjects.clear(),
    db.teachers.clear(),
    db.timetable.clear(),
    db.exceptions.clear(),
    db.settings.clear(),
    db.aiPresets.clear(),
    db.aiConversations.clear(),
    db.aiMessages.clear(),
    db.aiAttachments.clear(),
    db.tasks.clear(),
    db.calendarEvents.clear(),
    db.notes.clear(),
    db.focusSessions.clear(),
    db.files.clear(),
  ]);
  useUiStore.getState().updateAppearance(defaultAppearance);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kxno Desk shell", () => {
  it("renders the local schedule dashboard and opens the timetable", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("link", { name: "Kxno Desk" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Good (morning|afternoon|evening|Working late)$/ })).toBeInTheDocument();
    expect(screen.getByRole("time")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today’s schedule" })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole(
        "link",
        { name: "Timetable" },
      ),
    );
    expect(screen.getByRole("heading", { name: "Timetable" })).toBeInTheDocument();
  });

  it("adds a subject and a lesson to the editable timetable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    await user.click(screen.getByRole("button", { name: "Manage" }));

    await user.type(screen.getAllByRole("textbox", { name: "Name" })[0], "Algebra");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    const subject = await db.subjects.toCollection().first();
    expect(subject?.name).toBe("Algebra");

    await user.type(screen.getAllByRole("textbox", { name: "Name" })[1], "Ms Local");
    await user.click(screen.getByRole("checkbox", { name: "Algebra" }));
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    const teacher = await db.teachers.toCollection().first();
    expect(teacher).toMatchObject({ name: "Ms Local", subjectIds: [subject!.id] });
    await db.subjects.update(subject!.id, { defaultTeacherId: teacher!.id, defaultRoom: "B204" });

    await user.click(screen.getAllByRole("button", { name: "Add lesson" })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), subject!.id);
    expect(screen.getByRole("combobox", { name: "Teacher" })).toHaveValue(teacher!.id);
    expect(screen.getByRole("textbox", { name: "Room" })).toHaveValue("B204");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await db.timetable.count()).toBe(1);
    expect(await db.timetable.toCollection().first()).toMatchObject({
      weekday: 0,
      subjectId: subject!.id,
      start: "09:00",
      end: "09:45",
      weekType: "all",
      inheritTeacher: true,
      inheritRoom: true,
      inheritColor: true,
    });
    expect(screen.getAllByText("Algebra").length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "Duplicate Algebra" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "10:45" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await db.timetable.count()).toBe(2);

    await user.click(screen.getByRole("button", { name: "Delete Ms Local" }));
    expect(screen.getByText("This teacher is assigned to a subject or lesson. Remove those assignments first.")).toBeInTheDocument();
    expect(await db.teachers.get(teacher!.id)).toBeDefined();
  });

  it("switches language immediately and applies theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "de");
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stundenplan" })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Modus" }), "light");
    expect(document.querySelector(".app-frame")).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");

    await user.selectOptions(screen.getByRole("combobox", { name: "Hintergrundstil" }), "grid");
    expect(document.querySelector(".background-layer--grid")).toBeInTheDocument();
  });

  it("persists settings and school records locally", async () => {
    useUiStore.getState().setAppearance("accent", "#347ab4");
    await db.subjects.put({ id: "persisted-subject", name: "Local subject", color: "#228855" });

    expect(JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.appearance.accent).toBe("#347ab4");
    expect(await db.subjects.get("persisted-subject")).toMatchObject({ name: "Local subject" });
  });

  it("saves a local profile, applies a theme, and enables a weekend school day", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Ari");
    await user.click(screen.getByRole("button", { name: /Arctic/ }));
    await user.click(screen.getByRole("checkbox", { name: "Saturday" }));
    expect((await db.settings.get("profileName"))?.value).toBe("Ari");
    expect((await db.settings.get("selectedTheme"))?.value).toBe("arctic");
    expect(JSON.parse((await db.settings.get("schoolDays"))!.value)[5]).toBe(true);

    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(await screen.findByRole("heading", { name: /^Good (morning|afternoon|evening), Ari$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    expect(await screen.findByText("Sat")).toBeInTheDocument();
  });

  it("keeps assistant messages local and clearly reports the unconfigured backend", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "AI Assistant" }));
    await screen.findByRole("combobox", { name: "Preset" });
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Explain fractions");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/AI is not connected/)).toBeInTheDocument();
    const savedMessages = await db.aiMessages.toArray();
    expect(savedMessages).toHaveLength(2);
    expect(savedMessages.find((message) => message.role === "user")?.content).toBe("Explain fractions");
  });

  it("preserves saved assistant presets while loading the assistant", async () => {
    const savedPreset = {
      id: "study-assistant",
      name: "My saved tutor",
      assistantName: "Tutor",
      description: "My custom instructions",
      style: "Concise",
      length: "short" as const,
      depth: "basic" as const,
      language: "en" as const,
      instructions: "Keep my existing setup.",
      model: "my-configured-model",
      isDefault: true,
    };
    await db.aiPresets.put(savedPreset);

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "AI Assistant" }));
    await screen.findByRole("combobox", { name: "Preset" });

    expect(await db.aiPresets.get(savedPreset.id)).toEqual(savedPreset);
    expect(await db.aiPresets.count()).toBe(1);
  });

  it("requires per-message consent before enabling a cloud AI request", async () => {
    await db.settings.bulkPut([
      { key: "aiBackendUrl", value: "https://worker.example.test" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "turnstileSiteKey", value: "0x4AAAAAAAtestsitekey" },
    ]);
    vi.stubGlobal("turnstile", {
      render: (_container: HTMLElement, options: { callback: (token: string) => void }) => {
        options.callback("test-turnstile-token");
        return "test-widget";
      },
      remove: () => undefined,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "AI Assistant" }));

    const message = await screen.findByRole("textbox", { name: "Message" });
    const consent = await screen.findByRole("checkbox", { name: /Google Gemini/ });
    const send = screen.getByRole("button", { name: "Send" });
    await user.type(message, "Explain fractions");

    expect(send).toBeDisabled();
    await user.click(consent);
    await waitFor(() => expect(send).toBeEnabled());
    expect(await db.aiMessages.count()).toBe(0);
  });

  it("stores image attachments locally only after the user submits the message", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "AI Assistant" }));
    await screen.findByRole("combobox", { name: "Preset" });

    const image = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "diagram.png", { type: "image/png" });
    fireEvent.change(screen.getAllByLabelText("Attach images or PDF")[0], { target: { files: [image] } });
    expect(await db.aiAttachments.count()).toBe(0);
    expect(screen.getByRole("button", { name: "Preview diagram.png" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Message" }), "Explain this");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(async () => expect(await db.aiAttachments.count()).toBe(1));
    const saved = await db.aiAttachments.toCollection().first();
    expect(saved).toMatchObject({ name: "diagram.png", mimeType: "image/png", size: 8 });
    expect([...new Uint8Array(await readBlobAsArrayBuffer(saved!.blob))]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(await screen.findByText(/AI is not connected/)).toBeInTheDocument();
  });

  it("creates and edits tasks, calendar events, and autosaved notes locally", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Tasks" }));
    await user.click(screen.getAllByRole("button", { name: "Add task" })[0]);
    await user.type(screen.getByRole("textbox", { name: "Task" }), "Finish worksheet");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Mark Finish worksheet complete" })).toBeInTheDocument();
    expect(await db.tasks.count()).toBe(1);

    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Calendar" }));
    await user.click(screen.getAllByRole("button", { name: "Add event" })[0]);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Biology exam");
    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "exam");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await db.calendarEvents.toCollection().first()).toMatchObject({ title: "Biology exam", type: "exam" });

    await user.click(screen.getByRole("link", { name: "Notes" }));
    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
    fireEvent.change(await screen.findByRole("textbox", { name: "Note title" }), { target: { value: "Cell structure" } });
    await user.type(screen.getByRole("textbox", { name: "Note content" }), "Mitochondria produce energy.");
    fireEvent.blur(screen.getByRole("textbox", { name: "Note content" }));
    await waitFor(async () => {
      const saved = await db.notes.toCollection().first();
      expect(saved).toMatchObject({ title: "Cell structure", content: "Mitochondria produce energy." });
    });
  });

  it("records focus sessions and stores imported files on this device", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Focus" }));
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1100));
    await user.click(screen.getByRole("button", { name: "Stop session" }));
    await waitFor(async () => expect(await db.focusSessions.count()).toBe(1));
    expect(await db.focusSessions.toCollection().first()).toMatchObject({ kind: "focus", completed: false });

    await user.click(screen.getByRole("link", { name: "Files" }));
    const file = new File(["local reference"], "reference.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Add files"), { target: { files: [file] } });
    await waitFor(async () => expect(await db.files.count()).toBe(1));
    expect(await db.files.toCollection().first()).toMatchObject({ name: "reference.txt", size: file.size });
  });
});
