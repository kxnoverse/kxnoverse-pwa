import type NSpell from "nspell";
import { Fragment, type Mark, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";

export type SpellLanguage = "de" | "en";

export type SpellIssue = {
  word: string;
  from: number;
  to: number;
  suggestions: string[];
};

type SpellPiece = {
  from: number;
  to: number;
  marks: readonly Mark[];
};

type SpellSegment = {
  text: string;
  pieces: SpellPiece[];
};

type SpellChecker = InstanceType<typeof NSpell>;

const checkers = new Map<SpellLanguage, Promise<SpellChecker>>();
const wordPattern = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+|[-‐‑–][\p{L}\p{M}]+)*/gu;
const skipPatterns = [
  /(?:https?:\/\/|www\.)[^\s<>]+/giu,
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  /\b[a-z][a-z\d]*[A-Z][A-Za-z\d]*\b/g,
  /\b[A-Za-z_$][A-Za-z\d_$]*_[A-Za-z\d_$]*\b/g,
];

export async function loadSpellChecker(language: SpellLanguage): Promise<SpellChecker> {
  let checker = checkers.get(language);
  if (!checker) {
    checker = (async () => {
      const [nspellModule, affModule, dicModule] = await Promise.all([
        import("nspell"),
        language === "de"
          ? import("../../node_modules/dictionary-de/index.aff?raw")
          : import("../../node_modules/dictionary-en/index.aff?raw"),
        language === "de"
          ? import("../../node_modules/dictionary-de/index.dic?raw")
          : import("../../node_modules/dictionary-en/index.dic?raw"),
      ]);
      const createSpellChecker = nspellModule.default as typeof NSpell;
      return new createSpellChecker(affModule.default, dicModule.default);
    })();
    checkers.set(language, checker);
    checker.catch(() => checkers.delete(language));
  }
  return checker;
}

function collectSegments(doc: ProseMirrorNode): SpellSegment[] {
  const segments: SpellSegment[] = [];

  doc.descendants((block, blockPosition) => {
    if (!block.isTextblock) return;
    if (block.type.spec.code) return false;

    let text = "";
    let pieces: SpellPiece[] = [];
    const flush = () => {
      if (text) segments.push({ text, pieces });
      text = "";
      pieces = [];
    };

    let position = blockPosition + 1;
    for (let index = 0; index < block.childCount; index += 1) {
      const child = block.child(index);
      const end = position + child.nodeSize;
      if (child.isText && child.text && !child.marks.some((mark) => mark.type.spec.code)) {
        text += child.text;
        pieces.push({ from: position, to: end, marks: child.marks });
      } else {
        flush();
      }
      position = end;
    }
    flush();
    return false;
  });

  return segments;
}

function excludedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of skipPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

function overlapsRange(from: number, to: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([rangeFrom, rangeTo]) => from < rangeTo && to > rangeFrom);
}

function mapOffset(pieces: SpellPiece[], offset: number): number | undefined {
  let consumed = 0;
  for (const piece of pieces) {
    const length = piece.to - piece.from;
    if (offset >= consumed && offset <= consumed + length) return piece.from + offset - consumed;
    consumed += length;
  }
  return undefined;
}

function suggestedWords(checker: SpellChecker, word: string, language: SpellLanguage): string[] {
  const locale = language === "de" ? "de-DE" : "en-US";
  const suggestions: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const key = candidate.normalize("NFC").toLocaleLowerCase(locale);
    if (key !== word.normalize("NFC").toLocaleLowerCase(locale) && !seen.has(key) && checker.correct(candidate)) {
      seen.add(key);
      suggestions.push(candidate);
    }
  };
  const characters = Array.from(word);
  for (let index = 0; index < characters.length - 1; index += 1) {
    const candidate = [...characters];
    [candidate[index], candidate[index + 1]] = [candidate[index + 1], candidate[index]];
    add(candidate.join(""));
  }
  for (const candidate of checker.suggest(word)) add(candidate);

  return suggestions.slice(0, 5).map((suggestion) => {
    if (word === word.toLocaleUpperCase(locale)) return suggestion.toLocaleUpperCase(locale);
    if (
      word[0] === word[0]?.toLocaleUpperCase(locale)
      && word.slice(1) === word.slice(1).toLocaleLowerCase(locale)
    ) {
      return suggestion[0]?.toLocaleUpperCase(locale) + suggestion.slice(1);
    }
    return suggestion;
  });
}

export async function scanSpellDocument(
  doc: ProseMirrorNode,
  checker: SpellChecker,
  language: SpellLanguage,
  ignoredWords: ReadonlySet<string>,
  isCancelled: () => boolean = () => false,
): Promise<{ issues: SpellIssue[]; checkedWords: number }> {
  const issues: SpellIssue[] = [];
  const locale = language === "de" ? "de-DE" : "en-US";
  let checkedWords = 0;
  let wordsSinceYield = 0;

  for (const segment of collectSegments(doc)) {
    const excluded = excludedRanges(segment.text);
    wordPattern.lastIndex = 0;
    for (const match of segment.text.matchAll(wordPattern)) {
      if (isCancelled()) return { issues, checkedWords };
      const word = match[0];
      const start = match.index;
      const end = start + word.length;
      const before = segment.text[start - 1] ?? "";
      const after = segment.text[end] ?? "";
      const dictionaryWord = word.normalize("NFC");
      if (
        overlapsRange(start, end, excluded)
        || /[\p{L}\p{N}_$]/u.test(before)
        || /[\p{L}\p{N}_$]/u.test(after)
        || ignoredWords.has(word.normalize("NFC").toLocaleLowerCase(locale))
      ) continue;

      checkedWords += 1;
      if (!checker.correct(dictionaryWord)) {
        const from = mapOffset(segment.pieces, start);
        const to = mapOffset(segment.pieces, end);
        if (from !== undefined && to !== undefined) {
          issues.push({ word, from, to, suggestions: suggestedWords(checker, dictionaryWord, language) });
        }
      }

      wordsSinceYield += 1;
      if (wordsSinceYield >= 300) {
        wordsSinceYield = 0;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
  }

  return { issues, checkedWords };
}

export function createSpellReplacement(
  doc: ProseMirrorNode,
  schema: Schema,
  from: number,
  to: number,
  expectedText: string,
  replacement: string,
): Fragment | null {
  if (from < 0 || to <= from || !replacement) return null;
  if (doc.textBetween(from, to, "", "\uFFFC") !== expectedText) return null;
  const pieces: SpellPiece[] = [];
  doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    const end = position + node.nodeSize;
    const overlapFrom = Math.max(from, position);
    const overlapTo = Math.min(to, end);
    if (overlapFrom < overlapTo) {
      pieces.push({
        from: overlapFrom,
        to: overlapTo,
        marks: node.marks,
      });
    }
  });

  const coveredLength = pieces.reduce((sum, piece) => sum + piece.to - piece.from, 0);
  if (coveredLength !== to - from) return null;

  const replacements = [];
  let consumed = 0;
  for (const piece of pieces) {
    const pieceLength = piece.to - piece.from;
    const nextConsumed = consumed + pieceLength;
    const replacementFrom = Math.round((consumed / coveredLength) * replacement.length);
    const replacementTo = Math.round((nextConsumed / coveredLength) * replacement.length);
    const text = replacement.slice(replacementFrom, replacementTo);
    if (text) replacements.push(schema.text(text, piece.marks));
    consumed = nextConsumed;
  }

  return replacements.length ? Fragment.fromArray(replacements) : null;
}
