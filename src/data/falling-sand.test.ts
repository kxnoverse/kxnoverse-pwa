import { describe, expect, it } from "vitest";
import {
  countSandParticles,
  createSandWorld,
  heatSandBrush,
  loadSandPreset,
  paintSandBrush,
  restoreSandScene,
  SAND_GRID_CELLS,
  SAND_MATERIALS,
  serializeSandScene,
  setSandWind,
  stepSandWorld,
  type SandMaterial,
} from "./falling-sand";

function put(world: ReturnType<typeof createSandWorld>, x: number, y: number, material: SandMaterial) {
  paintSandBrush(world, x, y, 1, material, () => 0);
}

describe("Falling Sand Lab simulation", () => {
  it("falls, settles, and piles sand around solid stone", () => {
    const world = createSandWorld(7, 7);
    put(world, 3, 1, SAND_MATERIALS.sand);
    put(world, 3, 6, SAND_MATERIALS.stone);
    for (let frame = 0; frame < 5; frame += 1) stepSandWorld(world, () => 0.25);
    expect(world.cells[6 * world.width + 2] === SAND_MATERIALS.sand ||
      world.cells[6 * world.width + 4] === SAND_MATERIALS.sand).toBe(true);
    expect(world.cells[6 * world.width + 3]).toBe(SAND_MATERIALS.stone);

    const pile = createSandWorld(7, 7);
    put(pile, 3, 4, SAND_MATERIALS.sand);
    put(pile, 3, 5, SAND_MATERIALS.stone);
    stepSandWorld(pile, () => 0.25);
    expect(pile.cells[5 * pile.width + 2] === SAND_MATERIALS.sand ||
      pile.cells[5 * pile.width + 4] === SAND_MATERIALS.sand).toBe(true);
  });

  it("flows water around a blocking ledge while stone remains fixed", () => {
    const world = createSandWorld(7, 6);
    put(world, 3, 1, SAND_MATERIALS.water);
    put(world, 3, 2, SAND_MATERIALS.stone);
    stepSandWorld(world, () => 0.5);
    expect(world.cells[2 * world.width + 2] === SAND_MATERIALS.water ||
      world.cells[2 * world.width + 4] === SAND_MATERIALS.water).toBe(true);
    expect(world.cells[2 * world.width + 3]).toBe(SAND_MATERIALS.stone);
  });

  it("chars wood gradually and lets nearby water extinguish fire into smoke", () => {
    const world = createSandWorld(7, 5);
    put(world, 2, 2, SAND_MATERIALS.fire);
    put(world, 3, 2, SAND_MATERIALS.wood);
    stepSandWorld(world, () => 0);
    expect(world.cells[2 * world.width + 3]).toBe(SAND_MATERIALS.wood);
    expect(world.life[2 * world.width + 3]).toBeGreaterThan(0);

    const damp = createSandWorld(7, 5);
    put(damp, 2, 2, SAND_MATERIALS.fire);
    put(damp, 3, 2, SAND_MATERIALS.water);
    stepSandWorld(damp, () => 0.5);
    expect(damp.cells[2 * damp.width + 2]).toBe(SAND_MATERIALS.smoke);
    expect(damp.cells.includes(SAND_MATERIALS.water)).toBe(true);
  });

  it("keeps fire fuel-dependent and lets burning wood smolder out", () => {
    const isolated = createSandWorld(7, 7);
    put(isolated, 3, 3, SAND_MATERIALS.fire);
    for (let frame = 0; frame < 8; frame += 1) stepSandWorld(isolated, () => 0);
    expect(isolated.cells.includes(SAND_MATERIALS.fire)).toBe(false);

    const nonFuel = createSandWorld(7, 7);
    put(nonFuel, 2, 3, SAND_MATERIALS.fire);
    put(nonFuel, 3, 3, SAND_MATERIALS.stone);
    put(nonFuel, 4, 3, SAND_MATERIALS.sand);
    for (let frame = 0; frame < 8; frame += 1) stepSandWorld(nonFuel, () => 0);
    expect(nonFuel.cells[3 * nonFuel.width + 3]).toBe(SAND_MATERIALS.stone);
    expect(nonFuel.cells[3 * nonFuel.width + 4]).not.toBe(SAND_MATERIALS.fire);

    const wood = createSandWorld(7, 7);
    put(wood, 3, 3, SAND_MATERIALS.fire);
    put(wood, 4, 3, SAND_MATERIALS.wood);
    for (let frame = 0; frame < 65; frame += 1) stepSandWorld(wood, () => 0);
    expect(wood.cells.includes(SAND_MATERIALS.wood)).toBe(false);
  });

  it("uses water to quench burning wood and gives burning oil a longer flame", () => {
    const wood = createSandWorld(7, 7);
    put(wood, 3, 3, SAND_MATERIALS.wood);
    wood.life[3 * wood.width + 3] = 8;
    wood.temperature[3 * wood.width + 3] = 100;
    put(wood, 4, 3, SAND_MATERIALS.water);
    stepSandWorld(wood, () => 0.5);
    expect(wood.cells[3 * wood.width + 3]).toBe(SAND_MATERIALS.wood);
    expect(wood.life[3 * wood.width + 3]).toBe(0);
    expect(wood.cells.includes(SAND_MATERIALS.steam)).toBe(true);

    const oil = createSandWorld(7, 7);
    put(oil, 2, 2, SAND_MATERIALS.fire);
    put(oil, 3, 2, SAND_MATERIALS.oil);
    stepSandWorld(oil, () => 0);
    expect(oil.cells[2 * oil.width + 3]).toBe(SAND_MATERIALS.fire);
    expect(oil.life[2 * oil.width + 3]).toBeGreaterThan(40);

    const hotOil = createSandWorld(7, 7);
    put(hotOil, 3, 3, SAND_MATERIALS.oil);
    heatSandBrush(hotOil, 3, 3, 1, 100);
    stepSandWorld(hotOil, () => 0);
    expect(hotOil.cells.includes(SAND_MATERIALS.oil)).toBe(false);
    expect(hotOil.cells.includes(SAND_MATERIALS.fire)).toBe(true);
  });

  it("keeps water and oil separate while denser water sinks below oil", () => {
    const world = createSandWorld(5, 5);
    put(world, 2, 1, SAND_MATERIALS.water);
    put(world, 2, 2, SAND_MATERIALS.oil);
    for (let x = 1; x <= 3; x += 1) put(world, x, 3, SAND_MATERIALS.stone);

    stepSandWorld(world, () => 0.5);

    expect(world.cells[1 * world.width + 2]).toBe(SAND_MATERIALS.oil);
    expect(world.cells[2 * world.width + 2]).toBe(SAND_MATERIALS.water);
  });

  it("moves smoke upward, disperses it, and clears it after its lifetime", () => {
    const world = createSandWorld(7, 6);
    put(world, 3, 4, SAND_MATERIALS.smoke);
    stepSandWorld(world, () => 0.25);
    expect(world.cells.slice(0, 4 * world.width).includes(SAND_MATERIALS.smoke)).toBe(true);
    const smokeIndex = world.cells.indexOf(SAND_MATERIALS.smoke);
    world.life[smokeIndex] = 1;
    stepSandWorld(world, () => 0.5);
    expect(countSandParticles(world)).toBe(0);
  });

  it("bounds brush drawing and keeps dense simulation memory fixed", () => {
    const world = createSandWorld();
    expect(() => createSandWorld(257, 256)).toThrow("Falling Sand grid dimensions are invalid.");
    paintSandBrush(world, 0, 0, 8, SAND_MATERIALS.sand);
    expect(countSandParticles(world)).toBeGreaterThan(1);
    expect(world.cells.length).toBe(SAND_GRID_CELLS);

    world.cells.fill(SAND_MATERIALS.sand);
    world.cells[0] = SAND_MATERIALS.empty;
    for (let frame = 0; frame < 12; frame += 1) stepSandWorld(world, () => 0.4);
    expect(world.cells.length).toBe(SAND_GRID_CELLS);
    expect(countSandParticles(world)).toBeLessThanOrEqual(SAND_GRID_CELLS);
  });

  it("keeps dense heat, liquid, plant, and explosive interactions within the fixed grid", () => {
    const world = createSandWorld();
    const materials = [
      SAND_MATERIALS.sand, SAND_MATERIALS.water, SAND_MATERIALS.acid,
      SAND_MATERIALS.wood, SAND_MATERIALS.plant, SAND_MATERIALS.explosive,
      SAND_MATERIALS.fire, SAND_MATERIALS.metal,
    ];
    for (let index = 0; index < world.cells.length; index += 1) {
      world.cells[index] = materials[(index * 7 + Math.floor(index / world.width)) % materials.length];
      if (world.cells[index] === SAND_MATERIALS.fire) world.life[index] = 24;
    }
    for (let frame = 0; frame < 20; frame += 1) stepSandWorld(world, () => 0.4);
    expect(world.cells.length).toBe(SAND_GRID_CELLS);
    expect(world.temperature.length).toBe(SAND_GRID_CELLS);
    expect(countSandParticles(world)).toBeLessThanOrEqual(SAND_GRID_CELLS);
  });

  it("makes water and lava create steam and solid rock", () => {
    const world = createSandWorld(7, 7);
    put(world, 3, 2, SAND_MATERIALS.water);
    put(world, 3, 3, SAND_MATERIALS.lava);
    stepSandWorld(world, () => 0.5);
    expect(world.cells.includes(SAND_MATERIALS.stone)).toBe(true);
    expect(world.cells.includes(SAND_MATERIALS.steam)).toBe(true);
  });

  it("lets unsupported lava cool into stable rock over time", () => {
    const world = createSandWorld(5, 5);
    put(world, 2, 2, SAND_MATERIALS.lava);
    for (let frame = 0; frame < 70; frame += 1) stepSandWorld(world, () => 0.5);
    expect(world.cells.includes(SAND_MATERIALS.lava)).toBe(false);
    expect(world.cells.includes(SAND_MATERIALS.stone)).toBe(true);
  });

  it("freezes and boils water at temperature extremes", () => {
    const frozen = createSandWorld(5, 5);
    put(frozen, 2, 2, SAND_MATERIALS.water);
    heatSandBrush(frozen, 2, 2, 1, 0);
    stepSandWorld(frozen, () => 0.5);
    expect(frozen.cells.includes(SAND_MATERIALS.ice)).toBe(true);

    const boiling = createSandWorld(5, 5);
    put(boiling, 2, 2, SAND_MATERIALS.water);
    heatSandBrush(boiling, 2, 2, 1, 100);
    stepSandWorld(boiling, () => 0.5);
    expect(boiling.cells.includes(SAND_MATERIALS.steam)).toBe(true);
  });

  it("cools hot stone when water boils against it", () => {
    const world = createSandWorld(7, 7);
    put(world, 3, 3, SAND_MATERIALS.stone);
    heatSandBrush(world, 3, 3, 1, 100);
    put(world, 4, 3, SAND_MATERIALS.water);

    stepSandWorld(world, () => 0.5);

    expect(world.cells.includes(SAND_MATERIALS.steam)).toBe(true);
    expect(world.temperature[3 * world.width + 3]).toBeLessThan(72);
  });

  it("melts ice with the temperature brush and lets acid dissolve sand", () => {
    const heated = createSandWorld(7, 7);
    put(heated, 3, 3, SAND_MATERIALS.ice);
    heatSandBrush(heated, 3, 3, 1, 80);
    stepSandWorld(heated, () => 0.5);
    expect(heated.cells.includes(SAND_MATERIALS.water)).toBe(true);

    const acid = createSandWorld(7, 7);
    put(acid, 3, 3, SAND_MATERIALS.acid);
    put(acid, 4, 3, SAND_MATERIALS.sand);
    stepSandWorld(acid, () => 0);
    expect(acid.cells.includes(SAND_MATERIALS.sand)).toBe(false);
  });

  it("melts snow, dissolves salt in water, and keeps metal fixed", () => {
    const world = createSandWorld(8, 8);
    put(world, 2, 4, SAND_MATERIALS.snow);
    heatSandBrush(world, 2, 4, 1, 80);
    put(world, 4, 4, SAND_MATERIALS.salt);
    put(world, 4, 3, SAND_MATERIALS.water);
    put(world, 6, 6, SAND_MATERIALS.metal);
    for (let frame = 0; frame < 2; frame += 1) stepSandWorld(world, () => 0.5);
    expect(world.cells.includes(SAND_MATERIALS.snow)).toBe(false);
    expect(world.cells.includes(SAND_MATERIALS.salt)).toBe(false);
    expect(world.cells[6 * world.width + 6]).toBe(SAND_MATERIALS.metal);
  });

  it("grows a watered plant and lets oil catch fire", () => {
    const world = createSandWorld(8, 8);
    put(world, 3, 4, SAND_MATERIALS.plant);
    put(world, 4, 4, SAND_MATERIALS.water);
    stepSandWorld(world, () => 0);
    expect(countSandParticles(world)).toBeGreaterThan(2);
    expect(world.cells.filter((material) => material === SAND_MATERIALS.plant).length).toBeGreaterThan(1);

    const oil = createSandWorld(8, 8);
    put(oil, 3, 3, SAND_MATERIALS.fire);
    put(oil, 4, 3, SAND_MATERIALS.oil);
    stepSandWorld(oil, () => 0);
    expect(oil.cells.includes(SAND_MATERIALS.fire)).toBe(true);
    expect(oil.cells.includes(SAND_MATERIALS.oil)).toBe(false);
  });

  it("pushes vapor with wind and bounds explosive reactions", () => {
    const world = createSandWorld(9, 8);
    put(world, 4, 5, SAND_MATERIALS.steam);
    setSandWind(world, 2);
    stepSandWorld(world, () => 0.5);
    expect(world.cells[4 * world.width + 5]).toBe(SAND_MATERIALS.steam);
    expect(() => setSandWind(world, 4)).toThrow("Falling Sand wind settings are invalid.");

    const blast = createSandWorld(30, 20);
    put(blast, 10, 10, SAND_MATERIALS.fire);
    put(blast, 11, 10, SAND_MATERIALS.explosive);
    stepSandWorld(blast, () => 0.5);
    expect(blast.cells.includes(SAND_MATERIALS.explosive)).toBe(false);
    expect(blast.effect.some((intensity) => intensity > 0)).toBe(true);
    expect(blast.cells.length).toBe(600);
  });

  it("fractures stone near explosions while metal remains a blast-resistant barrier", () => {
    const world = createSandWorld(25, 25);
    put(world, 12, 12, SAND_MATERIALS.explosive);
    put(world, 11, 12, SAND_MATERIALS.fire);
    for (let y = 8; y <= 16; y += 1) {
      for (let x = 8; x <= 16; x += 1) {
        put(world, x, y, SAND_MATERIALS.stone);
      }
    }
    put(world, 16, 12, SAND_MATERIALS.metal);
    put(world, 12, 12, SAND_MATERIALS.explosive);
    put(world, 11, 12, SAND_MATERIALS.fire);

    stepSandWorld(world, () => 0.5);

    expect(world.cells.includes(SAND_MATERIALS.sand)).toBe(true);
    expect(world.cells[12 * world.width + 16]).toBe(SAND_MATERIALS.metal);
    expect(world.effect.some((intensity) => intensity > 0)).toBe(true);
  });

  it("loads bounded presets and round-trips a custom scene", () => {
    const world = createSandWorld();
    for (const preset of ["lava", "frozen", "forest", "explosive", "water"] as const) {
      loadSandPreset(world, preset);
      expect(countSandParticles(world)).toBeGreaterThan(0);
      if (preset === "explosive") {
        stepSandWorld(world, () => 0.5);
        expect(world.effect.some((intensity) => intensity > 0)).toBe(true);
      }
    }

    paintSandBrush(world, 70, 30, 1, SAND_MATERIALS.salt);
    setSandWind(world, -2);
    const serialized = serializeSandScene(world, "  Test landscape  ");
    const copy = createSandWorld();
    expect(restoreSandScene(copy, serialized)).toBe("Test landscape");
    expect(copy.wind).toBe(-2);
    expect(copy.cells).toEqual(world.cells);
    expect(copy.temperature).toEqual(world.temperature);
    expect(() => restoreSandScene(copy, JSON.stringify({ version: 1, width: 1 }))).toThrow("The saved sandbox scene is incompatible or damaged.");
    expect(() => serializeSandScene(world, " ")).toThrow("Scene names must contain 1 to 40 characters.");
  });

  it("preserves retired salt and temporary steam cells from older saved scenes", () => {
    const oldWorld = createSandWorld(8, 8);
    put(oldWorld, 1, 1, SAND_MATERIALS.salt);
    put(oldWorld, 5, 5, SAND_MATERIALS.steam);
    oldWorld.life[5 * oldWorld.width + 5] = 12;

    const restored = createSandWorld(8, 8);
    restoreSandScene(restored, serializeSandScene(oldWorld, "Older scene"));

    expect(restored.cells[1 * restored.width + 1]).toBe(SAND_MATERIALS.salt);
    expect(restored.cells[5 * restored.width + 5]).toBe(SAND_MATERIALS.steam);
    expect(restored.life[5 * restored.width + 5]).toBe(12);
    expect(() => stepSandWorld(restored, () => 0.5)).not.toThrow();
  });
});
