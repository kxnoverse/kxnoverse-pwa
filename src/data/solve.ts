import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface SolveQuestionResult {
  id: string;
  label: string;
  question: string;
  answer: string | null;
  page: number | null;
  placement?: SolvePlacement;
  reason?: string;
}

export interface SolvePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface SolveAnalysis {
  questions: SolveQuestionResult[];
}

export class SolveResponseError extends Error {
  constructor(
    readonly code: "invalidResponse" | "incompleteResponse",
    readonly references: string[] = [],
  ) {
    super(code);
    this.name = "SolveResponseError";
  }
}

const MAX_QUESTIONS = 60;
const MAX_QUESTION_LENGTH = 2_000;
const MAX_ANSWER_LENGTH = 4_000;
const MAX_REASON_LENGTH = 1_000;
const MIN_PLACEMENT_CONFIDENCE = 0.92;

export async function getPdfPageCount(source: ArrayBuffer | Uint8Array): Promise<number> {
  const document = await PDFDocument.load(source, { updateMetadata: false });
  return document.getPageCount();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function extractSolvePayload(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6) return undefined;
  if (typeof value === "string") {
    for (const candidate of parseJsonCandidates(value)) {
      const payload = extractSolvePayload(candidate, depth + 1);
      if (payload) return payload;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    const text = extractText(value);
    if (text) {
      const payload = extractSolvePayload(text, depth + 1);
      if (payload) return payload;
    }
    for (const item of value) {
      const payload = extractSolvePayload(item, depth + 1);
      if (payload) return payload;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const questions = value.detectedQuestions ?? value.questionInventory ?? value.questions;
  const answers = value.answers ?? value.solutions;
  if (Array.isArray(questions) && Array.isArray(answers)) return value;

  for (const key of ["choices", "message", "content", "output_text", "output", "data", "result", "response"]) {
    if (!(key in value)) continue;
    const nested = value[key];
    const text = extractText(nested);
    const payload = extractSolvePayload(text ?? nested, depth + 1);
    if (payload) return payload;
  }
  return undefined;
}

function asReference(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

function parsePlacement(value: unknown, page: number | null, pageCount: number): SolvePlacement | undefined {
  if (!isRecord(value) || page === null || !Number.isInteger(page) || page < 1 || page > pageCount) return undefined;
  const { x, y, width, height, confidence } = value;
  if (
    typeof x !== "number" || !Number.isFinite(x) ||
    typeof y !== "number" || !Number.isFinite(y) ||
    typeof width !== "number" || !Number.isFinite(width) ||
    typeof height !== "number" || !Number.isFinite(height) ||
    typeof confidence !== "number" || !Number.isFinite(confidence) ||
    x < 0 || y < 0 || width <= 0 || height <= 0 ||
    x + width > 1 || y + height > 1 || confidence < MIN_PLACEMENT_CONFIDENCE
  ) return undefined;
  return { x, y, width, height, confidence };
}

function parsePage(value: unknown, pageCount: number): number | null {
  const page = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(page) && Number(page) >= 1 && Number(page) <= pageCount ? Number(page) : null;
}

function parseQuestionInventory(value: unknown, pageCount: number): SolveQuestionResult[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_QUESTIONS) {
    throw new SolveResponseError("invalidResponse");
  }
  const ids = new Set<string>();
  return value.map((item) => {
    const id = typeof item === "string"
      ? item.trim()
      : isRecord(item) ? asReference(item.id ?? item.questionId ?? item.number) : undefined;
    const labelValue = typeof item === "string"
      ? item
      : isRecord(item) ? item.label ?? item.originalLabel ?? item.questionNumber ?? item.number ?? id : undefined;
    const questionValue = isRecord(item) ? item.question ?? item.prompt ?? item.text : labelValue;
    const label = typeof labelValue === "string" ? labelValue.trim() : asReference(labelValue);
    const question = typeof questionValue === "string" ? questionValue.trim() : "";
    if (!id || !label || !question || ids.has(id) || label.length > MAX_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH) {
      throw new SolveResponseError("invalidResponse");
    }
    ids.add(id);
    const page = isRecord(item) ? parsePage(item.page ?? item.page_number, pageCount) : null;
    return { id, label, question, answer: null, page };
  });
}

function parseAnswerMap(value: unknown, inventory: SolveQuestionResult[], pageCount: number): Map<string, { answer: string; page: number | null; placement?: SolvePlacement }> {
  if (!Array.isArray(value)) throw new SolveResponseError("invalidResponse");
  const ids = new Set(inventory.map((item) => item.id));
  const answers = new Map<string, { answer: string; page: number | null; placement?: SolvePlacement }>();
  for (const item of value) {
    if (!isRecord(item)) throw new SolveResponseError("invalidResponse");
    const id = asReference(item.questionId ?? item.question_id ?? item.id ?? item.reference);
    const answerValue = item.answer ?? item.solution ?? item.result;
    const answer = typeof answerValue === "string"
      ? answerValue.trim()
      : typeof answerValue === "number" && Number.isFinite(answerValue)
        ? String(answerValue)
        : "";
    if (!id || !ids.has(id) || answers.has(id) || !answer || answer.length > MAX_ANSWER_LENGTH) {
      throw new SolveResponseError("invalidResponse");
    }
    const question = inventory.find((item) => item.id === id);
    if (!question) throw new SolveResponseError("invalidResponse");
    const page = parsePage(item.page ?? item.page_number, pageCount) ?? question.page;
    const placement = parsePlacement(item.placement ?? item.coordinates, page, pageCount);
    answers.set(id, { answer, page, ...(placement ? { placement } : {}) });
  }
  return answers;
}

function parseUnansweredMap(value: unknown, inventory: SolveQuestionResult[]): Map<string, string> {
  if (value === undefined) return new Map();
  if (!Array.isArray(value)) throw new SolveResponseError("invalidResponse");
  const ids = new Set(inventory.map((item) => item.id));
  const unanswered = new Map<string, string>();
  for (const item of value) {
    if (!isRecord(item)) throw new SolveResponseError("invalidResponse");
    const id = asReference(item.questionId ?? item.question_id ?? item.id ?? item.reference);
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!id || !ids.has(id) || unanswered.has(id) || !reason || reason.length > MAX_REASON_LENGTH) {
      throw new SolveResponseError("invalidResponse");
    }
    unanswered.set(id, reason);
  }
  return unanswered;
}

export function parseSolveResponse(text: string, pageCount: number): SolveAnalysis {
  const payload = parseJsonCandidates(text)
    .map((candidate) => extractSolvePayload(candidate))
    .find((candidate): candidate is Record<string, unknown> => candidate !== undefined);
  if (!payload) throw new SolveResponseError("incompleteResponse");

  const inventory = parseQuestionInventory(payload.detectedQuestions ?? payload.questionInventory ?? payload.questions, pageCount);
  const answers = parseAnswerMap(payload.answers ?? payload.solutions, inventory, pageCount);
  const unanswered = parseUnansweredMap(payload.unanswered ?? payload.unresolved, inventory);
  const overlap = [...answers.keys()].filter((id) => unanswered.has(id));
  if (overlap.length) throw new SolveResponseError("invalidResponse", overlap);

  const unresolvedReferences = inventory
    .filter((question) => !answers.has(question.id) && !unanswered.has(question.id))
    .map((question) => question.label);
  if (unresolvedReferences.length) throw new SolveResponseError("incompleteResponse", unresolvedReferences);

  return {
    questions: inventory.map((question) => ({
      ...question,
      answer: answers.get(question.id)?.answer ?? null,
      page: answers.get(question.id)?.page ?? question.page,
      ...(answers.get(question.id)?.placement ? { placement: answers.get(question.id)?.placement } : {}),
      ...(unanswered.has(question.id) ? { reason: unanswered.get(question.id) } : {}),
    })),
  };
}

export function validateSolveAnalysis(analysis: SolveAnalysis): void {
  if (!Array.isArray(analysis.questions) || !analysis.questions.length || analysis.questions.length > MAX_QUESTIONS) {
    throw new SolveResponseError("incompleteResponse");
  }
  const ids = new Set<string>();
  for (const question of analysis.questions) {
    if (!question.id || !question.label.trim() || !question.question.trim() || ids.has(question.id) ||
      question.label.length > MAX_QUESTION_LENGTH || question.question.length > MAX_QUESTION_LENGTH) {
      throw new SolveResponseError("incompleteResponse", [question.label || question.id]);
    }
    ids.add(question.id);
    if (question.answer !== null && (!question.answer.trim() || question.answer.length > MAX_ANSWER_LENGTH)) {
      throw new SolveResponseError("incompleteResponse", [question.label]);
    }
    if (question.placement && (
      question.page === null || !parsePlacement(question.placement, question.page, Number.MAX_SAFE_INTEGER)
    )) throw new SolveResponseError("invalidResponse", [question.label]);
  }
}

const PDF_CHARACTER_FALLBACKS: Record<string, string> = {
  "\u00a0": " ",
  "\u2080": "0", "\u2081": "1", "\u2082": "2", "\u2083": "3", "\u2084": "4",
  "\u2085": "5", "\u2086": "6", "\u2087": "7", "\u2088": "8", "\u2089": "9",
  "\u2070": "0", "\u00b9": "1", "\u00b2": "2", "\u00b3": "3", "\u2074": "4",
  "\u2075": "5", "\u2076": "6", "\u2077": "7", "\u2078": "8", "\u2079": "9",
  "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2192": "->", "\u21d2": "=>",
  "\u03b1": "alpha", "\u03b2": "beta", "\u03b3": "gamma", "\u03b4": "delta",
  "\u03bc": "mu", "\u03c0": "pi", "\u03a3": "Sigma", "\u03a9": "Omega",
};

export function normalizePdfText(text: string, font: PDFFont): string {
  return Array.from(text, (character) => {
    const replacement = PDF_CHARACTER_FALLBACKS[character] ?? character;
    try {
      font.encodeText(replacement);
      return replacement;
    } catch {
      return `[U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}]`;
    }
  }).join("");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = normalizePdfText(text, font).replace(/\r\n?/g, "\n");
  const lines: string[] = [];
  for (const paragraph of normalized.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
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
    else if (!words.length) lines.push("");
  }
  return lines;
}

function formatQuestionLabel(question: SolveQuestionResult): string {
  if (
    question.question === question.label ||
    [".", ")", ":", " "].some((separator) => question.question.startsWith(`${question.label}${separator}`))
  ) return question.question;
  return `${question.label}. ${question.question}`;
}

function drawAnswerSheet(document: PDFDocument, answers: SolveQuestionResult[], bodyFont: PDFFont, headingFont: PDFFont) {
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
  const bodySize = 11;
  const lineHeight = 16;
  const answeredCount = answers.filter((item) => item.answer !== null).length;
  const unansweredCount = answers.length - answeredCount;
  if (!answers.length) return;
  let page = document.addPage(pageSize);
  let cursorY = page.getHeight() - margin;
  const addPage = () => {
    page = document.addPage(pageSize);
    cursorY = page.getHeight() - margin;
  };
  const drawLines = (lines: string[], font: PDFFont, size: number, color: ReturnType<typeof rgb>, indent = 0) => {
    for (const line of lines) {
      if (cursorY < margin) addPage();
      page.drawText(line, { x: margin + indent, y: cursorY - size, size, font, color });
      cursorY -= lineHeight;
    }
  };
  drawLines(["Kxno Solve - complete answer sheet"], headingFont, 17, rgb(0.13, 0.28, 0.48));
  cursorY -= 6;
  drawLines([
    `${answers.length} answers listed; ${answeredCount} answered; ${unansweredCount} unanswered.`,
    "Original question and table labels are preserved. Other answers were placed on the worksheet.",
  ], bodyFont, 9, rgb(0.35, 0.38, 0.42));
  cursorY -= 12;

  for (const item of answers) {
    const questionLines = wrapText(formatQuestionLabel(item), headingFont, bodySize, page.getWidth() - margin * 2);
    const answerText = item.answer === null
      ? `Unanswered: ${item.reason || "No answer was provided."}`
      : `Answer: ${item.answer}`;
    const answerLines = wrapText(answerText, bodyFont, bodySize, page.getWidth() - margin * 2 - 14);
    if (cursorY - ((questionLines.length + answerLines.length + 1) * lineHeight) < margin) addPage();
    drawLines(questionLines, headingFont, bodySize, rgb(0.16, 0.18, 0.22));
    drawLines(answerLines, bodyFont, bodySize, item.answer === null ? rgb(0.62, 0.29, 0.18) : rgb(0.12, 0.28, 0.48), 14);
    cursorY -= 10;
  }
}

export async function createSolvedPdf(source: Uint8Array, analysis: SolveAnalysis): Promise<Uint8Array> {
  validateSolveAnalysis(analysis);
  const document = await PDFDocument.load(source, { updateMetadata: false });
  const bodyFont = await document.embedFont(StandardFonts.Helvetica);
  const headingFont = await document.embedFont(StandardFonts.HelveticaBold);
  const pages = document.getPages();
  const answerSheet: SolveQuestionResult[] = [];
  let exportedCount = 0;
  for (const question of analysis.questions) {
    if (question.answer === null) {
      answerSheet.push(question);
      exportedCount += 1;
      continue;
    }
    const page = question.page === null ? undefined : pages[question.page - 1];
    if (!page || !question.placement) {
      answerSheet.push(question);
      exportedCount += 1;
      continue;
    }
    const { x, y, width, height } = question.placement;
    const boxX = x * page.getWidth();
    const boxY = page.getHeight() - (y + height) * page.getHeight();
    const boxWidth = width * page.getWidth();
    const boxHeight = height * page.getHeight();
    const fontSize = Math.min(12, boxHeight * 0.68);
    const lines = wrapText(question.answer, bodyFont, fontSize, boxWidth);
    const lineHeight = fontSize * 1.2;
    if (
      fontSize < 6 ||
      lines.some((line) => bodyFont.widthOfTextAtSize(line, fontSize) > boxWidth) ||
      lines.length * lineHeight > boxHeight
    ) {
      answerSheet.push(question);
      exportedCount += 1;
      continue;
    }
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: boxX,
        y: boxY + boxHeight - fontSize - index * lineHeight,
        size: fontSize,
        font: bodyFont,
        color: rgb(0.12, 0.28, 0.48),
      });
    });
    exportedCount += 1;
  }
  if (exportedCount !== analysis.questions.length) throw new SolveResponseError("incompleteResponse");
  drawAnswerSheet(document, answerSheet, bodyFont, headingFont);
  return document.save();
}
