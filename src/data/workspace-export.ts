import type { LocalFile, SchoolDocumentContent, SchoolNote, WorkspaceState } from "./db";

export interface WorkspaceExportRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkspaceExportColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
}

export interface WorkspacePngOptions {
  state: WorkspaceState;
  colors: WorkspaceExportColors;
  files: ReadonlyMap<string, LocalFile>;
  notes: ReadonlyMap<string, SchoolNote>;
  documents: ReadonlyMap<string, { title: string; content?: SchoolDocumentContent }>;
  transparent?: boolean;
  region?: WorkspaceExportRegion;
}

const EXPORT_PADDING = 48;
const MAX_CANVAS_DIMENSION = 8192;
const MAX_CANVAS_PIXELS = 16_000_000;

export function getWorkspaceExportRegion(
  state: WorkspaceState,
  selected?: WorkspaceExportRegion,
): WorkspaceExportRegion {
  if (selected) {
    if (![selected.x, selected.y, selected.width, selected.height].every(Number.isFinite) ||
      selected.width <= 0 || selected.height <= 0) {
      throw new Error("Select a valid workspace region to export.");
    }
    return selected;
  }
  if (!state.elements.length) {
    return {
      x: -state.viewport.x / state.viewport.zoom,
      y: -state.viewport.y / state.viewport.zoom,
      width: 1366 / state.viewport.zoom,
      height: 768 / state.viewport.zoom,
    };
  }
  const minX = Math.min(...state.elements.map((element) => element.x));
  const minY = Math.min(...state.elements.map((element) => element.y));
  const maxX = Math.max(...state.elements.map((element) => element.x + element.width));
  const maxY = Math.max(...state.elements.map((element) => element.y + element.height));
  return {
    x: minX - EXPORT_PADDING,
    y: minY - EXPORT_PADDING,
    width: maxX - minX + EXPORT_PADDING * 2,
    height: maxY - minY + EXPORT_PADDING * 2,
  };
}

export function getWorkspacePngDimensions(region: WorkspaceExportRegion): { width: number; height: number; scale: number } {
  if (![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
    region.width <= 0 || region.height <= 0) {
    throw new Error("Select a valid workspace region to export.");
  }
  const scale = Math.min(
    1,
    MAX_CANVAS_DIMENSION / region.width,
    MAX_CANVAS_DIMENSION / region.height,
    Math.sqrt(MAX_CANVAS_PIXELS / (region.width * region.height)),
  );
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("The selected Workspace region is too large to export.");
  return {
    width: Math.max(1, Math.floor(region.width * scale)),
    height: Math.max(1, Math.floor(region.height * scale)),
    scale,
  };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  let lineCount = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lineCount += 1;
      y += lineHeight;
      if (lineCount >= maxLines) return;
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        context.fillText(line, x, y, maxWidth);
        lineCount += 1;
        if (lineCount >= maxLines) return;
        y += lineHeight;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      context.fillText(line, x, y, maxWidth);
      lineCount += 1;
      if (lineCount >= maxLines) return;
      y += lineHeight;
    }
  }
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot decode an image for Workspace export.");
  }
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error("A Workspace image could not be decoded for PNG export.");
  }
}

function renderWorkspace(
  context: CanvasRenderingContext2D,
  options: WorkspacePngOptions,
  region: WorkspaceExportRegion,
  scale: number,
): Promise<void> {
  const { state, colors } = options;
  context.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
  if (!options.transparent) {
    context.fillStyle = colors.background;
    context.fillRect(region.x, region.y, region.width, region.height);
    context.fillStyle = colors.muted;
    context.globalAlpha = 0.28;
    const gridStep = 24 * Math.max(1, Math.ceil(8 / (24 * scale)));
    for (let x = Math.ceil(region.x / gridStep) * gridStep; x < region.x + region.width; x += gridStep) {
      for (let y = Math.ceil(region.y / gridStep) * gridStep; y < region.y + region.height; y += gridStep) {
        context.beginPath();
        context.arc(x, y, 0.8, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
  }

  const elements = new Map(state.elements.map((element) => [element.id, element]));
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = colors.accent;
  context.globalAlpha = 0.62;
  for (const connection of state.connections) {
    const from = elements.get(connection.fromId);
    const to = elements.get(connection.toId);
    if (!from || !to) continue;
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endX = to.x + to.width / 2;
    const endY = to.y + to.height / 2;
    const bend = Math.max(50, Math.abs(endX - startX) * 0.42);
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(startX + bend, startY, endX - bend, endY, endX, endY);
    context.stroke();
  }
  context.restore();

  return (async () => {
    for (const element of state.elements) {
      if (element.x + element.width < region.x || element.x > region.x + region.width ||
        element.y + element.height < region.y || element.y > region.y + region.height) continue;
      context.save();
      roundedRect(context, element.x, element.y, element.width, element.height, 8);
      context.shadowColor = "rgb(0 0 0 / 18%)";
      context.shadowBlur = 24;
      context.shadowOffsetY = 9;
      context.fillStyle = colors.surface;
      context.fill();
      context.shadowColor = "transparent";
      context.lineWidth = 1;
      context.strokeStyle = element.borderColor;
      context.globalAlpha = 0.82;
      context.stroke();
      context.globalAlpha = 1;
      context.save();
      roundedRect(context, element.x, element.y, element.width, element.height, 8);
      context.clip();

      const headerHeight = 36;
      context.fillStyle = colors.line;
      context.globalAlpha = 0.7;
      context.fillRect(element.x, element.y + headerHeight, element.width, 1);
      context.globalAlpha = 1;
      context.fillStyle = colors.text;
      context.font = "600 12px system-ui, sans-serif";
      context.textBaseline = "middle";
      context.fillText(element.title, element.x + 12, element.y + headerHeight / 2, element.width - 24);

      const bodyX = element.x + 12;
      const bodyY = element.y + headerHeight + 13;
      const bodyWidth = element.width - 24;
      const bodyHeight = element.height - headerHeight - 22;
      if (element.kind === "text") {
        context.fillStyle = colors.text;
        context.font = `${element.fontSize ?? 12}px system-ui, sans-serif`;
        context.textBaseline = "top";
        drawWrappedText(context, element.content, bodyX, bodyY, bodyWidth, (element.fontSize ?? 12) * 1.6, Math.floor(bodyHeight / ((element.fontSize ?? 12) * 1.6)));
      } else if (element.kind === "note") {
        const note = element.noteId ? options.notes.get(element.noteId) : undefined;
        context.fillStyle = colors.text;
        context.font = `${element.fontSize ?? 12}px system-ui, sans-serif`;
        context.textBaseline = "top";
        drawWrappedText(context, note?.content ?? element.content, bodyX, bodyY, bodyWidth, (element.fontSize ?? 12) * 1.6, Math.floor(bodyHeight / ((element.fontSize ?? 12) * 1.6)));
      } else if (element.kind === "document") {
        const document = element.documentId ? options.documents.get(element.documentId) : undefined;
        const preview = document?.content?.plainText ?? "";
        context.fillStyle = document ? colors.muted : "#d37567";
        context.font = "11px system-ui, sans-serif";
        context.textBaseline = "top";
        drawWrappedText(context, preview || (document ? "No document text" : "Document unavailable"), bodyX, bodyY, bodyWidth, 16, Math.floor(bodyHeight / 16));
      } else if (element.kind === "image" || element.kind === "file") {
        const file = element.fileId ? options.files.get(element.fileId) : undefined;
        if (element.kind === "image" && file) {
          const bitmap = await decodeImage(file.blob);
          const ratio = Math.min(bodyWidth / bitmap.width, bodyHeight / bitmap.height);
          const width = bitmap.width * ratio;
          const height = bitmap.height * ratio;
          context.drawImage(bitmap, bodyX + (bodyWidth - width) / 2, bodyY + (bodyHeight - height) / 2, width, height);
          bitmap.close();
        } else {
          context.fillStyle = colors.muted;
          context.font = "11px system-ui, sans-serif";
          context.textBaseline = "top";
          drawWrappedText(context, file ? `${file.type}\n${file.name}` : "File unavailable", bodyX, bodyY, bodyWidth, 16, Math.floor(bodyHeight / 16));
        }
      }
      context.restore();
      context.restore();
    }
  })();
}

export async function exportWorkspacePng(options: WorkspacePngOptions): Promise<Blob> {
  const region = getWorkspaceExportRegion(options.state, options.region);
  const dimensions = getWorkspacePngDimensions(region);
  const canvas = window.document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A canvas could not be created for Workspace PNG export.");
  await renderWorkspace(context, options, region, dimensions.scale);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The Workspace PNG could not be generated."));
    }, "image/png");
  });
}
