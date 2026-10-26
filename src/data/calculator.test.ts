import { describe, expect, it } from "vitest";
import {
  evaluateExpression,
  formatCalculatorResult,
  parseCalculatorHistory,
} from "./calculator";

describe("calculator expression evaluation", () => {
  it("observes operator precedence, parentheses, signs, and implicit multiplication", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("-2^2")).toBe(-4);
    expect(evaluateExpression("2^3^2")).toBe(512);
    expect(evaluateExpression("2pi")).toBeCloseTo(2 * Math.PI);
    expect(evaluateExpression("3(2+1)")).toBe(9);
  });

  it("uses an explicit postfix percentage behavior", () => {
    expect(evaluateExpression("25%")).toBe(0.25);
    expect(evaluateExpression("200 + 10%")).toBe(200.1);
  });

  it("supports scientific functions, constants, and degree/radian modes", () => {
    expect(evaluateExpression("sqrt(81) + abs(-2)")).toBe(11);
    expect(evaluateExpression("sin(90)")).toBeCloseTo(1);
    expect(evaluateExpression("sin(pi/2)", "radians")).toBeCloseTo(1);
    expect(evaluateExpression("cos(0)")).toBe(1);
    expect(evaluateExpression("tan(45)")).toBeCloseTo(1);
    expect(evaluateExpression("log(1000)")).toBe(3);
    expect(evaluateExpression("ln(e)")).toBeCloseTo(1);
    expect(evaluateExpression("5!")).toBe(120);
    expect(evaluateExpression("recip(4)")).toBe(0.25);
    expect(evaluateExpression("2^3")).toBe(8);
    expect(evaluateExpression("pi")).toBe(Math.PI);
  });

  it("rejects invalid syntax, unsupported domains, and non-finite results", () => {
    for (const expression of ["", "1/0", "sqrt(-1)", "log(0)", "ln(-2)", "tan(90)", "(-1)!", "171!", "2+", "2 3", "1..2", "(2+3", "1)"]) {
      expect(() => evaluateExpression(expression), expression).toThrow();
    }
  });

  it("validates stored history and formats numeric results", () => {
    expect(parseCalculatorHistory('[{"id":"entry","expression":"1+1","result":2,"createdAt":3}]')).toEqual([
      { id: "entry", expression: "1+1", result: 2, createdAt: 3 },
    ]);
    expect(() => parseCalculatorHistory("invalid")).toThrow();
    expect(() => parseCalculatorHistory('[{"id":"entry","expression":"x","result":null,"createdAt":3}]')).toThrow();
    expect(formatCalculatorResult(0.1 + 0.2)).toBe("0.3");
  });
});
