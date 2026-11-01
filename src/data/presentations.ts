import { strFromU8, strToU8, unzip, zipSync } from "fflate";
import { createId, db, type PresentationElement, type PresentationProject, type PresentationShape, type PresentationSlide } from "./db";

export const PRESENTATION_WIDTH = 1000;
export const PRESENTATION_HEIGHT = 563;
export const PRESENTATION_TEMPLATES = [
  { id: "northstar", name: "Northstar", description: "Dark editorial, mint accents, bold data storytelling." },
  { id: "fieldnotes", name: "Fieldnotes", description: "Warm paper, expressive typography, considered layouts." },
  { id: "signal", name: "Signal", description: "Deep blue, electric color, crisp technical hierarchy." },
] as const;
export type PresentationTemplateId = (typeof PRESENTATION_TEMPLATES)[number]["id"];

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_SLIDES = 100;
const MAX_ELEMENTS_PER_SLIDE = 100;
const PPTX_WIDTH = 12_192_000;
const PPTX_HEIGHT = 6_858_000;
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg"] as const;

function color(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}

function makeElement(
  kind: PresentationElement["kind"],
  values: Omit<PresentationElement, "id" | "kind">,
): PresentationElement {
  return { id: createId(), kind, ...values };
}

function text(
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  textColor: string,
  bold = false,
  fontFamily = "Arial",
): PresentationElement {
  return makeElement("text", { text: content, x, y, width, height, fontSize, color: textColor, bold, fontFamily });
}

function shape(
  preset: PresentationShape,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  textValue?: string,
  textColor?: string,
  fontSize?: number,
  bold?: boolean,
): PresentationElement {
  return makeElement("shape", {
    x, y, width, height, shape: preset, fill, text: textValue,
    color: textColor ?? "#FFFFFF", fontSize: fontSize ?? 20, bold: bold ?? false,
  });
}

function slide(title: string, background: string, layout: string, elements: PresentationElement[]): PresentationSlide {
  return { id: createId(), title, background, layout, elements };
}

function northstarSlides(): PresentationSlide[] {
  const ink = "#101A28";
  const mint = "#B8F4D6";
  const white = "#F5F7F9";
  const muted = "#B2BDC9";
  return [
    slide("The next chapter", ink, "cover", [
      shape("rectangle", 694, 0, 306, 563, "#182A3A"),
      shape("rectangle", 694, 0, 8, 563, mint),
      text("FIELD GUIDE  /  2026", 74, 62, 440, 26, 13, mint, true),
      text("The next\nchapter", 74, 151, 565, 190, 62, white, true, "Georgia"),
      text("A clear direction for the work ahead.", 78, 365, 500, 48, 23, muted),
      text("STRATEGY  ·  RESEARCH  ·  ACTION", 78, 486, 520, 24, 12, white, true),
      shape("circle", 788, 126, 128, 128, mint),
      shape("circle", 829, 219, 84, 84, "#F2BB77"),
      text("01", 753, 407, 185, 90, 68, white, true, "Georgia"),
    ]),
    slide("A simple path, built to last", ink, "agenda", [
      text("THE APPROACH", 64, 48, 320, 24, 12, mint, true),
      text("A simple path,\nbuilt to last.", 64, 92, 475, 126, 40, white, true, "Georgia"),
      shape("rectangle", 64, 265, 872, 1, "#435365"),
      ...[
        ["01", "Understand the signal", "Listen closely before choosing a direction."],
        ["02", "Focus the effort", "Spend energy where it changes the outcome."],
        ["03", "Make progress visible", "Turn the plan into repeatable small steps."],
      ].flatMap(([number, heading, detail], index) => {
        const y = 294 + index * 78;
        return [
          text(number, 68, y, 56, 35, 18, mint, true),
          text(heading, 152, y, 315, 32, 20, white, true),
          text(detail, 487, y + 3, 425, 30, 15, muted),
        ];
      }),
    ]),
    slide("Make the important thing easier", "#F2F1EA", "insight", [
      text("THE OPPORTUNITY", 66, 54, 300, 22, 12, "#386B58", true),
      text("Small clarity.\nMeaningful momentum.", 66, 101, 560, 118, 38, "#182A27", true, "Georgia"),
      shape("rectangle", 680, 0, 320, 563, "#D7EBDD"),
      text("3×", 726, 116, 220, 111, 84, "#1B5641", true, "Georgia"),
      text("more room for the work that matters", 732, 248, 200, 78, 20, "#29463A", true),
      shape("rectangle", 66, 294, 520, 4, "#B8F4D6"),
      text("A focused system makes the next best step easier to see — and easier to take.", 66, 326, 530, 80, 20, "#3A4B44"),
      text("INSIGHT  /  DESIGN  /  DELIVERY", 66, 486, 430, 24, 12, "#386B58", true),
    ]),
    slide("Let's make it happen", ink, "closing", [
      shape("rectangle", 0, 0, 14, 563, mint),
      text("NEXT STEP", 76, 80, 340, 23, 12, mint, true),
      text("Let's make\nit happen.", 76, 144, 625, 154, 54, white, true, "Georgia"),
      text("One clear decision is enough to begin.", 80, 340, 580, 40, 21, muted),
      shape("rectangle", 80, 427, 228, 52, mint),
      text("START WITH THE WHY", 99, 444, 191, 24, 13, ink, true),
      text("THANK YOU", 790, 491, 146, 22, 12, white, true),
    ]),
  ];
}

function fieldnotesSlides(): PresentationSlide[] {
  const paper = "#F5F0E7";
  const ink = "#24251F";
  const rust = "#B94E37";
  const moss = "#66745D";
  return [
    slide("A study in small rituals", paper, "cover", [
      text("FIELD NOTES   —   VOL. 01", 68, 47, 430, 23, 12, rust, true),
      text("A study in\nsmall rituals", 68, 129, 610, 190, 56, ink, true, "Georgia"),
      text("How the details of an ordinary day shape the way we work.", 73, 354, 500, 56, 20, "#5C5C52"),
      shape("rectangle", 728, 0, 272, 563, "#E4D9C9"),
      shape("circle", 768, 77, 188, 188, rust),
      shape("circle", 815, 181, 111, 111, "#E8B36E"),
      text("OBSERVATIONS\n& IDEAS", 765, 365, 180, 62, 17, ink, true),
      text("MARCH  /  2026", 73, 486, 330, 23, 12, moss, true),
    ]),
    slide("The day has a rhythm", paper, "editorial", [
      text("01   /   THE PATTERN", 66, 46, 360, 22, 12, rust, true),
      text("The day has\na rhythm.", 66, 94, 477, 115, 39, ink, true, "Georgia"),
      text("A good routine does not fill every hour. It gives the important hours somewhere to land.", 68, 241, 391, 92, 19, "#5C5C52"),
      shape("rectangle", 573, 95, 2, 344, rust),
      text("MORNING", 614, 117, 230, 23, 12, moss, true),
      text("Notice what\nneeds attention.", 614, 153, 318, 64, 22, ink, true, "Georgia"),
      text("MIDDAY", 614, 256, 230, 23, 12, moss, true),
      text("Protect time\nfor deep work.", 614, 292, 318, 64, 22, ink, true, "Georgia"),
      text("EVENING", 614, 395, 230, 23, 12, moss, true),
      text("Leave room\nto reset.", 614, 430, 318, 60, 22, ink, true, "Georgia"),
    ]),
    slide("A little more of what matters", "#E9E1D2", "quote", [
      shape("rectangle", 0, 0, 337, 563, moss),
      text("A NOTE ON\nATTENTION", 61, 65, 225, 56, 14, paper, true),
      text("“", 65, 159, 100, 104, 100, "#E2B777", true, "Georgia"),
      text("Small, steady\nchoices make\nspace for the\nwork we value.", 390, 125, 530, 212, 43, ink, true, "Georgia"),
      shape("rectangle", 395, 382, 98, 4, rust),
      text("A practice worth keeping", 395, 411, 425, 30, 16, "#54574C", true),
      text("FIELD NOTES  /  03", 395, 486, 300, 20, 12, moss, true),
    ]),
    slide("A question to carry forward", paper, "closing", [
      text("TAKE THIS WITH YOU", 68, 63, 330, 23, 12, rust, true),
      text("What will you\nmake room for?", 68, 132, 714, 150, 51, ink, true, "Georgia"),
      text("Start with one small, intentional choice.", 73, 332, 580, 37, 20, "#5C5C52"),
      shape("rectangle", 73, 414, 852, 2, "#C6BDAF"),
      text("THANK YOU FOR READING", 73, 454, 390, 25, 13, moss, true),
    ]),
  ];
}

function signalSlides(): PresentationSlide[] {
  const navy = "#14223B";
  const bright = "#B7A2FF";
  const cyan = "#81DCE8";
  const white = "#F6F7FF";
  return [
    slide("Signals for a better system", navy, "cover", [
      shape("rectangle", 0, 0, 15, 563, bright),
      text("SYSTEMS  /  2026", 69, 58, 350, 22, 12, cyan, true),
      text("Signals for\na better system", 69, 137, 620, 160, 51, white, true),
      text("A practical framework for making complexity feel clear.", 73, 333, 540, 52, 20, "#CAD4E4"),
      shape("rectangle", 754, 76, 174, 174, "#253858"),
      shape("circle", 797, 119, 89, 89, bright),
      shape("rectangle", 754, 282, 174, 14, cyan),
      shape("rectangle", 754, 312, 124, 14, "#637B9A"),
      shape("rectangle", 754, 342, 150, 14, "#637B9A"),
      text("THINK  /  BUILD  /  LEARN", 73, 492, 432, 22, 12, cyan, true),
    ]),
    slide("Three signals to watch", navy, "cards", [
      text("THE FRAMEWORK", 65, 47, 320, 22, 12, cyan, true),
      text("Three signals\nto watch.", 65, 91, 455, 106, 39, white, true),
      ...[
        ["01", "Clarity", "Can someone name the next step?", bright],
        ["02", "Friction", "Where does good intent get stuck?", cyan],
        ["03", "Momentum", "What small win builds confidence?", "#F2B47C"],
      ].flatMap(([number, heading, detail, accent], index) => {
        const x = 65 + index * 298;
        return [
          shape("rectangle", x, 246, 264, 236, "#1F304C"),
          shape("rectangle", x, 246, 264, 7, String(accent)),
          text(String(number), x + 20, 272, 58, 32, 16, String(accent), true),
          text(String(heading), x + 20, 323, 224, 36, 24, white, true),
          text(String(detail), x + 20, 374, 222, 68, 16, "#C5D0DF"),
        ];
      }),
    ]),
    slide("Make the signal visible", "#EEF1F7", "data", [
      text("THE SIGNAL", 62, 45, 320, 22, 12, "#5264A9", true),
      text("Make progress\nvisible.", 62, 90, 420, 108, 40, navy, true),
      shape("rectangle", 568, 83, 360, 402, "#FFFFFF"),
      text("WEEKLY MOMENTUM", 600, 112, 290, 21, 12, "#5D6A7E", true),
      ...[88, 52, 72, 39].map((height, index) => shape(
        "rectangle", 610 + index * 68, 403 - height * 2.3, 34, height * 2.3,
        index === 3 ? "#B7A2FF" : "#B9D2E4",
      )),
      text("W1", 609, 422, 36, 20, 11, "#5D6A7E", true),
      text("W2", 677, 422, 36, 20, 11, "#5D6A7E", true),
      text("W3", 745, 422, 36, 20, 11, "#5D6A7E", true),
      text("W4", 813, 422, 36, 20, 11, "#5D6A7E", true),
      text("Progress is easier to improve when the next step is easy to see.", 62, 264, 440, 86, 20, "#46536A"),
      text("EXAMPLE DATA  /  EDIT THESE ELEMENTS", 62, 472, 420, 18, 11, "#5264A9", true),
    ]),
    slide("Build. Learn. Repeat.", navy, "closing", [
      shape("circle", 680, 84, 204, 204, "#253858"),
      shape("circle", 736, 140, 92, 92, bright),
      text("THE NEXT MOVE", 64, 80, 340, 22, 12, cyan, true),
      text("Build.\nLearn.\nRepeat.", 64, 130, 535, 216, 52, white, true),
      text("Keep the feedback loop close.", 68, 389, 464, 36, 19, "#CAD4E4"),
      text("QUESTIONS  /  DISCUSSION", 68, 491, 410, 22, 12, cyan, true),
    ]),
  ];
}

export function createPresentationProject(templateId: PresentationTemplateId = "northstar"): PresentationProject {
  const template = PRESENTATION_TEMPLATES.find((item) => item.id === templateId) ?? PRESENTATION_TEMPLATES[0];
  const templates: Record<PresentationTemplateId, () => PresentationSlide[]> = {
    northstar: northstarSlides,
    fieldnotes: fieldnotesSlides,
    signal: signalSlides,
  };
  const now = Date.now();
  return {
    id: createId(),
    name: template.name,
    templateId: template.id,
    slides: templates[template.id](),
    createdAt: now,
    updatedAt: now,
  };
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

export function isPresentationProject(value: unknown): value is PresentationProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value as Partial<PresentationProject>;
  if (
    typeof project.id !== "string" || !project.id ||
    typeof project.name !== "string" || !project.name.trim() || project.name.length > 120 ||
    typeof project.templateId !== "string" ||
    !Array.isArray(project.slides) || !project.slides.length || project.slides.length > MAX_SLIDES ||
    typeof project.createdAt !== "number" || !Number.isFinite(project.createdAt) ||
    typeof project.updatedAt !== "number" || !Number.isFinite(project.updatedAt)
  ) return false;
  const slideIds = new Set<string>();
  for (const candidate of project.slides) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id || slideIds.has(candidate.id) ||
      typeof candidate.title !== "string" || candidate.title.length > 160 ||
      !isHexColor(candidate.background) || typeof candidate.layout !== "string" ||
      !Array.isArray(candidate.elements) || candidate.elements.length > MAX_ELEMENTS_PER_SLIDE) return false;
    slideIds.add(candidate.id);
    const elementIds = new Set<string>();
    for (const item of candidate.elements) {
      if (!item || typeof item.id !== "string" || !item.id || elementIds.has(item.id) ||
        !["text", "shape", "image"].includes(item.kind) ||
        ![item.x, item.y, item.width, item.height].every((number) => typeof number === "number" && Number.isFinite(number)) ||
        item.x < 0 || item.y < 0 || item.width <= 0 || item.height <= 0 ||
        item.x + item.width > PRESENTATION_WIDTH + 1 || item.y + item.height > PRESENTATION_HEIGHT + 1 ||
        (item.text !== undefined && (typeof item.text !== "string" || item.text.length > 12_000)) ||
        (item.color !== undefined && !isHexColor(item.color)) ||
        (item.fill !== undefined && item.fill !== "transparent" && !isHexColor(item.fill)) ||
        (item.fontSize !== undefined && (!Number.isFinite(item.fontSize) || item.fontSize < 6 || item.fontSize > 120)) ||
        (item.fontFamily !== undefined && !["Arial", "Georgia", "Inter", "Verdana", "Trebuchet MS"].includes(item.fontFamily))) return false;
      if (item.kind === "shape" && item.shape !== undefined && !["rectangle", "rounded", "circle", "line"].includes(item.shape)) return false;
      if (item.kind === "image" && (!(item.blob instanceof Blob) || !IMAGE_MIME_TYPES.includes(item.mimeType as (typeof IMAGE_MIME_TYPES)[number]) ||
        item.blob.size <= 0 || item.blob.size > 15 * 1024 * 1024)) return false;
      elementIds.add(item.id);
    }
  }
  return true;
}

export async function loadPresentationProjects(): Promise<PresentationProject[]> {
  const values = await db.presentations.orderBy("updatedAt").reverse().toArray();
  return values.filter(isPresentationProject);
}

export async function savePresentationProject(project: PresentationProject): Promise<PresentationProject> {
  const saved = { ...project, name: project.name.trim().slice(0, 120) || "Untitled presentation", updatedAt: Date.now() };
  if (!isPresentationProject(saved)) throw new Error("Cannot save invalid presentation data.");
  await db.presentations.put(saved);
  return saved;
}

export async function deletePresentationProject(id: string): Promise<void> {
  await db.presentations.delete(id);
}

export function duplicatePresentationProject(project: PresentationProject, copySuffix: string): PresentationProject {
  const copy = structuredClone(project);
  const now = Date.now();
  return {
    ...copy,
    id: createId(),
    name: `${copy.name} ${copySuffix}`.slice(0, 120),
    createdAt: now,
    updatedAt: now,
    slides: copy.slides.map((item) => ({
      ...item,
      id: createId(),
      elements: item.elements.map((element) => ({ ...element, id: createId() })),
    })),
  };
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[character] ?? character);
}

function presentationShape(element: PresentationElement, id: number, imageRelation?: string): string {
  const x = Math.round(element.x * PPTX_WIDTH / PRESENTATION_WIDTH);
  const y = Math.round(element.y * PPTX_HEIGHT / PRESENTATION_HEIGHT);
  const cx = Math.round(element.width * PPTX_WIDTH / PRESENTATION_WIDTH);
  const cy = Math.round(element.height * PPTX_HEIGHT / PRESENTATION_HEIGHT);
  if (element.kind === "image" && imageRelation) {
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${xmlEscape(element.imageName ?? "Image")}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${imageRelation}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  const shapeName = element.shape === "circle" ? "ellipse" : element.shape === "rounded" ? "roundRect" : element.shape === "line" ? "line" : "rect";
  const fill = element.fill && element.fill !== "transparent"
    ? `<a:solidFill><a:srgbClr val="${color(element.fill)}"/></a:solidFill>`
    : "<a:noFill/>";
  const line = element.shape === "line"
    ? `<a:ln w="19050"><a:solidFill><a:srgbClr val="${color(element.color ?? "#8090A0")}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  const paragraphs = (element.text ?? "").split(/\r?\n/).map((lineText) => {
    const fontSize = Math.round((element.fontSize ?? 20) * 100);
    const textColor = color(element.color ?? "#17212B");
    const weight = element.bold ? ' b="1"' : "";
    return `<a:p><a:r><a:rPr lang="en-US" sz="${fontSize}"${weight}><a:solidFill><a:srgbClr val="${textColor}"/></a:solidFill><a:latin typeface="${xmlEscape(element.fontFamily ?? "Arial")}"/></a:rPr><a:t xml:space="preserve">${xmlEscape(lineText)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${fontSize}"/></a:p>`;
  }).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(element.text?.slice(0, 32) || "Shape")}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${shapeName}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${element.text ? `<p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/>${paragraphs}</p:txBody>` : ""}</p:sp>`;
}

function relationshipXml(items: Array<{ id: string; type: string; target: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_NS}">${items.map((item) =>
    `<Relationship Id="${item.id}" Type="${item.type}" Target="${item.target}"/>`).join("")}</Relationships>`;
}

function slideXml(item: PresentationSlide, imageRelations: Map<string, string>): string {
  const shapes = item.elements.map((element, index) =>
    presentationShape(element, index + 2, imageRelations.get(element.id))).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color(item.background)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A_NS}" name="Kxno Desk"><a:themeElements><a:clrScheme name="Kxno"><a:dk1><a:srgbClr val="17212B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="243447"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="608D79"/></a:accent1><a:accent2><a:srgbClr val="B94E37"/></a:accent2><a:accent3><a:srgbClr val="5264A9"/></a:accent3><a:accent4><a:srgbClr val="B7A2FF"/></a:accent4><a:accent5><a:srgbClr val="81DCE8"/></a:accent5><a:accent6><a:srgbClr val="E2B777"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Kxno"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Kxno"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

export async function exportPresentationPptx(project: PresentationProject): Promise<Blob> {
  if (!isPresentationProject(project)) throw new Error("Cannot export invalid presentation data.");
  const files: Record<string, Uint8Array> = {};
  const presentationRels = [{ id: "rId1", type: `${R_NS}/slideMaster`, target: "slideMasters/slideMaster1.xml" }];
  const slideIds = project.slides.map((item, index) => {
    const number = index + 1;
    const relId = `rId${number + 1}`;
    presentationRels.push({ id: relId, type: `${R_NS}/slide`, target: `slides/slide${number}.xml` });
    const imageRelations = new Map<string, string>();
    const slideRels = [{ id: "rId1", type: `${R_NS}/slideLayout`, target: "../slideLayouts/slideLayout1.xml" }];
    let imageIndex = 2;
    for (const element of item.elements) {
      if (element.kind !== "image" || !element.blob) continue;
      const extension = element.mimeType === "image/jpeg" ? "jpg" : "png";
      const imageName = `image${number}-${imageIndex}.${extension}`;
      const imageRel = `rId${imageIndex}`;
      imageIndex += 1;
      imageRelations.set(element.id, imageRel);
      slideRels.push({ id: imageRel, type: `${R_NS}/image`, target: `../media/${imageName}` });
    }
    files[`ppt/slides/slide${number}.xml`] = strToU8(slideXml(item, imageRelations));
    files[`ppt/slides/_rels/slide${number}.xml.rels`] = strToU8(relationshipXml(slideRels));
    return `<p:sldId id="${255 + number}" r:id="${relId}"/>`;
  });
  await Promise.all(project.slides.flatMap((item) => item.elements
    .filter((element) => element.kind === "image" && element.blob)
    .map((element) => element.blob!.arrayBuffer().then((buffer) => {
      const extension = element.mimeType === "image/jpeg" ? "jpg" : "png";
      const number = project.slides.indexOf(item) + 1;
      const imageIndex = item.elements.filter((candidate) => candidate.kind === "image").indexOf(element) + 2;
      files[`ppt/media/image${number}-${imageIndex}.${extension}`] = new Uint8Array(buffer);
    }))));
  const slideOverrides = project.slides.map((_item, index) =>
    `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const imageTypes = new Set(project.slides.flatMap((item) => item.elements
    .filter((element) => element.kind === "image").map((element) => element.mimeType === "image/jpeg" ? "jpg" : "png")));
  const imageDefaults = [...imageTypes].map((extension) =>
    `<Default Extension="${extension}" ContentType="image/${extension === "jpg" ? "jpeg" : extension}"/>`).join("");
  files["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageDefaults}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`);
  files["_rels/.rels"] = strToU8(relationshipXml([{ id: "rId1", type: `${R_NS}/officeDocument`, target: "ppt/presentation.xml" }]));
  files["ppt/presentation.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds.join("")}</p:sldIdLst><p:sldSz cx="${PPTX_WIDTH}" cy="${PPTX_HEIGHT}" type="wide"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  files["ppt/_rels/presentation.xml.rels"] = strToU8(relationshipXml(presentationRels));
  files["ppt/slideMasters/slideMaster1.xml"] = strToU8(masterXml);
  files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = strToU8(relationshipXml([
    { id: "rId1", type: `${R_NS}/slideLayout`, target: "../slideLayouts/slideLayout1.xml" },
    { id: "rId2", type: `${R_NS}/theme`, target: "../theme/theme1.xml" },
  ]));
  files["ppt/slideLayouts/slideLayout1.xml"] = strToU8(layoutXml);
  files["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = strToU8(relationshipXml([
    { id: "rId1", type: `${R_NS}/slideMaster`, target: "../slideMasters/slideMaster1.xml" },
  ]));
  files["ppt/theme/theme1.xml"] = strToU8(themeXml);
  const zipped = zipSync(files, { level: 4 });
  return new Blob([zipped], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

function keepPptxPart(name: string): boolean {
  return name === "[Content_Types].xml" ||
    name === "ppt/presentation.xml" ||
    name === "ppt/_rels/presentation.xml.rels" ||
    /^ppt\/slides\/slide\d+\.xml$/.test(name) ||
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name) ||
    /^ppt\/media\/[A-Za-z0-9._-]+\.(?:png|jpe?g)$/i.test(name);
}

async function extractPptxParts(file: File): Promise<Record<string, Uint8Array>> {
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error("Choose a PowerPoint file smaller than 30 MB.");
  const compressed = new Uint8Array(await file.arrayBuffer());
  let totalSize = 0;
  let fileCount = 0;
  let limitExceeded = false;
  return new Promise((resolve, reject) => {
    unzip(compressed, {
      filter: (entry) => {
        fileCount += 1;
        if (fileCount > 300 || entry.originalSize > 15 * 1024 * 1024) {
          limitExceeded = true;
          return false;
        }
        if (!keepPptxPart(entry.name)) return false;
        totalSize += entry.originalSize;
        if (totalSize > MAX_UNCOMPRESSED_BYTES) {
          limitExceeded = true;
          return false;
        }
        return true;
      },
    }, (error, parts) => {
      if (limitExceeded) {
        reject(new Error("This PowerPoint file exceeds the safe import limits."));
        return;
      }
      if (error) {
        reject(new Error("This file is not a readable PowerPoint presentation."));
        return;
      }
      resolve(parts);
    });
  });
}

function parseXml(bytes: Uint8Array | undefined): XMLDocument {
  if (!bytes) throw new Error("This PowerPoint file is missing required presentation data.");
  const parsed = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  if (parsed.getElementsByTagName("parsererror").length) throw new Error("This PowerPoint file contains invalid XML.");
  return parsed;
}

function relationships(document: XMLDocument): Map<string, string> {
  return new Map(Array.from(document.getElementsByTagNameNS(PKG_NS, "Relationship"), (item) => [
    item.getAttribute("Id") ?? "",
    item.getAttribute("Target") ?? "",
  ]));
}

function resolveTarget(sourcePath: string, target: string): string {
  if (!target || target.startsWith("/") || target.includes("\\") || target.includes(":")) return "";
  const parts = sourcePath.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else if (segment && segment !== ".") {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

function shapeBounds(shape: Element, sourceWidth: number, sourceHeight: number) {
  const transform = shape.getElementsByTagNameNS(A_NS, "xfrm")[0];
  const offset = transform?.getElementsByTagNameNS(A_NS, "off")[0];
  const extent = transform?.getElementsByTagNameNS(A_NS, "ext")[0];
  const x = Number(offset?.getAttribute("x"));
  const y = Number(offset?.getAttribute("y"));
  const width = Number(extent?.getAttribute("cx"));
  const height = Number(extent?.getAttribute("cy"));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const left = Math.max(0, Math.min(PRESENTATION_WIDTH - 1, x / sourceWidth * PRESENTATION_WIDTH));
  const top = Math.max(0, Math.min(PRESENTATION_HEIGHT - 1, y / sourceHeight * PRESENTATION_HEIGHT));
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.min(PRESENTATION_WIDTH - left, width / sourceWidth * PRESENTATION_WIDTH)),
    height: Math.max(1, Math.min(PRESENTATION_HEIGHT - top, height / sourceHeight * PRESENTATION_HEIGHT)),
  };
}

function shapeColor(shape: Element, tag: string): string | undefined {
  const fills = Array.from(shape.getElementsByTagNameNS(A_NS, tag));
  const rgb = fills[0]?.getElementsByTagNameNS(A_NS, "srgbClr")[0]?.getAttribute("val");
  return rgb && /^[\da-f]{6}$/i.test(rgb) ? `#${rgb}` : undefined;
}

function slideBackground(document: XMLDocument): string {
  const colorValue = document.getElementsByTagNameNS(A_NS, "bgPr")[0]
    ?.getElementsByTagNameNS(A_NS, "srgbClr")[0]?.getAttribute("val");
  return colorValue && /^[\da-f]{6}$/i.test(colorValue) ? `#${colorValue}` : "#FFFFFF";
}

function slideText(shape: Element): { text: string; fontSize: number; color?: string; bold: boolean; fontFamily: string } {
  const paragraphs = Array.from(shape.getElementsByTagNameNS(A_NS, "p"));
  const value = paragraphs.map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(A_NS, "t"))
    .map((run) => run.textContent ?? "").join("")).join("\n");
  const run = shape.getElementsByTagNameNS(A_NS, "rPr")[0] ?? shape.getElementsByTagNameNS(A_NS, "defRPr")[0];
  const fontSize = Number(run?.getAttribute("sz")) / 100;
  const font = run?.getElementsByTagNameNS(A_NS, "latin")[0]?.getAttribute("typeface");
  return {
    text: value.slice(0, 12_000),
    fontSize: Number.isFinite(fontSize) ? Math.max(6, Math.min(120, fontSize)) : 18,
    color: shapeColor(run ?? shape, "solidFill"),
    bold: run?.getAttribute("b") === "1",
    fontFamily: ["Arial", "Georgia", "Inter", "Verdana", "Trebuchet MS"].includes(font ?? "") ? font! : "Arial",
  };
}

async function importedSlide(
  slidePath: string,
  document: XMLDocument,
  parts: Record<string, Uint8Array>,
  sourceWidth: number,
  sourceHeight: number,
): Promise<PresentationSlide> {
  const stem = slidePath.split("/").at(-1) ?? "";
  const relationPath = `ppt/slides/_rels/${stem}.rels`;
  const rels = relationships(parseXml(parts[relationPath]));
  const elements: PresentationElement[] = [];
  const shapeTree = document.getElementsByTagNameNS(P_NS, "spTree")[0];
  const sceneObjects = Array.from(shapeTree?.children ?? []).filter((item) =>
    item.namespaceURI === P_NS && (item.localName === "sp" || item.localName === "pic"));
  for (const sceneObject of sceneObjects) {
    if (elements.length >= MAX_ELEMENTS_PER_SLIDE) break;
    const bounds = shapeBounds(sceneObject, sourceWidth, sourceHeight);
    if (!bounds) continue;
    if (sceneObject.localName === "pic") {
      const rel = sceneObject.getElementsByTagNameNS(A_NS, "blip")[0]?.getAttributeNS(R_NS, "embed") ?? "";
      const target = resolveTarget(slidePath, rels.get(rel) ?? "");
      const bytes = parts[target];
      if (!bytes || !/^ppt\/media\/[A-Za-z0-9._-]+\.(?:png|jpe?g)$/i.test(target)) continue;
      const mimeType = target.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      elements.push(makeElement("image", {
        ...bounds,
        blob: new Blob([bytes], { type: mimeType }),
        mimeType,
        imageName: target.split("/").at(-1) ?? "image",
      }));
      continue;
    }
    const content = slideText(sceneObject);
    const geometry = sceneObject.getElementsByTagNameNS(A_NS, "prstGeom")[0]?.getAttribute("prst");
    const shape: PresentationShape = geometry === "ellipse" ? "circle" : geometry === "roundRect" ? "rounded" : "rectangle";
    const fill = shapeColor(sceneObject, "solidFill") ?? "transparent";
    if (content.text.trim() || fill !== "transparent") {
      elements.push(makeElement(content.text.trim() && fill === "transparent" ? "text" : "shape", {
        ...bounds,
        text: content.text,
        shape,
        fill,
        fontSize: content.fontSize,
        color: content.color ?? "#17212B",
        bold: content.bold,
        fontFamily: content.fontFamily,
      }));
    }
  }
  const title = elements.find((element) => element.text?.trim())?.text?.split("\n")[0]?.slice(0, 160) ?? `Slide ${stem.match(/\d+/)?.[0] ?? ""}`;
  return { id: createId(), title, background: slideBackground(document), layout: "imported", elements };
}

export async function importPresentationPptx(file: File): Promise<PresentationProject> {
  const parts = await extractPptxParts(file);
  const presentation = parseXml(parts["ppt/presentation.xml"]);
  const presentationRels = relationships(parseXml(parts["ppt/_rels/presentation.xml.rels"]));
  const slideSize = presentation.getElementsByTagNameNS(P_NS, "sldSz")[0];
  const sourceWidth = Number(slideSize?.getAttribute("cx")) || PPTX_WIDTH;
  const sourceHeight = Number(slideSize?.getAttribute("cy")) || PPTX_HEIGHT;
  const slidePaths = Array.from(presentation.getElementsByTagNameNS(P_NS, "sldId"), (item) => {
    const relation = item.getAttributeNS(R_NS, "id") ?? "";
    return resolveTarget("ppt/presentation.xml", presentationRels.get(relation) ?? "");
  }).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  if (!slidePaths.length) throw new Error("This PowerPoint file does not contain any readable slides.");
  if (slidePaths.length > MAX_SLIDES) throw new Error("A presentation can contain at most 100 slides.");
  const slides: PresentationSlide[] = [];
  for (const [index, path] of slidePaths.entries()) {
    slides.push(await importedSlide(path, parseXml(parts[path]), parts, sourceWidth, sourceHeight));
    if (!slides[index]) throw new Error("A slide could not be imported.");
  }
  const name = file.name.replace(/\.pptx$/i, "").trim().slice(0, 120) || "Imported presentation";
  const now = Date.now();
  const project: PresentationProject = {
    id: createId(),
    name,
    templateId: "imported",
    slides,
    createdAt: now,
    updatedAt: now,
  };
  if (!isPresentationProject(project)) throw new Error("This PowerPoint file contains unsupported slide data.");
  return project;
}
