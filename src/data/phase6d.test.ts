import { describe, expect, it } from "vitest";
import {
  checkCrosswordEntry,
  createCrosswordPuzzle,
  createCrosswordSession,
  validateCrosswordPuzzle,
  type CrosswordDifficulty,
} from "./phase6d/crossword-infinite";
import {
  advanceColorLudoRandom,
  chooseColorLudoMove,
  createColorLudo,
  ludoTokenRingPosition,
  moveColorLudoToken,
  rollColorLudo,
  validateColorLudoState,
  type ColorLudoState,
} from "./phase6d/color-ludo";
import {
  chooseColorClashAiAction,
  createColorClash,
  drawClashCard,
  getPlayableClashCards,
  passClashTurn,
  playClashCard,
  runColorClashAiTurn,
  takeClashPenalty,
  validateColorClashState,
  type ClashCard,
  type ColorClashState,
} from "./phase6d/color-clash";

function arrangeClash(
  state: ColorClashState,
  handIds: string[],
  discardId: string,
  updates: Partial<ColorClashState> = {},
): ColorClashState {
  const cards = [...state.players.flatMap((player) => player.hand), ...state.drawPile, ...state.discardPile];
  const selectedIds = new Set([...handIds, discardId]);
  const findCard = (id: string) => {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`Missing test card ${id}.`);
    return card;
  };
  const hand = handIds.map(findCard);
  const discard = findCard(discardId);
  const remainder = cards.filter((card) => !selectedIds.has(card.id));
  return {
    ...state,
    ...updates,
    players: state.players.map((player, index) => ({ ...player, hand: index === 0 ? hand : [] })),
    activePlayer: 0,
    direction: updates.direction ?? 1,
    currentColor: updates.currentColor ?? discard.color ?? "coral",
    drawPile: remainder,
    discardPile: [discard],
    pendingDraw: updates.pendingDraw ?? 0,
    hasDrawn: updates.hasDrawn ?? false,
    drawnCardId: updates.drawnCardId ?? null,
    phase: "play",
    winner: null,
  };
}

function cardIds(cards: ClashCard[]) {
  return cards.map((card) => card.id);
}

describe("Crossword Infinite generation", () => {
  it("creates reproducible, connected, valid puzzles at every difficulty", () => {
    const difficulties: CrosswordDifficulty[] = ["easy", "medium", "hard", "expert"];
    for (const [index, difficulty] of difficulties.entries()) {
      for (let offset = 0; offset < 10; offset += 1) {
        const seed = 6200 + index * 10 + offset;
        const puzzle = createCrosswordPuzzle(difficulty, seed);
        expect(validateCrosswordPuzzle(puzzle)).toBe(true);
        if (offset === 0) {
          expect(createCrosswordPuzzle(difficulty, seed).fingerprint).toBe(puzzle.fingerprint);
        }
        expect(new Set(puzzle.entries.map((entry) => entry.answer)).size).toBe(puzzle.entries.length);
        expect(puzzle.entries.length).toBeGreaterThanOrEqual([6, 7, 8, 9][index]);
        expect(puzzle.rows).toBeLessThanOrEqual([11, 13, 15, 17][index]);
        expect(puzzle.columns).toBeLessThanOrEqual([11, 13, 15, 17][index]);
        expect(puzzle.entries.filter((entry) => entry.tier === index + 1).length).toBeGreaterThanOrEqual([0, 1, 2, 3][index]);
        expect(puzzle.entries.every((entry) => /^[A-Z]+$/.test(entry.answer))).toBe(true);
      }
    }
  }, 15_000);

  it("accepts solved entries and records incorrect answers as mistakes", () => {
    const puzzle = createCrosswordPuzzle("easy", 715);
    const session = createCrosswordSession(puzzle, 1000);
    const entry = puzzle.entries[0];
    let letters = { ...session.letters };
    for (let index = 0; index < entry.answer.length; index += 1) {
      const row = entry.row + (entry.direction === "down" ? index : 0);
      const column = entry.column + (entry.direction === "across" ? index : 0);
      letters[`${row},${column}`] = entry.answer[index];
    }
    const checked = checkCrosswordEntry({ ...session, letters }, entry.id);
    expect(checked.correct).toBe(true);
    expect(checked.session.mistakes).toBe(0);
    const wrong = checkCrosswordEntry({ ...session, letters: { ...letters, [`${entry.row},${entry.column}`]: "Z" } }, entry.id);
    expect(wrong.correct).toBe(false);
    expect(wrong.session.mistakes).toBe(1);
  });
});

function stateWithMove(
  progress: number[],
  activePlayer = 0,
  dice = 1,
  otherProgress: number[] = [-1, -1, -1, -1],
): ColorLudoState {
  const game = createColorLudo("local", 2, "normal", 42);
  const players = game.players.map((player, index) => ({
    ...player,
    tokens: index === activePlayer ? progress : otherProgress,
  }));
  return {
    ...game,
    players,
    activePlayer,
    phase: "move",
    dice,
    legalTokens: progress.flatMap((position, index) =>
      position !== 57 && (position === -1 ? dice === 6 : position + dice <= 57) ? [index] : []),
  };
}

describe("Color Ludo rules", () => {
  it("starts a token on six and grants an extra roll", () => {
    const initial = createColorLudo("local", 2, "normal", 42);
    const rolled = rollColorLudo(initial, 6);
    expect(rolled.phase).toBe("move");
    expect(rolled.dice).toBe(6);
    expect(rolled.legalTokens).toContain(0);
    const moved = moveColorLudoToken(rolled, 0).state;
    expect(moved.players[0].tokens[0]).toBe(0);
    expect(moved.activePlayer).toBe(0);
    expect(moved.phase).toBe("roll");
    expect(validateColorLudoState(moved)).toBe(true);
  });

  it("captures on unsafe spaces but protects tokens on safe spaces", () => {
    const capturing = stateWithMove([9, -1, -1, -1], 0, 1, [49, -1, -1, -1]);
    expect(ludoTokenRingPosition(capturing.players[1], 49)).toBe(10);
    const captured = moveColorLudoToken(capturing, 0);
    expect(captured.captured).toEqual([1]);
    expect(captured.state.players[1].tokens[0]).toBe(-1);
    const safe = stateWithMove([7, -1, -1, -1], 0, 1, [47, -1, -1, -1]);
    const protectedMove = moveColorLudoToken(safe, 0);
    expect(protectedMove.captured).toEqual([]);
    expect(protectedMove.state.players[1].tokens[0]).toBe(47);
  });

  it("requires an exact roll to finish and recognizes a complete win", () => {
    const oneRemaining = stateWithMove([57, 57, 57, 56], 0, 1);
    const won = moveColorLudoToken(oneRemaining, 3);
    expect(won.finished).toBe(true);
    expect(won.state).toMatchObject({ phase: "won", winner: 0 });
    expect(validateColorLudoState(won.state)).toBe(true);
    const overshoot = rollColorLudo({ ...oneRemaining, phase: "roll", dice: null, legalTokens: [] }, 2);
    expect(overshoot.phase).toBe("roll");
    expect(overshoot.activePlayer).toBe(1);
  });

  it("forfeits a third consecutive six and keeps AI choices legal", () => {
    let game = { ...createColorLudo("local", 2, "normal", 42), consecutiveSixes: 2 };
    game = rollColorLudo(game, 6);
    expect(game.activePlayer).toBe(1);
    expect(game.consecutiveSixes).toBe(0);
    const computer = createColorLudo("computer", 2, "hard", 7);
    const afterRoll = rollColorLudo(computer, 6);
    const move = chooseColorLudoMove(afterRoll, () => 0);
    expect(move).toBe(0);
    expect(afterRoll.legalTokens).toContain(move);
  });

  it("finishes complete AI matches using only legal moves", () => {
    for (const seed of [5401, 5402]) {
      let state = createColorLudo("computer", 2, "hard", seed);
      let step = 0;
      while (state.phase !== "won" && step < 8000) {
        if (state.phase === "roll") {
          const result = advanceColorLudoRandom(state);
          state = rollColorLudo(result.state, result.roll);
        } else {
          const token = chooseColorLudoMove(state, () => ((seed + step * 31) % 997) / 997);
          expect(token).not.toBeNull();
          expect(state.legalTokens).toContain(token);
          state = moveColorLudoToken(state, token!).state;
        }
        expect(validateColorLudoState(state)).toBe(true);
        step += 1;
      }
      expect(state.phase).toBe("won");
      expect(state.winner).not.toBeNull();
    }
  });
});

describe("Color Clash rules", () => {
  it("creates reproducible 104-card decks and accepts save/restore", () => {
    const first = createColorClash("computer", 4, "hard", true, 43021);
    const repeated = createColorClash("computer", 4, "hard", true, 43021);
    const cards = [...first.players.flatMap((player) => player.hand), ...first.drawPile, ...first.discardPile];
    expect(cards).toHaveLength(104);
    expect(new Set(cards.map((card) => card.id)).size).toBe(104);
    expect(JSON.stringify(first)).toBe(JSON.stringify(repeated));
    expect(validateColorClashState(JSON.parse(JSON.stringify(first)))).toBe(true);
    const duplicate = { ...first, discardPile: [...first.discardPile, first.drawPile[0]] };
    expect(validateColorClashState(duplicate)).toBe(false);
  });

  it("matches by color, number, action type, and wild while rejecting unrelated cards", () => {
    const base = createColorClash("local", 2, "normal", false, 21);
    const numberMatch = arrangeClash(base, ["blue-5-a", "coral-2-a", "wild-1"], "coral-5-a");
    expect(cardIds(getPlayableClashCards(numberMatch))).toEqual(["blue-5-a", "coral-2-a", "wild-1"]);
    const actionMatch = arrangeClash(base, ["blue-skip-a", "blue-8-a"], "coral-skip-a");
    expect(cardIds(getPlayableClashCards(actionMatch))).toEqual(["blue-skip-a"]);
    expect(playClashCard(actionMatch, "blue-skip-a").state.activePlayer).toBe(0);
    expect(playClashCard(numberMatch, "wild-1").error).toBe("Choose a color for the Wild card.");
    expect(playClashCard(numberMatch, "wild-1", "green").state.currentColor).toBe("green");
    expect(playClashCard(numberMatch, "blue-5-a").error).toBeUndefined();
  });

  it("draws when blocked and restricts play to the newly drawn card", () => {
    const state = arrangeClash(
      createColorClash("local", 2, "normal", false, 91),
      ["blue-4-a"],
      "coral-5-a",
    );
    expect(getPlayableClashCards(state)).toHaveLength(0);
    const drawn = drawClashCard(state);
    expect(drawn.error).toBeUndefined();
    expect(drawn.state.hasDrawn).toBe(true);
    expect(drawn.state.drawnCardId).not.toBeNull();
    expect(getPlayableClashCards(drawn.state).every((card) => card.id === drawn.state.drawnCardId)).toBe(true);
    expect(getPlayableClashCards(drawn.state).some((card) => card.id === "blue-4-a")).toBe(false);
    const passed = passClashTurn(drawn.state);
    expect(passed.error).toBeUndefined();
    expect(passed.state.activePlayer).toBe(1);
    expect(passClashTurn(state).error).toBeTruthy();
  });

  it("applies Skip, Reverse, Draw Two, stacking, and declined penalties", () => {
    const base = createColorClash("local", 3, "normal", false, 72);
    const skipped = playClashCard(arrangeClash(base, ["coral-skip-a", "blue-8-a"], "coral-5-a"), "coral-skip-a").state;
    expect(skipped.activePlayer).toBe(2);
    const reversed = playClashCard(arrangeClash(base, ["coral-reverse-a", "blue-8-a"], "coral-5-a"), "coral-reverse-a").state;
    expect(reversed).toMatchObject({ activePlayer: 2, direction: -1 });
    const twoPlayerReverse = playClashCard(
      arrangeClash(createColorClash("local", 2, "normal", false, 8), ["coral-reverse-a", "blue-8-a"], "coral-5-a"),
      "coral-reverse-a",
    ).state;
    expect(twoPlayerReverse.activePlayer).toBe(0);

    const penalty = playClashCard(arrangeClash(base, ["coral-drawTwo-a", "blue-8-a"], "coral-5-a"), "coral-drawTwo-a").state;
    expect(penalty.activePlayer).toBe(2);
    expect(penalty.players[1].hand).toHaveLength(2);
    expect(penalty.pendingDraw).toBe(0);

    const stackedBase = createColorClash("local", 3, "normal", true, 14);
    const stacked = arrangeClash(stackedBase, ["blue-drawTwo-a", "blue-8-a"], "coral-drawTwo-a", {
      currentColor: "coral",
      pendingDraw: 2,
    });
    expect(cardIds(getPlayableClashCards(stacked))).toContain("blue-drawTwo-a");
    const stackedResult = playClashCard(stacked, "blue-drawTwo-a").state;
    expect(stackedResult).toMatchObject({ activePlayer: 1, pendingDraw: 4, currentColor: "blue" });
    const declined = takeClashPenalty(stackedResult);
    expect(declined.error).toBeUndefined();
    expect(declined.state.players[1].hand).toHaveLength(4);
    expect(declined.state).toMatchObject({ activePlayer: 2, pendingDraw: 0 });
  });

  it("ends the match when the final card is played and keeps AI turns legal", () => {
    const state = arrangeClash(
      createColorClash("local", 2, "normal", false, 5),
      ["coral-5-a"],
      "coral-5-b",
    );
    const won = playClashCard(state, "coral-5-a").state;
    expect(won).toMatchObject({ phase: "won", winner: 0 });
    expect(validateColorClashState(won)).toBe(true);

    let ai = createColorClash("computer", 2, "hard", true, 1);
    for (let seed = 1; seed <= 100 && getPlayableClashCards(ai).length === 0; seed += 1) {
      ai = createColorClash("computer", 2, "hard", true, seed);
    }
    ai = { ...ai, players: ai.players.map((player) => ({ ...player, kind: "computer" as const })) };
    const action = chooseColorClashAiAction(ai);
    expect(action.type).toBe("play");
    const afterAi = runColorClashAiTurn(ai);
    expect(afterAi.rngState).not.toBe(ai.rngState);
    expect(validateColorClashState(afterAi)).toBe(true);

    let steps = 0;
    while (ai.phase !== "won" && steps < 1200) {
      ai = runColorClashAiTurn(ai);
      expect(validateColorClashState(ai)).toBe(true);
      steps += 1;
    }
    expect(ai.phase).toBe("won");
    expect(ai.winner).not.toBeNull();
  }, 15_000);
});
