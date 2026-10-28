import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKSPACE, connectWorkspaceElements } from "./workspace";
import { exportWorkspacePng, getWorkspaceExportRegion, getWorkspacePngDimensions } from "./workspace-export";

afterEach(() => vi.restoreAllMocks());

describe("Workspace PNG export", () => {
  const first = {
    id: "first",
    kind: "text" as const,
    x: -120,
    y: 40,
    width: 280,
    height: 200,
    borderColor: "#4b8fa8",
    title: "Study plan",
    content: "Review chapter two",
  };
  const second = { ...first, id: "second", x: 360, title: "Next steps", content: "Finish the notes" };
  const state = {
    ...DEFAULT_WORKSPACE,
    elements: [first, second],
    connections: connectWorkspaceElements([], first.id, second.id),
  };

  it("measures the complete workspace and keeps export dimensions within safe canvas limits", () => {
    const region = getWorkspaceExportRegion(state);
    expect(region).toEqual({ x: -168, y: -8, width: 856, height: 296 });
    expect(getWorkspacePngDimensions({ x: 0, y: 0, width: 100_000, height: 50_000 })).toMatchObject({
      width: 5656,
      height: 2828,
    });
    expect(() => getWorkspacePngDimensions({ x: 0, y: 0, width: 0, height: 10 })).toThrow("valid workspace region");
  });

  it("renders card text and SVG-style connections into a PNG blob", async () => {
    const drawnText: string[] = [];
    const context = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      moveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      stroke: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fillText: vi.fn((text: string) => drawnText.push(text)),
      measureText: vi.fn((text: string) => ({ width: text.length * 5 })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    const blob = await exportWorkspacePng({
      state,
      colors: {
        background: "#10161b",
        surface: "#192229",
        text: "#e8edf0",
        muted: "#89949a",
        line: "#354047",
        accent: "#8dbfd0",
      },
      files: new Map(),
      notes: new Map(),
      documents: new Map(),
    });

    expect(blob.type).toBe("image/png");
    expect(drawnText).toEqual(expect.arrayContaining(["Study plan", "Review chapter two", "Next steps", "Finish the notes"]));
    expect(context.bezierCurveTo).toHaveBeenCalledOnce();
  });
});
