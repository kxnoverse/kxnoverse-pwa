import { Chess, type Move, type Square } from "chess.js";

export type ChessDifficulty = "easy" | "normal" | "hard";
export interface ChessAiMove {
  from: string;
  to: string;
  promotion?: string;
}

const pieceValues: Record<string, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};

export function normalizeChessDifficulty(value: unknown): ChessDifficulty {
  return value === "easy" || value === "hard" ? value : "normal";
}

export function chessSearchDepth(difficulty: unknown): number {
  const level = normalizeChessDifficulty(difficulty);
  return level === "hard" ? 3 : level === "normal" ? 2 : 0;
}

function evaluatePosition(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -100_000 : 100_000;
  if (chess.isDraw()) return 0;

  let score = 0;
  for (const rank of "87654321") {
    for (const file of "abcdefgh") {
      const piece = chess.get(`${file}${rank}` as Square);
      if (!piece) continue;
      const sign = piece.color === "w" ? 1 : -1;
      const value = pieceValues[piece.type] ?? 0;
      const fileIndex = file.charCodeAt(0) - 97;
      const rankIndex = Number(rank) - 1;
      const centerDistance = Math.abs(fileIndex - 3.5) + Math.abs(rankIndex - 3.5);
      const advancement = piece.type === "p" ? (piece.color === "w" ? rankIndex : 7 - rankIndex) * 5 : 0;
      const centerBonus = piece.type === "n" || piece.type === "b" ? (7 - centerDistance) * 4 : 0;
      score += sign * (value + advancement + centerBonus);
    }
  }
  if (chess.isCheck()) score += chess.turn() === "w" ? -18 : 18;
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((left, right) => {
    const priority = (move: Move) =>
      (move.captured ? (pieceValues[move.captured] ?? 0) - (pieceValues[move.piece] ?? 0) / 10 : 0) +
      (move.promotion ? pieceValues[move.promotion] ?? 0 : 0);
    return priority(right) - priority(left);
  });
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number): number {
  if (depth <= 0 || chess.isGameOver()) return evaluatePosition(chess);
  const maximizing = chess.turn() === "w";
  let best = maximizing ? -Infinity : Infinity;
  for (const move of orderMoves(chess.moves({ verbose: true }))) {
    chess.move(move);
    const score = minimax(chess, depth - 1, alpha, beta);
    chess.undo();
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function findChessAiMove(
  fen: string,
  difficulty: unknown,
  random: () => number = Math.random,
): ChessAiMove | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const level = normalizeChessDifficulty(difficulty);
  if (level === "easy") {
    const sample = random();
    const choice = Number.isFinite(sample)
      ? Math.min(moves.length - 1, Math.max(0, Math.floor(sample * moves.length)))
      : 0;
    return moveToData(moves[choice]);
  }

  const depth = chessSearchDepth(level);
  const maximizing = chess.turn() === "w";
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMoves: Move[] = [];
  for (const move of orderMoves(moves)) {
    chess.move(move);
    const score = minimax(
      chess,
      depth - 1,
      maximizing ? bestScore : -Infinity,
      maximizing ? Infinity : bestScore,
    );
    chess.undo();
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) bestMoves.push(move);
  }
  const sample = random();
  const choiceIndex = Number.isFinite(sample)
    ? Math.min(bestMoves.length - 1, Math.max(0, Math.floor(sample * bestMoves.length)))
    : 0;
  const choice = bestMoves[choiceIndex];
  return moveToData(choice);
}

function moveToData(move: Move): ChessAiMove {
  return { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) };
}

interface ChessAiRequest {
  id: number;
  fen: string;
  difficulty: unknown;
}

interface ChessAiResponse {
  id: number;
  move: ChessAiMove | null;
  error?: string;
}

const workerScope = globalThis as typeof globalThis & {
  document?: unknown;
  onmessage?: (event: MessageEvent<ChessAiRequest>) => void;
  postMessage?: (message: ChessAiResponse) => void;
};

if (typeof workerScope.document === "undefined" && typeof workerScope.postMessage === "function") {
  workerScope.onmessage = (event: MessageEvent<ChessAiRequest>) => {
    const { id, fen, difficulty } = event.data;
    try {
      workerScope.postMessage?.({ id, move: findChessAiMove(fen, difficulty) });
    } catch {
      workerScope.postMessage?.({ id, move: null, error: "invalid-position" });
    }
  };
}
