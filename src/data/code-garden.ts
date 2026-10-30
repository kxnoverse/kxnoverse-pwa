import { db } from "./db";
import type { CodeGardenState } from "./db";

export type GardenTileKind = "soil" | "plant" | "ripe" | "stone" | "wood" | "empty";
export type GardenDirection = "north" | "east" | "south" | "west";
export type GardenActionName = "move" | "harvest" | "plant" | "collect" | "wait" | "turn";
export type GardenFeatureName = GardenActionName | "repeat" | "if" | "let" | "function" | "sensors";
export type GardenSensorName = "tile_is" | "energy_at_least" | "storage_has_room";
export type GardenAction = { kind: GardenActionName; argument?: string };
export interface GardenTile { x: number; y: number; kind: GardenTileKind; growth?: number }
export interface GardenDecision {
  actionIndex: number;
  sensor: GardenSensorName;
  argument: string | number;
  matched: boolean;
}
const MAX_GARDEN_STATEMENT_EXECUTIONS = 10_000;
export interface GardenRunStats {
  instructions: number;
  harvested: number;
  collected: number;
  energyConsumed: number;
  energyGenerated: number;
}
export interface GardenMission {
  id: string;
  concept: string;
  objective: string;
  hint: string;
  width: number;
  height: number;
  robot: { x: number; y: number; direction: GardenDirection };
  tiles: GardenTile[];
  goal: { kind: "harvest" | "collect"; count: number };
  reward: { plants?: number; wood?: number; stone?: number; seeds?: number; energy?: number };
  maxSteps: number;
  unlocks: GardenFeatureName[];
  requiresUpgrade?: string;
  energyBudget?: number;
  sensorTutorial?: boolean;
}
export interface GardenRunState {
  missionId: string;
  robot: { x: number; y: number; direction: GardenDirection };
  tiles: GardenTile[];
  resources: { plants: number; wood: number; stone: number; seeds: number; energy: number };
  harvested: number;
  collected: number;
  steps: number;
  completed: boolean;
  storageCapacity: number;
}

export function gardenCoordinatesAtPoint(
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } | null {
  const deltaX = (point.x - 380) / 48;
  const deltaY = (point.y - 42) / 25;
  const x = Math.round((deltaX + deltaY) / 2);
  const y = Math.round((deltaY - deltaX) / 2);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  const centerX = 380 + (x - y) * 48;
  const centerY = 42 + (x + y) * 25;
  const tileDistance = Math.abs((point.x - centerX) / 48) + Math.abs((point.y - centerY) / 25);
  return tileDistance <= 1 ? { x, y } : null;
}

export const GARDEN_MISSIONS: GardenMission[] = [
  {
    id: "first-harvest", concept: "movement", objective: "Reach the ripe plant and harvest it.",
    hint: 'Use move("east") twice, then harvest().',
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [{ x: 2, y: 2, kind: "ripe" }], goal: { kind: "harvest", count: 1 },
    reward: { plants: 3, seeds: 2, energy: 4 }, maxSteps: 16, unlocks: ["move", "harvest", "turn"],
  },
  {
    id: "repeat-the-row", concept: "loops", objective: "Harvest all three plants in a straight row.",
    hint: "A repeat block runs its instructions more than once. Move, then harvest, inside the block.",
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [{ x: 1, y: 2, kind: "ripe" }, { x: 2, y: 2, kind: "ripe" }, { x: 3, y: 2, kind: "ripe" }],
    goal: { kind: "harvest", count: 3 }, reward: { plants: 5, seeds: 2, energy: 5 }, maxSteps: 24,
    unlocks: ["move", "harvest", "turn", "repeat"],
  },
  {
    id: "read-the-ground", concept: "conditions", objective: "Move east across the patch and harvest only ripe plants.",
    hint: 'Check the tile with if (tile == "ripe") { harvest() }. The stone is safe to leave alone.',
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [{ x: 1, y: 2, kind: "ripe" }, { x: 2, y: 2, kind: "stone" }, { x: 3, y: 2, kind: "ripe" }],
    goal: { kind: "harvest", count: 2 }, reward: { plants: 6, wood: 2, stone: 2, energy: 6 }, maxSteps: 32,
    unlocks: ["move", "harvest", "turn", "repeat", "if"],
  },
  {
    id: "garden-routine", concept: "functions", objective: "Write a reusable harvest_row() routine and use it to collect the whole row.",
    hint: "Define function harvest_row() { ... } once, then call harvest_row() to run it.",
    width: 7, height: 5, robot: { x: 0, y: 1, direction: "east" },
    tiles: [{ x: 1, y: 1, kind: "ripe" }, { x: 2, y: 1, kind: "ripe" }, { x: 3, y: 1, kind: "ripe" }],
    goal: { kind: "harvest", count: 3 }, reward: { plants: 8, wood: 3, stone: 2, energy: 8 }, maxSteps: 40,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait"],
  },
  {
    id: "seed-cycle", concept: "variables", objective: "Plant, grow, and harvest a crop using a named repeat count.",
    hint: "Set let cycles = 2, then use repeat cycles { ... } to repeat your plant-and-wait routine.",
    width: 7, height: 5, robot: { x: 2, y: 2, direction: "east" },
    tiles: [], goal: { kind: "harvest", count: 2 }, reward: { plants: 10, wood: 4, energy: 10 }, maxSteps: 48,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait", "let"],
  },
  {
    id: "solar-relay", concept: "energy", objective: "Automate a long crop row with a limited energy reserve. Wait to recharge, then continue.",
    hint: "Your solar coil turns each wait() into energy. A repeat block can move and harvest each tile.",
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [1, 2, 3, 4].map((x) => ({ x, y: 2, kind: "ripe" as const })),
    goal: { kind: "harvest", count: 4 }, reward: { plants: 8, seeds: 3, energy: 6 }, maxSteps: 20,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait", "let", "function"],
    requiresUpgrade: "solar-coil",
    energyBudget: 3,
  },
  {
    id: "sensor-sweep", concept: "sensors", objective: "Scan a mixed row and harvest only the ripe plants. Empty soil and stone are safe to pass.",
    hint: 'First try tile_is("ripe") in an if condition. It reads the tile under the robot and returns true or false.',
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [
      { x: 1, y: 2, kind: "ripe" },
      { x: 2, y: 2, kind: "soil" },
      { x: 3, y: 2, kind: "ripe" },
      { x: 4, y: 2, kind: "stone" },
      { x: 5, y: 2, kind: "ripe" },
    ],
    goal: { kind: "harvest", count: 3 }, reward: { plants: 8, seeds: 2, energy: 5 }, maxSteps: 16,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait", "let", "function", "sensors"],
    requiresUpgrade: "field-scanner",
    sensorTutorial: true,
  },
];

export const GARDEN_RESEARCH = [
  {
    id: "storehouse",
    prerequisiteMission: "read-the-ground",
    cost: { wood: 2, stone: 1 },
  },
  {
    id: "solar-coil",
    prerequisiteMission: "seed-cycle",
    cost: { wood: 3, stone: 2 },
  },
  {
    id: "field-scanner",
    prerequisiteMission: "solar-relay",
    cost: { wood: 2, stone: 1 },
  },
] as const;
export type GardenResearchId = (typeof GARDEN_RESEARCH)[number]["id"];

export const DEFAULT_GARDEN_STATE: CodeGardenState = {
  id: "default",
  activeMissionId: GARDEN_MISSIONS[0].id,
  completedMissionIds: [],
  resources: { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 },
  upgrades: [],
  programs: {},
  updatedAt: 0,
};

type Token = { value: string; line: number; column: number };
type Expression = { kind: "number"; value: number } | { kind: "variable"; name: string };
type GardenCondition =
  | { kind: "tile"; expected: GardenTileKind }
  | { kind: "sensor"; name: "tile_is"; argument: GardenTileKind }
  | { kind: "sensor"; name: "energy_at_least"; argument: number }
  | { kind: "sensor"; name: "storage_has_room"; argument: "wood" | "stone" };
type Statement =
  | { kind: "call"; name: string; argument?: string }
  | { kind: "repeat"; count: Expression; body: Statement[] }
  | { kind: "if"; condition: GardenCondition; body: Statement[]; otherwise: Statement[] }
  | { kind: "let"; name: string; value: number }
  | { kind: "function"; name: string; body: Statement[] };
type Program = Statement[];

export class GardenLanguageError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) {
    super(message);
    this.name = "GardenLanguageError";
  }
}

function tokenize(source: string): Token[] {
  if (source.length > 12_000) throw new GardenLanguageError("Program is too long (12,000 characters maximum).", 1, 1);
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  while (index < source.length) {
    const character = source[index];
    if (character === "\n") { line += 1; column = 1; index += 1; continue; }
    if (/\s/.test(character)) { index += 1; column += 1; continue; }
    if (character === "#") {
      while (index < source.length && source[index] !== "\n") { index += 1; column += 1; }
      continue;
    }
    const startColumn = column;
    const start = index;
    if (/[A-Za-z_]/.test(character)) {
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) { index += 1; column += 1; }
      tokens.push({ value: source.slice(start, index), line, column: startColumn });
      continue;
    }
    if (/\d/.test(character)) {
      while (index < source.length && /\d/.test(source[index])) { index += 1; column += 1; }
      tokens.push({ value: source.slice(start, index), line, column: startColumn });
      continue;
    }
    if (character === '"' || character === "'") {
      index += 1;
      column += 1;
      while (index < source.length && source[index] !== character && source[index] !== "\n") { index += 1; column += 1; }
      if (source[index] !== character) throw new GardenLanguageError("Close this text value with a matching quote.", line, startColumn);
      index += 1;
      column += 1;
      tokens.push({ value: source.slice(start, index), line, column: startColumn });
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (pair === "==") { tokens.push({ value: pair, line, column }); index += 2; column += 2; continue; }
    if ("{}(),;=".includes(character)) { tokens.push({ value: character, line, column }); index += 1; column += 1; continue; }
    throw new GardenLanguageError(`I do not recognize "${character}".`, line, column);
  }
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Program { return this.block(false); }

  private peek(): Token | undefined { return this.tokens[this.index]; }
  private consume(): Token {
    const token = this.peek();
    if (!token) throw new GardenLanguageError("The program ended before this statement was complete.", 1, 1);
    this.index += 1;
    return token;
  }
  private accept(value: string): boolean {
    if (this.peek()?.value !== value) return false;
    this.index += 1;
    return true;
  }
  private expect(value: string): Token {
    const token = this.peek();
    if (!token || token.value !== value) throw new GardenLanguageError(`Expected "${value}".`, token?.line ?? 1, token?.column ?? 1);
    return this.consume();
  }
  private identifier(): Token {
    const token = this.consume();
    if (!/^[A-Za-z_]\w*$/.test(token.value)) throw new GardenLanguageError("Expected a name here.", token.line, token.column);
    return token;
  }
  private expression(): Expression {
    const token = this.consume();
    if (/^\d+$/.test(token.value)) return { kind: "number", value: Number(token.value) };
    if (/^[A-Za-z_]\w*$/.test(token.value)) return { kind: "variable", name: token.value };
    throw new GardenLanguageError("Use a number or a variable name here.", token.line, token.column);
  }
  private block(braced: boolean): Program {
    const statements: Program = [];
    if (braced) this.expect("{");
    while (this.peek() && (!braced || this.peek()?.value !== "}")) {
      statements.push(this.statement());
      if (statements.length > 500) throw new GardenLanguageError("This block has too many statements.", this.peek()?.line ?? 1, this.peek()?.column ?? 1);
      this.accept(";");
    }
    if (braced) this.expect("}");
    return statements;
  }
  private statement(): Statement {
    const token = this.consume();
    if (token.value === "let") {
      const name = this.identifier();
      this.expect("=");
      const value = this.consume();
      if (!/^\d+$/.test(value.value)) throw new GardenLanguageError("Variables currently hold whole numbers.", value.line, value.column);
      return { kind: "let", name: name.value, value: Number(value.value) };
    }
    if (token.value === "repeat") {
      this.expect("(");
      const count = this.expression();
      this.expect(")");
      return { kind: "repeat", count, body: this.block(true) };
    }
    if (token.value === "if") {
      this.expect("(");
      const sensed = this.consume();
      let condition: GardenCondition;
      if (sensed.value === "tile") {
        this.expect("==");
        const expected = this.consume();
        const value = expected.value.replace(/^["']|["']$/g, "");
        if (!["soil", "plant", "ripe", "stone", "wood", "empty"].includes(value)) {
          throw new GardenLanguageError("That is not a tile kind the robot can sense.", expected.line, expected.column);
        }
        condition = { kind: "tile", expected: value as GardenTileKind };
      } else {
        const sensors: GardenSensorName[] = ["tile_is", "energy_at_least", "storage_has_room"];
        if (!sensors.includes(sensed.value as GardenSensorName)) {
          throw new GardenLanguageError(`Unknown sensor "${sensed.value}". Use tile_is, energy_at_least, or storage_has_room.`, sensed.line, sensed.column);
        }
        const name = sensed.value as GardenSensorName;
        this.expect("(");
        const argument = this.consume();
        if (name === "energy_at_least") {
          if (!/^\d+$/.test(argument.value)) {
            throw new GardenLanguageError("energy_at_least() needs a whole-number energy amount.", argument.line, argument.column);
          }
          condition = { kind: "sensor", name, argument: Number(argument.value) };
        } else {
          const value = argument.value.replace(/^["']|["']$/g, "");
          const validValues = name === "tile_is"
            ? ["soil", "plant", "ripe", "stone", "wood", "empty"]
            : ["wood", "stone"];
          if (!validValues.includes(value)) {
            throw new GardenLanguageError(
              name === "tile_is"
                ? "tile_is() needs a tile kind: soil, plant, ripe, stone, wood, or empty."
                : 'storage_has_room() needs "wood" or "stone".',
              argument.line,
              argument.column,
            );
          }
          condition = name === "tile_is"
            ? { kind: "sensor", name, argument: value as GardenTileKind }
            : { kind: "sensor", name, argument: value as "wood" | "stone" };
        }
        this.expect(")");
      }
      this.expect(")");
      const body = this.block(true);
      const otherwise = this.accept("else") ? this.block(true) : [];
      return { kind: "if", condition, body, otherwise };
    }
    if (token.value === "function") {
      const name = this.identifier();
      this.expect("(");
      this.expect(")");
      return { kind: "function", name: name.value, body: this.block(true) };
    }
    if (!/^[A-Za-z_]\w*$/.test(token.value)) throw new GardenLanguageError("Expected a command or programming statement.", token.line, token.column);
    const name = token.value;
    this.expect("(");
    let argument: string | undefined;
    if (!this.accept(")")) {
      const value = this.consume();
      argument = value.value.replace(/^["']|["']$/g, "");
      this.expect(")");
    }
    return { kind: "call", name, argument };
  }
}

export function parseGardenProgram(source: string): Program {
  return new Parser(tokenize(source)).parse();
}

export function createGardenRun(mission: GardenMission, resources = DEFAULT_GARDEN_STATE.resources, upgrades: string[] = []): GardenRunState {
  const bonusCapacity = upgrades.includes("storehouse") ? 8 : 0;
  const stored = { ...DEFAULT_GARDEN_STATE.resources, ...resources };
  const capacity = 12 + bonusCapacity;
  return {
    missionId: mission.id,
    robot: { ...mission.robot },
    tiles: Array.from({ length: mission.width * mission.height }, (_, index) => {
      const x = index % mission.width;
      const y = Math.floor(index / mission.width);
      return mission.tiles.find((tile) => tile.x === x && tile.y === y) ?? { x, y, kind: "soil" as const };
    }),
    resources: {
      plants: Math.min(capacity, stored.plants),
      wood: Math.min(capacity, stored.wood),
      stone: Math.min(capacity, stored.stone),
      seeds: stored.seeds,
      energy: mission.energyBudget === undefined ? stored.energy : Math.min(stored.energy, mission.energyBudget),
    },
    harvested: 0,
    collected: 0,
    steps: 0,
    completed: false,
    storageCapacity: capacity,
  };
}

export interface GardenExecution {
  run: GardenRunState;
  actions: GardenAction[];
  frames: GardenRunState[];
  decisions: GardenDecision[];
  message: string;
  unlocks: GardenFeatureName[];
  stats: GardenRunStats;
}

export function executeGardenProgram(
  source: string,
  mission: GardenMission,
  startingRun: GardenRunState,
  maxActions = mission.maxSteps,
  upgrades: readonly string[] = [],
): GardenExecution {
  const ast = parseGardenProgram(source);
  const functions = new Map<string, Statement[]>();
  const program: Statement[] = [];
  for (const statement of ast) {
    if (statement.kind === "function") {
      if (functions.has(statement.name)) throw new GardenLanguageError(`Function "${statement.name}" is defined twice.`, 1, 1);
      functions.set(statement.name, statement.body);
    } else program.push(statement);
  }
  const run: GardenRunState = {
    ...startingRun,
    robot: { ...startingRun.robot },
    tiles: startingRun.tiles.map((tile) => ({ ...tile })),
    resources: { ...startingRun.resources },
    completed: false,
    storageCapacity: startingRun.storageCapacity,
  };
  const actions: GardenAction[] = [];
  const frames: GardenRunState[] = [];
  const decisions: GardenDecision[] = [];
  let energyConsumed = 0;
  let energyGenerated = 0;
  const variables = new Map<string, number>();
  const callStack: string[] = [];
  const permitted = new Set<GardenFeatureName>(mission.unlocks);
  let evaluatedStatements = 0;
  const tileAtRobot = () => run.tiles.find((tile) => tile.x === run.robot.x && tile.y === run.robot.y)!;
  const runBlock = (statements: Statement[], depth: number): void => {
    if (depth > 12) throw new Error("Program nesting is too deep (maximum 12).");
    for (const statement of statements) {
      evaluatedStatements += 1;
      if (evaluatedStatements > MAX_GARDEN_STATEMENT_EXECUTIONS) {
        throw new Error(`Instruction limit reached (${MAX_GARDEN_STATEMENT_EXECUTIONS} statements).`);
      }
      if (statement.kind === "function") continue;
      if (statement.kind === "let") {
        if (!permitted.has("let")) throw new Error("Variables unlock in a later mission.");
        variables.set(statement.name, statement.value);
        continue;
      }
      if (statement.kind === "repeat") {
        if (!permitted.has("repeat")) throw new Error("Loops unlock after the first mission.");
        const count = statement.count.kind === "number" ? statement.count.value : variables.get(statement.count.name);
        if (count === undefined) {
          const name = statement.count.kind === "variable" ? statement.count.name : "value";
          throw new Error(`Variable "${name}" has not been set.`);
        }
        if (count < 0 || count > 100) throw new Error("A repeat count must be between 0 and 100.");
        for (let index = 0; index < count; index += 1) runBlock(statement.body, depth + 1);
        continue;
      }
      if (statement.kind === "if") {
        if (!permitted.has("if")) throw new Error("Conditions unlock after the second mission.");
        let matches: boolean;
        if (statement.condition.kind === "tile") {
          matches = tileAtRobot().kind === statement.condition.expected;
        } else {
          if (!permitted.has("sensors") || !upgrades.includes("field-scanner")) {
            throw new Error("Environmental sensors require the Field scanner research.");
          }
          const { name, argument } = statement.condition;
          if (name === "tile_is") {
            matches = tileAtRobot().kind === argument;
          } else if (name === "energy_at_least") {
            matches = run.resources.energy >= argument;
          } else {
            matches = run.resources[argument] < run.storageCapacity;
          }
          decisions.push({ actionIndex: actions.length, sensor: name, argument, matched: matches });
        }
        runBlock(matches ? statement.body : statement.otherwise, depth + 1);
        continue;
      }
      if (functions.has(statement.name)) {
        if (!permitted.has("repeat")) throw new Error("Reusable functions unlock in a later mission.");
        if (callStack.includes(statement.name)) throw new Error("A function cannot call itself in this version.");
        if (callStack.length >= 8) throw new Error("Function calls are nested too deeply.");
        callStack.push(statement.name);
        runBlock(functions.get(statement.name)!, depth + 1);
        callStack.pop();
        continue;
      }
      if (!permitted.has(statement.name as GardenFeatureName)) {
        throw new Error(`"${statement.name}" is not unlocked in this mission.`);
      }
      if (!["move", "harvest", "plant", "collect", "wait", "turn"].includes(statement.name)) {
        throw new Error(`I do not know the command "${statement.name}".`);
      }
      if (actions.length >= maxActions) throw new Error(`Program limit reached (${maxActions} actions). Shorten the program and run it again.`);
      const action = { kind: statement.name as GardenActionName, argument: statement.argument } satisfies GardenAction;
      if (action.kind === "move") {
        const direction = action.argument ?? run.robot.direction;
        if (!["north", "east", "south", "west"].includes(direction)) throw new Error('move() needs "north", "east", "south", or "west".');
        const delta = direction === "north" ? [0, -1] : direction === "east" ? [1, 0] : direction === "south" ? [0, 1] : [-1, 0];
        const missionWidth = mission.width;
        const x = run.robot.x + delta[0];
        const y = run.robot.y + delta[1];
        if (x < 0 || x >= missionWidth || y < 0 || y >= mission.height) throw new Error("The robot reached the edge of this garden.");
        if (run.resources.energy <= 0) throw new Error("The robot needs more energy to keep moving.");
        run.robot = { ...run.robot, x, y, direction: direction as GardenDirection };
        run.resources.energy -= 1;
        energyConsumed += 1;
      } else if (action.kind === "turn") {
        if (action.argument !== "left" && action.argument !== "right") throw new Error('turn() needs "left" or "right".');
        const directions: GardenDirection[] = ["north", "east", "south", "west"];
        const current = directions.indexOf(run.robot.direction);
        run.robot.direction = directions[(current + (action.argument === "right" ? 1 : 3)) % directions.length];
      } else if (action.kind === "harvest") {
        const tile = tileAtRobot();
        if (tile.kind !== "ripe") throw new Error("There is no ripe crop under the robot. Move to a ripe plant first.");
        tile.kind = "soil";
        run.resources.plants += 1;
        run.harvested += 1;
      } else if (action.kind === "plant") {
        const tile = tileAtRobot();
        if (tile.kind !== "soil") throw new Error("Planting needs an empty soil tile.");
        if (run.resources.seeds < 1) throw new Error("The seed pouch is empty.");
        run.resources.seeds -= 1;
        tile.kind = "plant";
        tile.growth = 0;
      } else if (action.kind === "wait") {
        for (const tile of run.tiles) {
          if (tile.kind === "plant") {
            tile.growth = (tile.growth ?? 0) + 1;
            if (tile.growth >= 2) tile.kind = "ripe";
          }
        }
        if (upgrades.includes("solar-coil")) {
          const capacity = mission.energyBudget ?? 100;
          const charged = Math.min(capacity, run.resources.energy + 2);
          energyGenerated += charged - run.resources.energy;
          run.resources.energy = charged;
        }
      } else if (action.kind === "collect") {
        const tile = tileAtRobot();
        if (tile.kind !== "stone" && tile.kind !== "wood") throw new Error("There is nothing to collect on this tile.");
        const kind = tile.kind;
        const resource = kind === "wood" ? "wood" : "stone";
        if (run.resources[resource] >= run.storageCapacity) throw new Error("Storage is full. Upgrade the storehouse to carry more.");
        run.resources[resource] += 1;
        tile.kind = "soil";
        run.collected += 1;
      }
      actions.push(action);
      run.steps += 1;
      frames.push({
        ...run,
        robot: { ...run.robot },
        resources: { ...run.resources },
        tiles: run.tiles.map((tile) => ({ ...tile })),
      });
    }
  };
  try {
    runBlock(program, 0);
  } catch (error) {
    return {
      run: { ...run, tiles: run.tiles.map((tile) => ({ ...tile })), resources: { ...run.resources }, robot: { ...run.robot } },
      actions,
      frames,
      decisions,
      message: error instanceof Error ? error.message : "The program stopped unexpectedly.",
      unlocks: [],
      stats: {
        instructions: actions.length,
        harvested: run.harvested - startingRun.harvested,
        collected: run.collected - startingRun.collected,
        energyConsumed,
        energyGenerated,
      },
    };
  }
  const achieved = mission.goal.kind === "harvest" ? run.harvested : run.collected;
  run.completed = achieved >= mission.goal.count;
  return {
    run,
    actions,
    frames,
    decisions,
    message: run.completed ? `Mission complete: ${achieved}/${mission.goal.count}.` : `Mission progress: ${achieved}/${mission.goal.count}.`,
    unlocks: run.completed ? mission.unlocks : [],
    stats: {
      instructions: actions.length,
      harvested: run.harvested - startingRun.harvested,
      collected: run.collected - startingRun.collected,
      energyConsumed,
      energyGenerated,
    },
  };
}

export function getGardenSuggestions(
  source: string,
  mission: GardenMission,
  cursor = source.length,
  upgrades: readonly string[] = [],
): Array<{ insert: string; detail: string }> {
  const prefix = source.slice(0, cursor).match(/[A-Za-z_]\w*$/)?.[0] ?? "";
  const preceding = source.slice(0, cursor);
  const names: Array<[string, string]> = [];
  for (const action of mission.unlocks) {
    if (!["move", "harvest", "plant", "collect", "wait", "turn"].includes(action)) continue;
    const command = action as GardenActionName;
    const details: Record<GardenActionName, string> = {
      move: 'Move one tile: move("east")',
      harvest: "Harvest the ripe crop under the robot.",
      plant: "Plant one seed on soil.",
      collect: "Collect wood or stone from this tile.",
      wait: upgrades.includes("solar-coil") ? "Let crops grow and recharge 2 energy." : "Let planted crops grow.",
      turn: 'Turn in place: turn("left")',
    };
    names.push([`${action}()`, details[command]]);
  }
  if (mission.unlocks.includes("repeat")) names.push(["repeat (3) {", "Repeat a block of instructions."]);
  if (mission.unlocks.includes("if")) names.push(["if (tile == \"ripe\") {", "Run a block only when the tile matches."]);
  if (mission.unlocks.includes("let")) names.push(["let cycles = 2", "Store a whole-number value in a variable."]);
  if (mission.unlocks.includes("repeat")) names.push(["function harvest_row() {", "Create a named reusable routine."]);
  const sensorsAvailable = mission.unlocks.includes("sensors") && upgrades.includes("field-scanner");
  if (sensorsAvailable) {
    names.push(["tile_is()", "True when the tile under the robot matches a kind."]);
    names.push(["energy_at_least()", "True when the robot has at least this much energy."]);
    names.push(["storage_has_room()", "True when storage can hold more wood or stone."]);
  }
  const sensorArgument = preceding.match(/(tile_is|storage_has_room|energy_at_least)\(\s*["']?[\w]*$/)?.[1];
  const inArguments = /(?:move|turn)\(\s*["']?[\w]*$/.test(preceding);
  const sensorArgumentCandidates = sensorArgument === "tile_is"
    ? ["soil", "plant", "ripe", "stone", "wood", "empty"]
    : sensorArgument === "storage_has_room"
      ? ["wood", "stone"]
      : sensorArgument === "energy_at_least"
        ? ["1", "2", "3"]
        : [];
  const argumentCandidates = inArguments
    ? (preceding.includes("turn(") ? ["left", "right"] : ["north", "east", "south", "west"])
      .map((word) => [word, "Direction"] as [string, string])
    : sensorArgument
      ? sensorArgumentCandidates.map((word) => [word, "Sensor value"] as [string, string])
    : names;
  return argumentCandidates
    .filter(([insert]) => insert.toLowerCase().startsWith(prefix.toLowerCase()))
    .slice(0, 8)
    .map(([insert, detail]) => ({ insert, detail }));
}

export async function initializeCodeGarden(): Promise<CodeGardenState> {
  return db.transaction("rw", db.codeGardenState, async () => {
    const existing = await db.codeGardenState.get("default");
    if (existing) return existing;
    const initial = { ...DEFAULT_GARDEN_STATE, updatedAt: Date.now() };
    await db.codeGardenState.add(initial);
    return initial;
  });
}

export async function saveCodeGardenState(state: CodeGardenState): Promise<CodeGardenState> {
  const saved = { ...state, updatedAt: Date.now() };
  await db.codeGardenState.put(saved);
  return saved;
}

export async function researchGardenUpgrade(upgradeId: GardenResearchId): Promise<CodeGardenState> {
  const research = GARDEN_RESEARCH.find((entry) => entry.id === upgradeId);
  if (!research) throw new Error("That research is not available.");
  return db.transaction("rw", db.codeGardenState, async () => {
    const state = await db.codeGardenState.get("default") ?? { ...DEFAULT_GARDEN_STATE, updatedAt: Date.now() };
    if (state.upgrades.includes(upgradeId)) return state;
    if (!state.completedMissionIds.includes(research.prerequisiteMission)) {
      throw new Error("Complete the prerequisite mission before starting this research.");
    }
    if (state.resources.wood < research.cost.wood || state.resources.stone < research.cost.stone) {
      throw new Error(`This research needs ${research.cost.wood} wood and ${research.cost.stone} stone.`);
    }
    const saved: CodeGardenState = {
      ...state,
      resources: {
        ...state.resources,
        wood: state.resources.wood - research.cost.wood,
        stone: state.resources.stone - research.cost.stone,
      },
      upgrades: [...state.upgrades, upgradeId],
      updatedAt: Date.now(),
    };
    await db.codeGardenState.put(saved);
    return saved;
  });
}

export function isCodeGardenState(value: unknown): value is CodeGardenState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<CodeGardenState>;
  if (state.id !== "default" || typeof state.activeMissionId !== "string" ||
    !Array.isArray(state.completedMissionIds) || !state.completedMissionIds.every((id) => typeof id === "string") ||
    !Array.isArray(state.upgrades) || !state.upgrades.every((upgrade) => typeof upgrade === "string") ||
    typeof state.updatedAt !== "number" || !Number.isFinite(state.updatedAt) || !state.resources || typeof state.resources !== "object") return false;
  if (state.programs !== undefined && (!state.programs || typeof state.programs !== "object" || Array.isArray(state.programs) ||
    Object.entries(state.programs).some(([mission, program]) => !GARDEN_MISSIONS.some((entry) => entry.id === mission) ||
      typeof program !== "string" || program.length > 12_000))) return false;
  if (state.bestResults !== undefined && (!state.bestResults || typeof state.bestResults !== "object" || Array.isArray(state.bestResults) ||
    Object.entries(state.bestResults).some(([mission, result]) => !GARDEN_MISSIONS.some((entry) => entry.id === mission) ||
      !result || typeof result !== "object" ||
      ![result.instructions, result.harvested, result.collected, result.energyConsumed, result.energyGenerated]
        .every((amount) => Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000)))) return false;
  const resources = state.resources;
  if (!["plants", "wood", "stone", "seeds", "energy"].every((key) => {
    const amount = resources[key as keyof typeof resources];
    return typeof amount === "number" && Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000;
  })) return false;
  if (state.activeRun === undefined) return true;
  const run = state.activeRun;
  return Boolean(run && typeof run === "object" && typeof run.missionId === "string" &&
    run.robot && Number.isInteger(run.robot.x) && Number.isInteger(run.robot.y) &&
    ["north", "east", "south", "west"].includes(run.robot.direction) &&
    Array.isArray(run.tiles) && run.tiles.length <= 1_000 &&
    run.tiles.every((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y) &&
      ["soil", "plant", "ripe", "stone", "wood", "empty"].includes(tile.kind)) &&
    [run.harvested, run.collected, run.steps].every((count) => Number.isInteger(count) && count >= 0) &&
    Number.isInteger(run.storageCapacity) && run.storageCapacity >= 1 && run.storageCapacity <= 100 &&
    typeof run.completed === "boolean");
}
