import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, i18nReady } from "../i18n";
import { db } from "../data/db";
import { FallingSandLab } from "./FallingSandLab";

function createContext() {
  return {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData: vi.fn(),
  };
}

describe("Falling Sand Lab", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    await db.arcadeData.where("id").startsWith("falling-sand:scene:").delete();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => (
      contextId === "2d" ? createContext() as unknown as CanvasRenderingContext2D : null
    ));
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    });
  });

  afterEach(async () => {
    cleanup();
    await db.arcadeData.where("id").startsWith("falling-sand:scene:").delete();
    Reflect.deleteProperty(document, "hidden");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws with pointer input, supports touch pointers, brush size, pause, and reset", async () => {
    const user = userEvent.setup();
    render(<FallingSandLab />);
    const canvas = await screen.findByRole("img", { name: "Falling Sand Lab simulation" });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 240,
      width: 400,
      height: 240,
      toJSON: () => ({}),
    });

    await user.click(screen.getByRole("button", { name: "Water" }));
    expect(screen.getByRole("button", { name: "Water" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("slider", { name: "Brush size" }), { target: { value: "1" } });
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "mouse", button: 0 });
    expect(screen.getByText("1 particles")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Brush size" }), { target: { value: "7" } });
    expect(screen.getByRole("slider", { name: "Brush size" })).toHaveValue("7");
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: "touch", button: 0, clientX: 200, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: "touch", button: 0 });
    expect(Number(screen.getByText(/\d+ particles/).textContent?.split(" ")[0])).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("0 particles")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("reports an unavailable drawing context instead of failing silently", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    render(<FallingSandLab />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The simulation canvas is unavailable");
  });

  it("keeps retired salt and steam out of the material palette", async () => {
    render(<FallingSandLab />);
    expect(await screen.findByRole("group", { name: "Materials" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Steam" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Water" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Charge" })).toBeInTheDocument();
  });

  it("loads presets and samples, erases, and temperature-paints the world", async () => {
    const user = userEvent.setup();
    render(<FallingSandLab />);
    const canvas = await screen.findByRole("img", { name: "Falling Sand Lab simulation" });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 240, width: 400, height: 240, toJSON: () => ({}),
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Starting scene" }), "frozen");
    await user.click(screen.getByRole("button", { name: "Load scene" }));
    expect(Number(screen.getByText(/\d+ particles/).textContent?.split(" ")[0])).toBeGreaterThan(0);
    expect(screen.getByRole("slider", { name: "Wind" })).toHaveValue("-1");

    await user.click(screen.getByRole("button", { name: "Pick material" }));
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 210 });
    expect(document.querySelector(".falling-sand-lab__feedback")).toHaveTextContent(/Picked up/);
    await user.click(screen.getByRole("button", { name: "Heat brush" }));
    expect(screen.getByRole("slider", { name: "Brush temperature" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Brush temperature" }), { target: { value: "100" } });
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 200, clientY: 220 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: "mouse", button: 0 });

    await user.click(screen.getByRole("button", { name: "Erase" }));
    fireEvent.pointerDown(canvas, { pointerId: 3, pointerType: "mouse", button: 0, clientX: 200, clientY: 220 });
    fireEvent.pointerUp(canvas, { pointerId: 3, pointerType: "mouse", button: 0 });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.querySelector(".falling-sand-lab__count")).toHaveTextContent("0 particles");
    expect(screen.getByRole("slider", { name: "Wind" })).toHaveValue("0");
  });

  it("saves, restores, and deletes local scenes", async () => {
    const user = userEvent.setup();
    render(<FallingSandLab />);
    const canvas = await screen.findByRole("img", { name: "Falling Sand Lab simulation" });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 240, width: 400, height: 240, toJSON: () => ({}),
    });
    await user.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.change(screen.getByRole("slider", { name: "Brush size" }), { target: { value: "1" } });
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "mouse", button: 0 });
    await user.type(screen.getByRole("textbox", { name: "Scene name" }), "Tiny world");
    await user.click(screen.getByRole("button", { name: "Save scene" }));
    expect(await screen.findByText("Saved “Tiny world”.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.querySelector(".falling-sand-lab__count")).toHaveTextContent("0 particles");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Saved scenes" }),
      screen.getByRole("option", { name: "Tiny world" }),
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("Opened “Tiny world”.")).toBeInTheDocument();
    expect(document.querySelector(".falling-sand-lab__count")).toHaveTextContent("1 particles");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Scene deleted.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("option", { name: "Tiny world" })).not.toBeInTheDocument());
  });

  it("stops animation while the document is hidden and resumes when visible", () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(11);
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(<FallingSandLab />);
    expect(requestFrame).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(cancelFrame).toHaveBeenCalledWith(11);
    expect(requestFrame).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    fireEvent(document, new Event("visibilitychange"));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancelFrame).toHaveBeenCalledTimes(3);
    expect(cancelFrame).toHaveBeenLastCalledWith(11);
  });
});
