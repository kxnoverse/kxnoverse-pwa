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

export function parseSolveResponse(text: string, pageCount: number): SolveAnswer[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalidResponse");

  let payload: unknown;
  try {
    payload = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("invalidResponse");
  }
  if (!isRecord(payload) || !Array.isArray(payload.answers) || payload.answers.length === 0 || payload.answers.length > MAX_ANSWERS) {
    throw new Error("invalidResponse");
  }

  return payload.answers.map((item, index) => {
    if (!isRecord(item) || typeof item.answer !== "string" || !item.answer.trim() || item.answer.length > MAX_ANSWER_LENGTH) {
      throw new Error("invalidResponse");
    }
    const question = typeof item.question === "string" && item.question.trim()
      ? item.question.trim().slice(0, MAX_ANSWER_LENGTH)
      : `Exercise ${index + 1}`;
    const page = Number.isInteger(item.page) && Number(item.page) >= 1 && Number(item.page) <= pageCount
      ? Number(item.page)
      : null;
    const placement = page === null ? undefined : parsePlacement(item.placement);
    return {
      id: `answer-${index + 1}`,
      question,
      answer: item.answer.trim(),
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
