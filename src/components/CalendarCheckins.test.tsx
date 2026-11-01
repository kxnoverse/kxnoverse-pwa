import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CalendarCheckins } from "./CalendarCheckins";
import { db } from "../data/db";
import { i18nReady, i18n } from "../i18n";

describe("CalendarCheckins", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await db.delete();
  });

  it("saves a daily check-in and exposes its sleep level in the year view", async () => {
    const user = userEvent.setup();
    render(<CalendarCheckins onSelectDate={() => undefined} selectedDate="2026-10-31" />);

    await user.type(screen.getByLabelText("How many hours did you sleep?"), "7.5");
    await user.click(screen.getByRole("radio", { name: "Good" }));
    await user.type(screen.getByLabelText("What do you have planned today?"), "Finish a project");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(async () => {
      expect(await db.dailyCheckins.get("2026-10-31")).toMatchObject({
        date: "2026-10-31",
        sleepHours: 7.5,
        mood: 4,
        plans: "Finish a project",
      });
    });
    expect(await screen.findByText("Check-in saved on this device.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /October 31, 2026.*7.5 hours of sleep, Good/ })).toBeInTheDocument();
    expect(screen.getByText("1 day logged")).toBeInTheDocument();
  });

  it("creates and reuses a custom feeling in daily check-ins", async () => {
    const user = userEvent.setup();
    const view = render(<CalendarCheckins onSelectDate={() => undefined} selectedDate="2026-10-31" />);

    await user.type(screen.getByRole("textbox", { name: "Custom feeling" }), "Curious");
    await user.click(screen.getByRole("button", { name: "Add feeling" }));
    const customFeeling = await screen.findByRole("radio", { name: "Curious" });
    expect(customFeeling).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(async () => {
      expect(await db.dailyCheckins.get("2026-10-31")).toMatchObject({
        mood: null,
        customMoodId: expect.any(String),
      });
    });
    expect(await screen.findByRole("button", { name: /October 31, 2026.*✨ Curious/ })).toBeInTheDocument();

    view.unmount();
    render(<CalendarCheckins onSelectDate={() => undefined} selectedDate="2026-10-31" />);
    expect(await screen.findByRole("radio", { name: "Curious" })).toBeChecked();
  });

  it("loads the selected day's saved answers when switching days", async () => {
    await db.dailyCheckins.put({
      id: "2026-10-30",
      date: "2026-10-30",
      sleepHours: 6,
      mood: 3,
      plans: "Read",
      updatedAt: 123,
    });
    const onSelectDate = (date: string) => {
      act(() => {
        view.rerender(<CalendarCheckins onSelectDate={onSelectDate} selectedDate={date} />);
      });
    };
    const view = render(<CalendarCheckins onSelectDate={onSelectDate} selectedDate="2026-10-31" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: /October 30, 2026.*6 hours of sleep, Okay/ }));

    expect(screen.getByLabelText("How many hours did you sleep?")).toHaveValue(6);
    expect(screen.getByRole("radio", { name: "Okay" })).toBeChecked();
    expect(screen.getByLabelText("What do you have planned today?")).toHaveValue("Read");
  });

  it("keeps the form from writing empty check-ins", async () => {
    render(<CalendarCheckins onSelectDate={() => undefined} selectedDate="2026-10-31" />);
    fireEvent.submit(screen.getByRole("button", { name: "Save check-in" }).closest("form")!);
    expect(await screen.findByText("Fill in at least one field before saving.")).toBeInTheDocument();
    expect(await db.dailyCheckins.count()).toBe(0);
  });
});
