import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { chessSearchDepth, findChessAiMove, normalizeChessDifficulty } from "./chess-ai.worker";
import { formatClock, restoreSavedGame, tickChessClock } from "../pages/ChessGame";

describe("standard chess rules", () => {
  it("allows castling only when the king's path is not attacked", () => {
    const open = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(open.moves()).toContain("O-O");
    expect(open.moves()).toContain("O-O-O");

    const attackedPath = new Chess("4kr1r/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(attackedPath.moves()).not.toContain("O-O");
    expect(attackedPath.moves()).toContain("O-O-O");
  });

  it("supports en passant and removes the captured pawn", () => {
    const chess = new Chess();
    for (const san of ["e4", "a6", "e5", "d5"]) chess.move(san);
    const capture = chess.moves({ square: "e5", verbose: true }).find((move) => move.to === "d6");
    expect(capture?.isEnPassant()).toBe(true);
    chess.move({ from: "e5", to: "d6" });
    expect(chess.get("d5")).toBeUndefined();
    expect(chess.get("d6")).toMatchObject({ type: "p", color: "w" });
  });

  it("offers all standard promotion choices", () => {
    const chess = new Chess("8/P7/8/8/8/8/8/4k2K w - - 0 1");
    const promotions = chess.moves({ square: "a7", verbose: true }).filter((move) => move.to === "a8");
    expect(promotions.map((move) => move.promotion).sort()).toEqual(["b", "n", "q", "r"]);
    chess.move({ from: "a7", to: "a8", promotion: "n" });
    expect(chess.get("a8")).toMatchObject({ type: "n", color: "w" });
  });

  it("recognizes checkmate and stalemate", () => {
    const mate = new Chess();
    for (const san of ["f3", "e5", "g4", "Qh4#"]) mate.move(san);
    expect(mate.isCheckmate()).toBe(true);
    expect(mate.isGameOver()).toBe(true);

    const stalemate = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(stalemate.isStalemate()).toBe(true);
    expect(stalemate.isCheck()).toBe(false);
  });

  it("detects threefold repetition and fifty-move draws", () => {
    const repeated = new Chess();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (const san of ["Nf3", "Nf6", "Ng1", "Ng8"]) repeated.move(san);
    }
    expect(repeated.isThreefoldRepetition()).toBe(true);
    expect(repeated.isDraw()).toBe(true);

    const fiftyMovePosition = new Chess("8/8/8/8/8/8/4k3/7K w - - 100 51");
    expect(fiftyMovePosition.isDrawByFiftyMoves()).toBe(true);
  });

  it("detects insufficient mating material", () => {
    const chess = new Chess("8/8/8/8/8/8/4k3/7K w - - 0 1");
    expect(chess.isInsufficientMaterial()).toBe(true);
  });

  it("undoes moves and restores an unfinished saved game with its move history", () => {
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    expect(chess.undo()?.san).toBe("e5");
    chess.move("e5");
    const saved = restoreSavedGame(JSON.stringify({
      pgn: chess.pgn(),
      fen: chess.fen(),
      mode: "local",
      difficulty: "normal",
      orientation: "b",
      clockPreset: 5,
      remaining: { w: 240, b: 238 },
      clockHistory: [{ w: 300, b: 300 }],
    }));
    expect(saved?.chess.fen()).toBe(chess.fen());
    expect(saved?.chess.history()).toEqual(["e4", "e5"]);
    expect(saved?.saved.remaining).toEqual({ w: 240, b: 238 });
    expect(saved?.saved.orientation).toBe("b");
    expect(restoreSavedGame("{broken")).toBeNull();
  });

  it("ticks chess clocks without underflow and formats the supported presets", () => {
    expect(tickChessClock({ w: 10, b: 20 }, "w", 3.5)).toEqual({ w: 6.5, b: 20 });
    expect(tickChessClock({ w: 1, b: 20 }, "w", 4)).toEqual({ w: 0, b: 20 });
    expect(tickChessClock({ w: null, b: null }, "b", 10)).toEqual({ w: null, b: null });
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(null)).toBe("∞");
  });
});

describe("chess computer", () => {
  it.each(["easy", "normal", "hard"] as const)("returns a legal %s move", (difficulty) => {
    const chess = new Chess();
    const move = findChessAiMove(chess.fen(), difficulty, () => 0);
    expect(move).not.toBeNull();
    expect(chess.moves({ verbose: true }).some((legal) =>
      legal.from === move?.from && legal.to === move?.to &&
      (legal.promotion ?? undefined) === move?.promotion)).toBe(true);
  });

  it("normalizes difficulty values to known levels with distinct search depths", () => {
    expect(normalizeChessDifficulty("easy")).toBe("easy");
    expect(normalizeChessDifficulty("hard")).toBe("hard");
    expect(normalizeChessDifficulty("unexpected")).toBe("normal");
    expect(chessSearchDepth("easy")).toBe(0);
    expect(chessSearchDepth("normal")).toBe(2);
    expect(chessSearchDepth("hard")).toBe(3);
  });

  it("changes its move selection between random easy play and searched play", () => {
    const chess = new Chess();
    const easy = findChessAiMove(chess.fen(), "easy", () => 0);
    const normal = findChessAiMove(chess.fen(), "normal", () => 0);
    expect(easy).not.toEqual(normal);
  });

  it("returns no move for terminal positions", () => {
    expect(findChessAiMove("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "hard")).toBeNull();
  });
});
