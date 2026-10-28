import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface SolvePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface SolveAnswer {
  id: string;
  question: string;
  answer: string;
  page: number | null;
  placement?: SolvePlacement;
}

const MAX_ANSWERS = 30;
const MAX_ANSWER_LENGTH = 500;
const PLACEMENT_CONFIDENCE = 0.92;

export async function getPdfPageCount(source: ArrayBuffer | Uint8Array): Promise<number> {
  const document = await PDFDocument.load(source, { updateMetadata: false });
  return document.getPageCount();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePlacement(value: unknown): SolvePlacement | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, width, height, confidence } = value;
  if (
    typeof x !== "number" || !Number.isFinite(x) ||
    typeof y !== "number" || !Number.isFinite(y) ||
    typeof width !== "number" || !Number.isFinite(width) ||
    typeof height !== "number" || !Number.isFinite(height) ||
    typeof confidence !== "number" || !Number.isFinite(confidence) ||
    x < 0 || y < 0 || width <= 0 || height <= 0 ||
    x + width > 1 || y + height > 1 || confidence < PLACEMENT_CONFIDENCE
  ) return undefined;
  return { x, y, width, height, confidence };
}

function parseJsonCandidates(text: string): unknown[] {
  const candidates: unknown[] = [];
  const addCandidate = (candidate: string) => {
    try {
      candidates.push(JSON.parse(candidate) as unknown);
    } catch {
      // Other response segments may still contain valid JSON.
    }
  };
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  if (trimmed) addCandidate(trimmed);

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    addCandidate(match[1]);
  }

  let start = -1;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      if (!stack.length) start = index;
      stack.push(character);
      continue;
    }
    if (character !== "}" && character !== "]") continue;
    const opening = stack.pop();
    if ((character === "}" && opening !== "{") || (character === "]" && opening !== "[")) {
      stack.length = 0;
      start = -1;
      continue;
    }
    if (!stack.length && start >= 0) {
      addCandidate(trimmed.slice(start, index + 1));
      start = -1;
    }
  }
  return candidates;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part) || (part.type !== undefined && part.type !== "text")) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

function extractAnswers(value: unknown, depth = 0): unknown[] | undefined {
  if (depth > 5) return undefined;
  if (typeof value === "string") {
    for (const candidate of parseJsonCandidates(value)) {
      const answers = extractAnswers(candidate, depth + 1);
      if (answers) return answers;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => isRecord(item) &&
      ["answer", "solution", "result"].some((key) => key in item))) {
      return value;
    }
    const text = extractText(value);
    if (text) return extractAnswers(text, depth + 1);
    for (const item of value) {
      const answers = extractAnswers(item, depth + 1);
      if (answers) return answers;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const key of ["answers", "solutions", "results", "exercises", "items"]) {
    if (Array.isArray(value[key])) return value[key] as unknown[];
  }
  if (Array.isArray(value.choices)) {
    const firstChoice = value.choices[0];
    const answers = extractAnswers(firstChoice, depth + 1);
    if (answers) return answers;
  }

  for (const key of ["message", "content", "output_text", "output", "data", "result", "response"]) {
    if (!(key in value)) continue;
    const nested = value[key];
    const text = extractText(nested);
    const answers = text ? extractAnswers(text, depth + 1) : extractAnswers(nested, depth + 1);
    if (answers) return answers;
  }
  return undefined;
}

export function parseSolveResponse(text: string, pageCount: number): SolveAnswer[] {
  const answers = parseJsonCandidates(text)
    .map((candidate) => extractAnswers(candidate))
    .find((candidate): candidate is unknown[] => candidate !== undefined);
  if (!answers || answers.length === 0 || answers.length > MAX_ANSWERS) {
    throw new Error("invalidResponse");
  }

  return answers.map((item, index) => {
    if (!isRecord(item)) throw new Error("invalidResponse");
    const answerValue = item.answer ?? item.solution ?? item.result;
    const answer = typeof answerValue === "string"
      ? answerValue
      : typeof answerValue === "number" && Number.isFinite(answerValue)
        ? String(answerValue)
        : "";
    if (!answer.trim() || answer.length > MAX_ANSWER_LENGTH) {
      throw new Error("invalidResponse");
    }
    const questionValue = item.question ?? item.exercise ?? item.prompt ?? item.label;
    const question = typeof questionValue === "string" && questionValue.trim()
      ? questionValue.trim().slice(0, MAX_ANSWER_LENGTH)
      : `Exercise ${index + 1}`;
    const pageValue = item.page ?? item.page_number;
    const pageNumber = typeof pageValue === "string" && /^\d+$/.test(pageValue) ? Number(pageValue) : pageValue;
    const page = Number.isInteger(pageNumber) && Number(pageNumber) >= 1 && Number(pageNumber) <= pageCount
      ? Number(pageNumber)
      : null;
    const placement = page === null ? undefined : parsePlacement(item.placement ?? item.coordinates);
    return {
      id: `answer-${index + 1}`,
      question,
      answer: answer.trim(),
      page,
      ...(placement ? { placement } : {}),
    };
  });
}

function encodeSupportedText(text: string, font: PDFFont): string {
  let output = "";
  for (const character of text) {
    try {
      font.encodeText(output + character);
      output += character;
    } catch {
      output += "?";
    }
  }
  return output;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = encodeSupportedText(text, font).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > maxWidth && line) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawAnswerSheet(document: PDFDocument, answers: SolveAnswer[], font: PDFFont) {
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
  const bodySize = 11;
  const lineHeight = 16;
  let page = document.addPage(pageSize);
  let cursorY = page.getHeight() - margin;
  const addPage = () => {
    page = document.addPage(pageSize);
    cursorY = page.getHeight() - margin;
  };
  const drawLines = (lines: string[], size: number, color: ReturnType<typeof rgb>) => {
    for (const line of lines) {
      if (cursorY < margin) addPage();
      page.drawText(line, { x: margin, y: cursorY - size, size, font, color });
      cursorY -= lineHeight;
    }
  };
  drawLines(["Kxno Solve — answer sheet"], 17, rgb(0.13, 0.28, 0.48));
  cursorY -= 6;
  drawLines(["Answers are listed separately where a position on the original page could not be verified."], 9, rgb(0.35, 0.38, 0.42));
  cursorY -= 12;

  answers.forEach((item, index) => {
    const question = wrapText(`${index + 1}. ${item.question}`, font, bodySize, page.getWidth() - margin * 2);
    const answer = wrapText(item.answer, font, bodySize, page.getWidth() - margin * 2 - 14);
    if (cursorY - ((question.length + answer.length + 1) * lineHeight) < margin) addPage();
    drawLines(question, bodySize, rgb(0.16, 0.18, 0.22));
    drawLines(answer.map((line) => `   ${line}`), bodySize, rgb(0.12, 0.28, 0.48));
    cursorY -= 10;
  });
}

export async function createSolvedPdf(source: Uint8Array, answers: SolveAnswer[]): Promise<Uint8Array> {
  const document = await PDFDocument.load(source, { updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  const answerSheet: SolveAnswer[] = [];

  for (const item of answers) {
    const targetPage = item.page === null ? undefined : pages[item.page - 1];
    const placement = item.placement;
    if (!targetPage || !placement) {
      answerSheet.push(item);
      continue;
    }
    const x = placement.x * targetPage.getWidth();
    const y = targetPage.getHeight() - (placement.y + placement.height) * targetPage.getHeight();
    const boxWidth = placement.width * targetPage.getWidth();
    const boxHeight = placement.height * targetPage.getHeight();
    const text = encodeSupportedText(item.answer.replace(/\s+/g, " "), font);
    const fontSize = Math.min(14, boxHeight * 0.68);
    if (fontSize < 6 || font.widthOfTextAtSize(text, fontSize) > boxWidth) {
      answerSheet.push(item);
      continue;
    }
    targetPage.drawText(text, {
      x,
      y: y + Math.max(0, (boxHeight - fontSize) / 2),
      size: fontSize,
      font,
      color: rgb(0.12, 0.28, 0.48),
    });
  }

  if (answerSheet.length) {
    drawAnswerSheet(document, answerSheet, font);
  }
  return document.save();
}
