import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { createSpellReplacement, loadSpellChecker, scanSpellDocument } from "./docs-spellcheck";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    codeBlock: { content: "text*", group: "block", code: true },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", atom: true },
  },
  marks: {
    bold: { parseDOM: [{ tag: "strong" }], toDOM: () => ["strong", 0] },
    italic: { parseDOM: [{ tag: "em" }], toDOM: () => ["em", 0] },
    code: { code: true, parseDOM: [{ tag: "code" }], toDOM: () => ["code", 0] },
  },
});

describe("Docs offline spell checker", () => {
  it("checks English spelling, skips URLs, emails, identifiers and code", async () => {
    const checker = await loadSpellChecker("en");
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("This has teh "),
        schema.text("wrold", [schema.marks.bold.create()]),
        schema.text(" and https://exampel.com user@example.com my_varName myValue2"),
        schema.text(" mistkae", [schema.marks.code.create()]),
      ]),
      schema.node("codeBlock", null, [schema.text("teh wrold")]),
    ]);

    const result = await scanSpellDocument(doc, checker, "en", new Set());

    expect(result.issues.map(({ word }) => word)).toEqual(["teh", "wrold"]);
    expect(doc.textBetween(result.issues[1].from, result.issues[1].to)).toBe("wrold");
    expect(result.issues[0].suggestions[0]).toBe("the");
    expect(result.issues[1].suggestions[0]).toBe("world");
    expect(checker.correct("correct")).toBe(true);
    expect(result.checkedWords).toBe(5);
  });

  it("checks German words and handles Unicode positions across marked text nodes", async () => {
    const checker = await loadSpellChecker("de");
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("😀 Ein Fu\u0308r "),
        schema.text("Fahrrat", [schema.marks.bold.create()]),
        schema.text(" ist hier."),
      ]),
    ]);

    const result = await scanSpellDocument(doc, checker, "de", new Set());

    expect(result.issues.map(({ word }) => word)).toContain("Fahrrat");
    const issue = result.issues.find(({ word }) => word === "Fahrrat");
    expect(issue).toBeDefined();
    expect(doc.textBetween(issue!.from, issue!.to)).toBe("Fahrrat");
    expect(result.issues.map(({ word }) => word)).not.toContain("Ein");
    expect(result.issues.map(({ word }) => word)).not.toContain("Fu\u0308r");
  });

  it("maps a word split by formatting and preserves those marks in a replacement", async () => {
    const checker = await loadSpellChecker("en");
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("misp", [schema.marks.bold.create()]),
        schema.text("elled", [schema.marks.italic.create()]),
      ]),
    ]);

    const result = await scanSpellDocument(doc, checker, "en", new Set());
    const issue = result.issues.find(({ word }) => word === "mispelled");
    expect(issue).toBeDefined();
    expect(doc.textBetween(issue!.from, issue!.to)).toBe("mispelled");

    const replacement = createSpellReplacement(doc, schema, issue!.from, issue!.to, issue!.word, "misspelled");
    expect(replacement?.textBetween(0, replacement.size)).toBe("misspelled");
    expect(replacement?.child(0).marks.map(({ type }) => type.name)).toContain("bold");
    expect(replacement?.child(replacement.childCount - 1).marks.map(({ type }) => type.name)).toContain("italic");
  });

  it("ignores words selected by the user and refuses stale replacement ranges", async () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("teh word")]),
    ]);
    const checker = await loadSpellChecker("en");
    const result = await scanSpellDocument(doc, checker, "en", new Set(["teh"]));

    expect(result.issues).toEqual([]);
    expect(createSpellReplacement(doc, schema, 1, 4, "the", "the")).toBeNull();
  });
});
