import {
  GARDEN_CROPS,
  GARDEN_MOON_CROPS,
  GARDEN_REFERENCE_ENTRIES,
} from "./code-garden";
import type { GardenCropType, GardenWorldId } from "./db";

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

export function getCodeReferenceEntries(
  world?: GardenWorldId,
  availableCrops?: readonly GardenCropType[],
): readonly CodeReferenceEntry[] {
  if (!world) return CODE_REFERENCE_ENTRIES;
  const plantEntry = CODE_REFERENCE_ENTRIES.find((entry) => entry.id === "plant");
  if (!plantEntry) return CODE_REFERENCE_ENTRIES;
  const cropValues = availableCrops ?? (world === "moon"
    ? Object.keys(GARDEN_MOON_CROPS) as GardenCropType[]
    : Object.keys(GARDEN_CROPS) as GardenCropType[]);
  return CODE_REFERENCE_ENTRIES.map((entry) => entry.id === "plant"
    ? {
        ...entry,
        example: `plant("${cropValues[0] ?? (world === "moon" ? "mooncap" : "turnip")}")`,
        argumentValues: cropValues,
      }
    : entry);
}

export type CodeReferenceEntryId = (typeof CODE_REFERENCE_ENTRIES)[number]["id"];
