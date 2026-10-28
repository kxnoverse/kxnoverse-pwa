import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createSolvedPdf, parseSolveResponse } from "./solve";

describe("Kxno Solve PDF helpers", () => {
  it("accepts only confident in-bounds placement suggestions", () => {
    const answers = parseSolveResponse(JSON.stringify({
      answers: [
        {
          question: "1 + 1",
          answer: "2",
          page: 1,
          placement: { x: 0.1, y: 0.2, width: 0.2, height: 0.05, confidence: 0.98 },
        },
        {
          question: "Explain the diagram",
          answer: "Not enough information",
          page: 1,
          placement: { x: 0.9, y: 0.2, width: 0.2, height: 0.05, confidence: 0.99 },
        },
        { question: "Uncertain position", answer: "Answer here", page: 1, placement: { x: 0.2, y: 0.2, width: 0.2, height: 0.05, confidence: 0.7 } },
      ],
    }), 1);

    expect(answers[0].placement).toEqual({ x: 0.1, y: 0.2, width: 0.2, height: 0.05, confidence: 0.98 });
    expect(answers[1].placement).toBeUndefined();
    expect(answers[2].placement).toBeUndefined();
  });

  it("rejects malformed or empty model responses instead of exporting guessed answers", () => {
    expect(() => parseSolveResponse("I could not read this worksheet.", 1)).toThrow("invalidResponse");
    expect(() => parseSolveResponse('{"answers":[]}', 1)).toThrow("invalidResponse");
    expect(() => parseSolveResponse('{"answers":[{"answer":""}]}', 1)).toThrow("invalidResponse");
    expect(() => parseSolveResponse('{"choices":[{"message":{"content":"not JSON"}}]}', 1)).toThrow("invalidResponse");
    expect(() => parseSolveResponse('{"answers":[{"question":"1 + 1"}]}', 1)).toThrow("invalidResponse");
    expect(parseSolveResponse('{"answers":[{"answer":"2","placement":{"x":0.1,"y":0.1,"width":0.2,"height":0.1}}]}', 1)[0].placement).toBeUndefined();
  });

  it("parses OpenRouter chat-completion wrappers and fenced JSON content", () => {
    const response = JSON.stringify({
      id: "gen-example",
      choices: [{
        message: {
          role: "assistant",
          content: "Here are the answers:\n```json\n{\"answers\":[{\"question\":\"1 + 1\",\"answer\":\"2\",\"page\":1}]}\n```",
        },
      }],
    });

    expect(parseSolveResponse(response, 1)).toMatchObject([
      { question: "1 + 1", answer: "2", page: 1 },
    ]);
  });

  it("normalizes common answer-list and content-part variations without inventing answers or coordinates", () => {
    const response = JSON.stringify({
      message: {
        content: [
          { type: "text", text: "```JSON\n" },
          { type: "text", text: '{"solutions":[{"exercise":"Question 4","solution":42,"page_number":"1","coordinates":{"x":0.1,"y":0.2,"width":0.3,"height":0.06,"confidence":0.98}},{"label":"Question 5","result":"Answer in list","page":1}]}' },
          { type: "text", text: "\n```" },
        ],
      },
    });

    expect(parseSolveResponse(response, 1)).toEqual([
      {
        id: "answer-1",
        question: "Question 4",
        answer: "42",
        page: 1,
        placement: { x: 0.1, y: 0.2, width: 0.3, height: 0.06, confidence: 0.98 },
      },
      {
        id: "answer-2",
        question: "Question 5",
        answer: "Answer in list",
        page: 1,
      },
    ]);
  });

  it("keeps the original pages and appends an editable-answer sheet when placement is uncertain", async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    const original = await source.save();
    const answers = parseSolveResponse(JSON.stringify({
      answers: [{ question: "Exercise 1", answer: "Die Lösung ist 42.", page: null }],
    }), 1);

    const output = await createSolvedPdf(original, answers);
    const solved = await PDFDocument.load(output);
    const untouchedOriginal = await PDFDocument.load(original);

    expect(solved.getPageCount()).toBe(2);
    expect(untouchedOriginal.getPageCount()).toBe(1);
    expect(output.byteLength).toBeGreaterThan(original.byteLength);
  });

  it("overlays confidently placed answers without adding pages", async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    const original = await source.save();
    const answers = parseSolveResponse(JSON.stringify({
      answers: [{
        question: "2 + 2",
        answer: "4",
        page: 1,
        placement: { x: 0.2, y: 0.3, width: 0.3, height: 0.06, confidence: 0.99 },
      }],
    }), 1);

    const output = await createSolvedPdf(original, answers);
    expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
    expect(output.byteLength).toBeGreaterThan(original.byteLength);
  });
});
