import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  PDFRawStream,
  StandardFonts,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  createSolvedPdf,
  normalizePdfText,
  parseSolveResponse,
  SolveResponseError,
  type SolveAnalysis,
} from "./solve";

function payload() {
  return {
    detectedQuestions: [
      { id: "1", label: "1", question: "Berechne 7 + 8." },
      { id: "13", label: "13", question: "Erkläre in zwei bis drei Sätzen, warum regelmäßiges Üben beim Lernen helfen kann." },
      { id: "8a", label: "8a", question: "Ergebnis der Tabellenzeile 5 + 6." },
    ],
    answers: [
      { questionId: "1", answer: "15" },
      { questionId: "13", answer: "Die Regel wird hier vollständig erklärt." },
      { questionId: "8a", answer: "11" },
    ],
    unanswered: [],
  };
}

async function extractPdfText(bytes: Uint8Array, pageIndex?: number): Promise<string> {
  const document = await PDFDocument.load(bytes);
  const text: string[] = [];
  const pages = document.getPages();
  for (const [index, page] of pages.entries()) {
    if (pageIndex !== undefined && pageIndex !== index) continue;
    const contents = page.node.Contents();
    const references = contents instanceof PDFArray
      ? contents.asArray()
      : contents ? [contents] : [];
    for (const reference of references) {
      const stream = document.context.lookup(reference);
      if (!(stream instanceof PDFRawStream || stream instanceof PDFContentStream)) continue;
      const decoded = stream instanceof PDFContentStream
        ? stream.getUnencodedContents()
        : decodePDFRawStream(stream).decode();
      const operators = Buffer.from(decoded).toString("latin1");
      for (const match of operators.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) {
        text.push(Buffer.from(match[1], "hex").toString("latin1"));
      }
    }
  }
  return text.join("\n");
}

describe("Kxno Solve PDF helpers", () => {
  it("parses OpenRouter wrappers and fenced JSON while preserving original question references", () => {
    const response = JSON.stringify({
      id: "gen-example",
      choices: [{
        message: {
          role: "assistant",
          content: `Here are the answers:\n\`\`\`json\n${JSON.stringify(payload())}\n\`\`\``,
        },
      }],
    });

    expect(parseSolveResponse(response, 2).questions.map(({ id, label, answer }) => ({ id, label, answer }))).toEqual([
      { id: "1", label: "1", answer: "15" },
      { id: "13", label: "13", answer: "Die Regel wird hier vollständig erklärt." },
      { id: "8a", label: "8a", answer: "11" },
    ]);
  });

  it("normalizes content-part and field-name variations without inventing question IDs", () => {
    const response = JSON.stringify({
      message: {
        content: [
          { type: "text", text: "```JSON\n" },
          {
            type: "text",
            text: JSON.stringify({
              questionInventory: [{ id: 8, label: "8a", question: "5 + 6", page: 1 }],
              solutions: [{ question_id: 8, result: 11 }],
              unresolved: [],
            }),
          },
          { type: "text", text: "\n```" },
        ],
      },
    });

    expect(parseSolveResponse(response, 1).questions).toMatchObject([
      { id: "8", label: "8a", question: "5 + 6", answer: "11" },
    ]);
  });

  it("reports missing detected question 13 instead of exporting a partial result as complete", () => {
    const response = payload();
    response.answers = response.answers.filter((answer) => answer.questionId !== "13");
    const error = (() => {
      try {
        parseSolveResponse(JSON.stringify(response), 2);
      } catch (cause) {
        return cause;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(SolveResponseError);
    expect(error).toMatchObject({ code: "incompleteResponse", references: ["13"] });
  });

  it("rejects duplicated, unknown, and malformed mappings", () => {
    const duplicate = payload();
    duplicate.answers.push({ questionId: "1", answer: "Another answer" });
    expect(() => parseSolveResponse(JSON.stringify(duplicate), 2)).toThrow("invalidResponse");

    const unknown = payload();
    unknown.answers.push({ questionId: "99", answer: "Unknown question" });
    expect(() => parseSolveResponse(JSON.stringify(unknown), 2)).toThrow("invalidResponse");

    expect(() => parseSolveResponse("The worksheet is unreadable.", 1)).toThrow("incompleteResponse");
    expect(() => parseSolveResponse(JSON.stringify({
      detectedQuestions: [{ id: "1", label: "1", question: "Question" }],
      answers: [{ questionId: "1", answer: "" }],
    }), 1)).toThrow("invalidResponse");
  });

  it("keeps explicitly unanswered tasks visible and counts them in the complete question inventory", () => {
    const response = {
      detectedQuestions: [
        { id: "1", label: "1", question: "Question one" },
        { id: "13", label: "13", question: "Question thirteen" },
      ],
      answers: [{ questionId: "1", answer: "Answer one" }],
      unanswered: [{ questionId: "13", reason: "The image is unclear." }],
    };

    expect(parseSolveResponse(JSON.stringify(response), 1).questions).toEqual([
      { id: "1", label: "1", question: "Question one", answer: "Answer one", page: null },
      { id: "13", label: "13", question: "Question thirteen", answer: null, page: null, reason: "The image is unclear." },
    ]);
  });

  it("preserves answers longer than the old 500-character limit", () => {
    const longAnswer = `Start ${"explanation ".repeat(120)}finish.`;
    const response = {
      detectedQuestions: [{ id: "1", label: "1", question: "Explain in detail" }],
      answers: [{ questionId: "1", answer: longAnswer }],
      unanswered: [],
    };

    expect(parseSolveResponse(JSON.stringify(response), 1).questions[0].answer).toBe(longAnswer);
  });

  it("accepts only high-confidence in-bounds placement suggestions for valid PDF pages", () => {
    const response = {
      detectedQuestions: [
        { id: "1", label: "1", question: "1 + 1", page: 1 },
        { id: "2", label: "2", question: "2 + 2", page: 1 },
        { id: "3", label: "3", question: "3 + 3", page: 1 },
        { id: "4", label: "4", question: "4 + 4", page: 4 },
      ],
      answers: [
        { questionId: "1", answer: "2", page: 1, placement: { x: 0.1, y: 0.2, width: 0.2, height: 0.05, confidence: 0.98 } },
        { questionId: "2", answer: "4", page: 1, placement: { x: 0.1, y: 0.2, width: 0.2, height: 0.05, confidence: 0.7 } },
        { questionId: "3", answer: "6", page: 1, placement: { x: 0.9, y: 0.2, width: 0.2, height: 0.05, confidence: 0.99 } },
        { questionId: "4", answer: "8", page: 4, placement: { x: 0.1, y: 0.2, width: 0.2, height: 0.05, confidence: 0.99 } },
      ],
      unanswered: [],
    };

    expect(parseSolveResponse(JSON.stringify(response), 2).questions.map((item) => Boolean(item.placement))).toEqual([
      true, false, false, false,
    ]);
  });

  it("normalizes subscripts and common symbols for the built-in PDF font instead of replacing them with question marks", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);

    expect(normalizePdfText("H₂O ≤ 2", font)).toBe("H2O <= 2");
    expect(normalizePdfText("λ", font)).toBe("[U+03BB]");
  });

  it("exports every recognized question once, preserves labels, flags unanswered items, and wraps long answers", async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    const original = await source.save();
    const longAnswer = `LONGSTART ${"complete explanation ".repeat(130)} LONGEND`;
    const analysis: SolveAnalysis = {
      questions: [
        { id: "1", label: "1", question: "Question marker QREF1", answer: "H₂O", page: 1, placement: { x: 0.1, y: 0.2, width: 0.2, height: 0.06, confidence: 0.98 } },
        { id: "13", label: "13", question: "Question marker QREF13", answer: longAnswer, page: null },
        { id: "8a", label: "8a", question: "Table marker QREF8A", answer: null, page: null, reason: "The row is unclear." },
      ],
    };

    const output = await createSolvedPdf(original, analysis);
    const solved = await PDFDocument.load(output);
    const outputText = await extractPdfText(output);
    const exportedEntries = (outputText.match(/(?:Answer:|Unanswered:)/g) ?? []).length;

    expect(solved.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(exportedEntries).toBe(2);
    expect(outputText).not.toContain("1. Question marker QREF1");
    expect(outputText).toContain("13. Question marker QREF13");
    expect(outputText).toContain("8a. Table marker QREF8A");
    expect(outputText).not.toContain("13. 13.");
    expect(outputText).not.toContain("H?O");
    expect(outputText).toContain("LONGSTART");
    expect(outputText).toContain("LONGEND");
    expect(outputText).toContain("Unanswered: The row is unclear.");
    const firstPageText = await extractPdfText(output, 0);
    expect(firstPageText).toContain("H2O");
    expect((await PDFDocument.load(original)).getPageCount()).toBe(1);
  });

  it("rejects an incomplete analysis at export time", async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    const original = await source.save();

    await expect(createSolvedPdf(original, { questions: [] })).rejects.toMatchObject({ code: "incompleteResponse" });
  });
});
