import { GARDEN_REFERENCE_ENTRIES } from "./code-garden";

export interface CodeReferenceEntry {
  id: string;
  category: "command" | "language" | "sensor" | "syntax";
  signature?: string;
  example: string;
  requirement: string;
  argumentValues?: readonly string[];
  suggestedValues?: readonly string[];
}

const syntaxEntries: CodeReferenceEntry[] = [
  { id: "braces", category: "syntax", example: "{ ... }", requirement: "syntax" },
  { id: "parentheses", category: "syntax", example: 'move("east")', requirement: "syntax" },
  { id: "quotes", category: "syntax", example: 'move("east")', requirement: "syntax" },
  { id: "comparison", category: "syntax", example: 'tile == "ripe"', requirement: "syntax" },
  { id: "comments", category: "syntax", example: "# explanation", requirement: "syntax" },
];

export const CODE_REFERENCE_ENTRIES: readonly CodeReferenceEntry[] = [
  ...GARDEN_REFERENCE_ENTRIES.map(({ id, category, signature, example, requirement, argumentValues, suggestedValues }) => ({
    id,
    category,
    signature,
    example,
    requirement,
    argumentValues,
    suggestedValues,
  })),
  ...syntaxEntries,
];

export type CodeReferenceEntryId = (typeof CODE_REFERENCE_ENTRIES)[number]["id"];
