export type AngleUnit = "degrees" | "radians";

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "left" | "right" | "end"; value: string };

const functions = new Set(["sqrt", "sin", "cos", "tan", "log", "ln", "abs", "recip"]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new Error("Number is outside the supported range.");
      tokens.push({ type: "number", value });
      index += number[0].length;
      continue;
    }
    const identifier = /^(?:[a-zA-Z]+|π)/.exec(rest);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0].toLowerCase() === "π" ? "pi" : identifier[0].toLowerCase() });
      index += identifier[0].length;
      continue;
    }
    const character = source[index];
    if ("+-*/^!%".includes(character)) tokens.push({ type: "operator", value: character });
    else if (character === "(") tokens.push({ type: "left", value: character });
    else if (character === ")") tokens.push({ type: "right", value: character });
    else throw new Error(`Unsupported character: ${character}`);
    index += 1;
  }
  tokens.push({ type: "end", value: "" });
  return tokens;
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 170) {
    throw new Error("Factorial is defined here for integers from 0 to 170.");
  }
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

function applyFunction(name: string, value: number, angleUnit: AngleUnit): number {
  if (!functions.has(name)) throw new Error(`Unknown function: ${name}`);
  if (name === "sqrt" && value < 0) throw new Error("Square root needs a nonnegative value.");
  if (name === "log" && value <= 0) throw new Error("Logarithm needs a positive value.");
  if (name === "ln" && value <= 0) throw new Error("Natural logarithm needs a positive value.");
  if (name === "recip" && value === 0) throw new Error("Cannot divide by zero.");
  const radians = angleUnit === "degrees" ? value * Math.PI / 180 : value;
  switch (name) {
    case "sqrt": return Math.sqrt(value);
    case "sin": return Math.sin(radians);
    case "cos": return Math.cos(radians);
    case "tan":
      if (Math.abs(Math.cos(radians)) < 1e-12) throw new Error("Tangent is undefined at this angle.");
      return Math.tan(radians);
    case "log": return Math.log10(value);
    case "ln": return Math.log(value);
    case "abs": return Math.abs(value);
    case "recip": return 1 / value;
  }
  throw new Error(`Unknown function: ${name}`);
}

export function evaluateExpression(source: string, angleUnit: AngleUnit = "degrees"): number {
  const tokens = tokenize(source);
  if (tokens.length === 1) throw new Error("Enter an expression.");
  let cursor = 0;
  const current = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  function parsePrimary(): number {
    const token = consume();
    if (token.type === "number") return token.value;
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      const value = parseExpression(25);
      return token.value === "-" ? -value : value;
    }
    if (token.type === "left") {
      const value = parseExpression(0);
      if (current().type !== "right") throw new Error("Missing closing parenthesis.");
      consume();
      return value;
    }
    if (token.type === "identifier") {
      if (token.value === "pi") return Math.PI;
      if (token.value === "e") return Math.E;
      if (!functions.has(token.value)) throw new Error(`Unknown constant or function: ${token.value}`);
      if (current().type !== "left") throw new Error(`${token.value} needs parentheses.`);
      consume();
      const argument = parseExpression(0);
      if (current().type !== "right") throw new Error("Missing closing parenthesis.");
      consume();
      return applyFunction(token.value, argument, angleUnit);
    }
    throw new Error("Expected a number, constant, or parenthesized expression.");
  }

  function parseExpression(minimumPrecedence: number): number {
    let left = parsePrimary();
    while (true) {
      const token = current();
      if (token.type === "operator" && (token.value === "!" || token.value === "%")) {
        if (40 < minimumPrecedence) break;
        consume();
        left = token.value === "!" ? factorial(left) : left / 100;
        continue;
      }

      const explicitOperator = token.type === "operator" && ["+", "-", "*", "/", "^"].includes(token.value)
        ? token.value
        : null;
      const implicitProduct = token.type === "identifier" || token.type === "left";
      const operator = explicitOperator ?? (implicitProduct ? "*" : null);
      if (!operator) break;
      const precedence = operator === "+" || operator === "-" ? 10 : operator === "*" || operator === "/" ? 20 : 30;
      if (precedence < minimumPrecedence) break;
      if (explicitOperator) consume();
      const right = parseExpression(operator === "^" ? precedence : precedence + 1);
      if (operator === "+") left += right;
      else if (operator === "-") left -= right;
      else if (operator === "*") left *= right;
      else if (operator === "/") {
        if (right === 0) throw new Error("Cannot divide by zero.");
        left /= right;
      } else left = left ** right;
      if (!Number.isFinite(left)) throw new Error("Result is outside the supported range.");
    }
    return left;
  }

  const result = parseExpression(0);
  if (current().type !== "end") {
    if (current().type === "right") throw new Error("Unexpected closing parenthesis.");
    throw new Error("Check the expression and operators.");
  }
  if (!Number.isFinite(result)) throw new Error("Result is outside the supported range.");
  return Object.is(result, -0) ? 0 : result;
}

export interface CalculatorHistoryEntry {
  id: string;
  expression: string;
  result: number;
  createdAt: number;
}

function isCalculatorHistoryEntry(value: unknown): value is CalculatorHistoryEntry {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "expression" in value && typeof value.expression === "string" &&
    "result" in value && typeof value.result === "number" && Number.isFinite(value.result) &&
    "createdAt" in value && typeof value.createdAt === "number" && Number.isFinite(value.createdAt);
}

export function parseCalculatorHistory(value: string): CalculatorHistoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Saved calculator history is not valid JSON.");
  }
  if (!Array.isArray(parsed) || !parsed.every(isCalculatorHistoryEntry)) {
    throw new Error("Saved calculator history has an invalid format.");
  }
  return parsed.filter(isCalculatorHistoryEntry);
}

export function formatCalculatorResult(value: number): string {
  return Number(value.toPrecision(12)).toString();
}
