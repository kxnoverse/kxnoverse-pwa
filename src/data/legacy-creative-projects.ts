import type {
  CreativeLogoLayer,
  CreativeLogoProject,
  CreativeProject,
  IconTool,
  LogoFontFamily,
  LogoShape,
  PaletteHarmony,
} from "./db";

const PALETTE_HARMONIES: PaletteHarmony[] = [
  "complementary", "analogous", "triadic", "monochromatic", "split-complementary", "tetradic",
];
const ICON_SIZES = [8, 16, 24, 32, 48, 64] as const;
const ICON_TOOLS: IconTool[] = ["draw", "erase", "line", "rectangle", "ellipse"];
const LOGO_SHAPES: LogoShape[] = ["rectangle", "ellipse", "triangle", "line"];
const LOGO_FONTS: LogoFontFamily[] = ["sans", "serif", "mono"];
const LOGO_CANVAS_MIN = 64;
const LOGO_CANVAS_MAX = 1200;
const LOGO_MAX_LAYERS = 32;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isLogoLayer(value: unknown): value is CreativeLogoLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as Record<string, unknown>;
  if (typeof layer.id !== "string" || layer.id.length === 0 || layer.id.length > 100 ||
    !isBoundedNumber(layer.x, -LOGO_CANVAS_MAX, LOGO_CANVAS_MAX * 2) ||
    !isBoundedNumber(layer.y, -LOGO_CANVAS_MAX, LOGO_CANVAS_MAX * 2) ||
    !isBoundedNumber(layer.width, 1, LOGO_CANVAS_MAX) ||
    !isBoundedNumber(layer.height, 1, LOGO_CANVAS_MAX) ||
    !isBoundedNumber(layer.rotation, -360, 360) ||
    !isHexColor(layer.color) || typeof layer.visible !== "boolean") return false;
  if (layer.kind === "text") {
    return typeof layer.text === "string" && layer.text.length <= 160 &&
      LOGO_FONTS.includes(layer.fontFamily as LogoFontFamily) &&
      isBoundedNumber(layer.fontSize, 8, 256) &&
      [400, 600, 700].includes(Number(layer.fontWeight)) &&
      ["left", "center", "right"].includes(String(layer.align)) &&
      isBoundedNumber(layer.letterSpacing, -8, 40);
  }
  if (layer.kind === "shape") return LOGO_SHAPES.includes(layer.shape as LogoShape);
  if (layer.kind !== "icon") return false;
  return typeof layer.iconName === "string" && layer.iconName.length <= 80 &&
    typeof layer.iconWidth === "number" && ICON_SIZES.includes(layer.iconWidth as (typeof ICON_SIZES)[number]) &&
    typeof layer.iconHeight === "number" && ICON_SIZES.includes(layer.iconHeight as (typeof ICON_SIZES)[number]) &&
    Array.isArray(layer.pixels) && layer.pixels.length === layer.iconWidth * layer.iconHeight &&
    layer.pixels.every((pixel) => pixel === null || isHexColor(pixel));
}

function isLogoProject(value: unknown): value is CreativeLogoProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return project.kind === "logo" &&
    typeof project.id === "string" && project.id.length > 0 && project.id.length <= 100 &&
    typeof project.name === "string" && project.name.trim().length > 0 && project.name.length <= 80 &&
    isBoundedNumber(project.width, LOGO_CANVAS_MIN, LOGO_CANVAS_MAX) && Number.isInteger(project.width) &&
    isBoundedNumber(project.height, LOGO_CANVAS_MIN, LOGO_CANVAS_MAX) && Number.isInteger(project.height) &&
    Array.isArray(project.layers) && project.layers.length <= LOGO_MAX_LAYERS &&
    project.layers.every(isLogoLayer) &&
    new Set(project.layers.map((layer) => (layer as { id: string }).id)).size === project.layers.length &&
    typeof project.updatedAt === "number" && Number.isFinite(project.updatedAt);
}

function isPaletteProject(project: Record<string, unknown>): boolean {
  return typeof project.id === "string" && project.id.length > 0 && project.id.length <= 100 &&
    typeof project.name === "string" && project.name.trim().length > 0 && project.name.length <= 80 &&
    PALETTE_HARMONIES.includes(project.harmony as PaletteHarmony) &&
    isHexColor(project.baseColor) &&
    Array.isArray(project.colors) && project.colors.length >= 2 && project.colors.length <= 10 &&
    project.colors.every(isHexColor);
}

function isIconProject(project: Record<string, unknown>): boolean {
  const width = project.width;
  const height = project.height;
  return typeof project.id === "string" && project.id.length > 0 && project.id.length <= 100 &&
    typeof project.name === "string" && project.name.trim().length > 0 && project.name.length <= 80 &&
    typeof width === "number" && ICON_SIZES.includes(width as (typeof ICON_SIZES)[number]) &&
    typeof height === "number" && ICON_SIZES.includes(height as (typeof ICON_SIZES)[number]) &&
    Array.isArray(project.pixels) && project.pixels.length === width * height &&
    project.pixels.every((pixel) => pixel === null || isHexColor(pixel)) &&
    isHexColor(project.color) && ICON_TOOLS.includes(project.tool as IconTool);
}

function isPixelProject(project: Record<string, unknown>): boolean {
  const width = project.width;
  const height = project.height;
  return project.id === "pixel-pattern-designer" &&
    typeof width === "number" && Number.isInteger(width) && width >= 8 && width <= 64 &&
    typeof height === "number" && Number.isInteger(height) && height >= 8 && height <= 64 &&
    Array.isArray(project.pixels) && project.pixels.length === width * height &&
    project.pixels.every((pixel) => pixel === null || isHexColor(pixel)) &&
    isHexColor(project.color) &&
    (project.tool === "draw" || project.tool === "erase" || project.tool === "fill") &&
    typeof project.zoom === "number" && Number.isInteger(project.zoom) && project.zoom >= 8 && project.zoom <= 32;
}

export function isLegacyCreativeProject(value: unknown): value is CreativeProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  if (typeof project.kind !== "string" ||
    typeof project.updatedAt !== "number" || !Number.isFinite(project.updatedAt)) return false;
  if (project.kind === "palette") return isPaletteProject(project);
  if (project.kind === "icon") return isIconProject(project);
  if (project.kind === "logo") return isLogoProject(value);
  if (project.kind === "pixel") return isPixelProject(project);
  return false;
}
