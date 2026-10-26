import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGuess, normalizeWord, parseWordDictionary } from "./phase2-games";

const dictionaryText = (language: "en" | "de") =>
  readFile(resolve("src", "data", "word-lists", `${language}.json`), "utf8");

describe("offline Word Guess dictionaries", () => {
  it("bundles substantial curated English and German lists for every supported length", async () => {
    const [englishText, germanText] = await Promise.all([dictionaryText("en"), dictionaryText("de")]);
    const dictionaries = [
      parseWordDictionary(englishText, "en"),
      parseWordDictionary(germanText, "de"),
    ];
    for (const dictionary of dictionaries) {
      for (const length of [4, 5, 6] as const) {
        expect([...dictionary.valid].filter((word) => [...word].length === length).length).toBeGreaterThan(500);
        expect(dictionary.solutions[length].length).toBeGreaterThan(300);
        expect(dictionary.solutions[length].every((word) => dictionary.valid.has(word))).toBe(true);
      }
    }
  });

  it("accepts representative real words in each language and word length", async () => {
    const english = parseWordDictionary(await dictionaryText("en"), "en");
    const german = parseWordDictionary(await dictionaryText("de"), "de");
    for (const word of ["love", "apple", "school", "baum", "apfel", "schule"]) {
      const dictionary = ["love", "apple", "school"].includes(word) ? english : german;
      expect(dictionary.valid.has(word)).toBe(true);
      expect(dictionary.solutions[[...word].length as 4 | 5 | 6]).toContain(word);
    }
    expect(english.valid.has("qzvtx")).toBe(false);
  });

  it("normalizes case and Unicode while retaining German umlauts and ß", () => {
    expect(normalizeWord("ÄRGER", "de")).toBe("ärger");
    expect(normalizeWord("WEIß", "de")).toBe("weiß");
    expect(normalizeWord("E\u0308LTER", "de")).toBe("ëlter");
  });

  it("evaluates duplicate letters against remaining answer counts", () => {
    expect(evaluateGuess("allee", "eagle")).toEqual(["present", "present", "absent", "present", "correct"]);
    expect(evaluateGuess("äääa", "äaba")).toEqual(["correct", "absent", "absent", "correct"]);
  });

  it("rejects malformed dictionary metadata and solutions not present in valid guesses", () => {
    const malformed = JSON.stringify({
      language: "en",
      valid: ["test", "tests", "tester"],
      solutions: { 4: ["nope"], 5: ["tests"], 6: ["tester"] },
    });
    expect(() => parseWordDictionary(malformed, "en")).toThrow("invalid");
  });
});
