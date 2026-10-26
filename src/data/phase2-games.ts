import type { Point } from "./arcade";
import { runnerCollision } from "./phase2-physics";

export type LetterMark = "correct" | "present" | "absent";
export type WordLanguage = "en" | "de";

export interface WordDictionary {
  language: WordLanguage;
  valid: Set<string>;
  solutions: Record<4 | 5 | 6, string[]>;
}

interface DictionaryFile {
  language: WordLanguage;
  valid: string[];
  solutions: Record<"4" | "5" | "6", string[]>;
}

export function normalizeWord(word: string, language: WordLanguage): string {
  return word.normalize("NFC").toLocaleLowerCase(language === "de" ? "de-DE" : "en-US");
}

function parseDictionaryData(parsed: unknown, language: WordLanguage): WordDictionary {
  if (!parsed || typeof parsed !== "object") throw new Error("Dictionary file is not an object.");
  const file = parsed as DictionaryFile;
  if (file.language !== language || !Array.isArray(file.valid) || !file.solutions) {
    throw new Error("Dictionary metadata is invalid.");
  }
  const valid = new Set(file.valid.map((word) => normalizeWord(word, language)));
  const solutions = {
    4: file.solutions["4"].map((word) => normalizeWord(word, language)),
    5: file.solutions["5"].map((word) => normalizeWord(word, language)),
    6: file.solutions["6"].map((word) => normalizeWord(word, language)),
  };
  for (const length of [4, 5, 6] as const) {
    if (solutions[length].length === 0 || solutions[length].some((word) => [...word].length !== length || !valid.has(word))) {
      throw new Error(`Dictionary solutions for ${length} letters are invalid.`);
    }
  }
  return { language, valid, solutions };
}

export function parseWordDictionary(source: string, language: WordLanguage): WordDictionary {
  return parseDictionaryData(JSON.parse(source), language);
}

export async function loadWordDictionary(language: WordLanguage): Promise<WordDictionary> {
  const load = language === "de"
    ? import("./word-lists/de.json")
    : import("./word-lists/en.json");
  const dictionary = await load;
  return parseDictionaryData(dictionary.default, language);
}

export function evaluateGuess(guess: string, answer: string): LetterMark[] {
  const guessLetters = [...guess.normalize("NFC")];
  const answerLetters = [...answer.normalize("NFC")];
  const marks: LetterMark[] = Array.from({ length: answerLetters.length }, () => "absent");
  const remaining = new Map<string, number>();
  for (let index = 0; index < answerLetters.length; index += 1) {
    if (guessLetters[index] === answerLetters[index]) marks[index] = "correct";
    else remaining.set(answerLetters[index], (remaining.get(answerLetters[index]) ?? 0) + 1);
  }
  for (let index = 0; index < guessLetters.length; index += 1) {
    if (marks[index] === "correct") continue;
    const count = remaining.get(guessLetters[index]) ?? 0;
    if (count > 0) {
      marks[index] = "present";
      remaining.set(guessLetters[index], count - 1);
    }
  }
  return marks;
}

export function randomWord(words: readonly string[], random: () => number = Math.random): string {
  if (words.length === 0) throw new Error("Cannot choose a solution from an empty word list.");
  return words[Math.min(words.length - 1, Math.floor(random() * words.length))];
}

export function circleHitsRect(
  circle: Point & { radius: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

export { runnerCollision };

export function airHockeyGoal(x: number, y: number, width = 800, goalHalfWidth = 80): "player" | "opponent" | null {
  if (Math.abs(x - width / 2) > goalHalfWidth) return null;
  if (y < 18) return "player";
  if (y > 482) return "opponent";
  return null;
}

export function isAimHit(point: Point, target: Point, radius: number): boolean {
  const dx = point.x - target.x;
  const dy = point.y - target.y;
  return dx * dx + dy * dy <= radius * radius;
}
