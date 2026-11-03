export const SAND_GRID_WIDTH = 200;
export const SAND_GRID_HEIGHT = 120;
export const SAND_GRID_CELLS = SAND_GRID_WIDTH * SAND_GRID_HEIGHT;
export const SAND_AMBIENT_TEMPERATURE = 20;

export const SAND_MATERIALS = {
  empty: 0,
  sand: 1,
  water: 2,
  stone: 3,
  wood: 4,
  fire: 5,
  smoke: 6,
  lava: 7,
  oil: 8,
  acid: 9,
  ice: 10,
  snow: 11,
  steam: 12,
  plant: 13,
  metal: 14,
  salt: 15,
  explosive: 16,
} as const;

export type SandMaterialName = Exclude<keyof typeof SAND_MATERIALS, "empty">;
export type SandMaterial = (typeof SAND_MATERIALS)[SandMaterialName];
export type SandPresetName = "lava" | "frozen" | "forest" | "explosive" | "water";

export interface SandWorld {
  width: number;
  height: number;
  cells: Uint8Array;
  life: Uint8Array;
  temperature: Uint8Array;
  processed: Uint8Array;
  effect: Uint8Array;
  wind: number;
}

export function createSandWorld(width = SAND_GRID_WIDTH, height = SAND_GRID_HEIGHT): SandWorld {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 65_536) {
    throw new Error("Falling Sand grid dimensions are invalid.");
  }
  const cells = width * height;
  const temperature = new Uint8Array(cells);
  temperature.fill(SAND_AMBIENT_TEMPERATURE);
  return {
    width,
    height,
    cells: new Uint8Array(cells),
    life: new Uint8Array(cells),
    temperature,
    processed: new Uint8Array(cells),
    effect: new Uint8Array(cells),
    wind: 0,
  };
}

function defaultTemperature(material: number): number {
  if (material === SAND_MATERIALS.fire || material === SAND_MATERIALS.lava) return 100;
  if (material === SAND_MATERIALS.ice || material === SAND_MATERIALS.snow) return 0;
  return SAND_AMBIENT_TEMPERATURE;
}

function igniteFuel(world: SandWorld, index: number, random: () => number) {
  const material = world.cells[index];
  if (material === SAND_MATERIALS.wood) {
    if (world.life[index] === 0) {
      world.life[index] = 42 + Math.floor(random() * 28);
      world.temperature[index] = 100;
      world.effect[index] = 150;
    }
    return;
  }
  setCell(world, index, SAND_MATERIALS.fire, random);
  if (material === SAND_MATERIALS.oil) world.life[index] = 48 + Math.floor(random() * 28);
  world.effect[index] = 180;
}

function setCell(world: SandWorld, index: number, material: number, random: () => number) {
  world.cells[index] = material;
  world.life[index] = material === SAND_MATERIALS.fire
    ? 18 + Math.floor(random() * 30)
    : material === SAND_MATERIALS.smoke || material === SAND_MATERIALS.steam
      ? 24 + Math.floor(random() * 26)
      : 0;
  world.temperature[index] = defaultTemperature(material);
}

function validBrush(centerX: number, centerY: number, size: number): boolean {
  return Number.isInteger(centerX) && Number.isInteger(centerY) &&
    Number.isInteger(size) && size >= 1 && size <= 16;
}

function forBrushCell(world: SandWorld, centerX: number, centerY: number, size: number, visit: (index: number) => void) {
  const startX = centerX - Math.floor((size - 1) / 2);
  const startY = centerY - Math.floor((size - 1) / 2);
  const radius = size / 2;
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      if ((dx - (size - 1) / 2) ** 2 + (dy - (size - 1) / 2) ** 2 > radius ** 2) continue;
      const x = startX + dx;
      const y = startY + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;
      visit(y * world.width + x);
    }
  }
}

export function paintSandBrush(
  world: SandWorld,
  centerX: number,
  centerY: number,
  size: number,
  material: SandMaterial,
  random: () => number = Math.random,
): void {
  if (!validBrush(centerX, centerY, size) || !Number.isInteger(material) ||
    material < SAND_MATERIALS.sand || material > SAND_MATERIALS.explosive) {
    throw new Error("Falling Sand brush settings are invalid.");
  }
  forBrushCell(world, centerX, centerY, size, (index) => setCell(world, index, material, random));
}

export function eraseSandBrush(world: SandWorld, centerX: number, centerY: number, size: number): void {
  if (!validBrush(centerX, centerY, size)) throw new Error("Falling Sand brush settings are invalid.");
  forBrushCell(world, centerX, centerY, size, (index) => {
    setCell(world, index, SAND_MATERIALS.empty, Math.random);
    world.effect[index] = 0;
  });
}

export function heatSandBrush(world: SandWorld, centerX: number, centerY: number, size: number, temperature: number): void {
  if (!validBrush(centerX, centerY, size) || !Number.isInteger(temperature) || temperature < 0 || temperature > 100) {
    throw new Error("Falling Sand temperature settings are invalid.");
  }
  forBrushCell(world, centerX, centerY, size, (index) => {
    world.temperature[index] = temperature;
  });
}

export function sampleSandMaterial(world: SandWorld, x: number, y: number): SandMaterial | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= world.width || y < 0 || y >= world.height) return null;
  const material = world.cells[y * world.width + x];
  return material === SAND_MATERIALS.empty ? null : material as SandMaterial;
}

function swapCells(world: SandWorld, first: number, second: number) {
  [world.cells[first], world.cells[second]] = [world.cells[second], world.cells[first]];
  [world.life[first], world.life[second]] = [world.life[second], world.life[first]];
  [world.temperature[first], world.temperature[second]] = [world.temperature[second], world.temperature[first]];
  world.processed[second] = 1;
}

function canDisplace(mover: number, target: number): boolean {
  if (target === SAND_MATERIALS.empty) return true;
  if (target === SAND_MATERIALS.oil) {
    return mover === SAND_MATERIALS.sand || mover === SAND_MATERIALS.snow ||
      mover === SAND_MATERIALS.water || mover === SAND_MATERIALS.acid || mover === SAND_MATERIALS.lava;
  }
  if (target === SAND_MATERIALS.water) {
    return mover === SAND_MATERIALS.sand || mover === SAND_MATERIALS.snow || mover === SAND_MATERIALS.lava;
  }
  return false;
}

function moveDown(world: SandWorld, index: number, x: number, y: number): boolean {
  if (y + 1 >= world.height) return false;
  const below = index + world.width;
  const material = world.cells[index];
  if (canDisplace(material, world.cells[below])) {
    swapCells(world, index, below);
    return true;
  }
  const leftFirst = (x + y) % 2 === 0;
  for (let side = 0; side < 2; side += 1) {
    const nextX = x + (side === 0 ? (leftFirst ? -1 : 1) : (leftFirst ? 1 : -1));
    if (nextX < 0 || nextX >= world.width) continue;
    const diagonal = below + nextX - x;
    if (canDisplace(material, world.cells[diagonal])) {
      swapCells(world, index, diagonal);
      return true;
    }
  }
  return false;
}

function flowSideways(world: SandWorld, index: number, x: number, random: () => number): boolean {
  const leftFirst = random() < 0.5;
  for (let side = 0; side < 2; side += 1) {
    const nextX = x + (side === 0 ? (leftFirst ? -1 : 1) : (leftFirst ? 1 : -1));
    if (nextX < 0 || nextX >= world.width) continue;
    const next = index + nextX - x;
    if (world.cells[next] === SAND_MATERIALS.empty) {
      swapCells(world, index, next);
      return true;
    }
  }
  return false;
}

function adjacentMaterial(world: SandWorld, x: number, y: number, material: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX >= 0 && nextX < world.width && nextY >= 0 && nextY < world.height &&
        world.cells[nextY * world.width + nextX] === material) count += 1;
    }
  }
  return count;
}

function heatNeighbors(world: SandWorld, index: number, x: number, y: number) {
  const nextTemperature = Math.min(100, world.temperature[index]);
  if (nextTemperature < 42) return;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextX >= world.width || nextY < 0 || nextY >= world.height) continue;
      const neighbor = nextY * world.width + nextX;
      if (world.cells[index] === SAND_MATERIALS.lava && world.cells[neighbor] === SAND_MATERIALS.lava) continue;
      world.temperature[neighbor] = Math.min(100, Math.max(world.temperature[neighbor], nextTemperature - 18));
    }
  }
}

function explode(world: SandWorld, center: number, random: () => number) {
  const centerX = center % world.width;
  const centerY = Math.floor(center / world.width);
  const radius = 11;
  const minX = Math.max(0, centerX - radius);
  const maxX = Math.min(world.width - 1, centerX + radius);
  const minY = Math.max(0, centerY - radius);
  const maxY = Math.min(world.height - 1, centerY + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radius * radius) continue;
      const index = y * world.width + x;
      const material = world.cells[index];
      world.effect[index] = 255;
      world.temperature[index] = Math.min(100, world.temperature[index] + 45);
      if (index === center) {
        setCell(world, index, SAND_MATERIALS.fire, random);
      } else if (material === SAND_MATERIALS.metal) {
        continue;
      } else if (material === SAND_MATERIALS.stone) {
        if (distanceSquared <= 25) {
          setCell(world, index, SAND_MATERIALS.sand, random);
        } else if (distanceSquared <= 60 && random() < 0.2) {
          setCell(world, index, SAND_MATERIALS.empty, random);
        } else {
          continue;
        }
      } else if (material === SAND_MATERIALS.water || material === SAND_MATERIALS.ice) {
        setCell(world, index, SAND_MATERIALS.steam, random);
      } else if (distanceSquared < 20 || material === SAND_MATERIALS.wood ||
        material === SAND_MATERIALS.oil || material === SAND_MATERIALS.plant) {
        setCell(world, index, SAND_MATERIALS.fire, random);
      } else if (distanceSquared > 60 && random() < 0.2) {
        setCell(world, index, SAND_MATERIALS.smoke, random);
      } else {
        setCell(world, index, SAND_MATERIALS.empty, random);
      }
      world.processed[index] = 1;
    }
  }
}

function moveVapor(world: SandWorld, index: number, x: number, y: number, random: () => number): boolean {
  if (y === 0) return false;
  const up = index - world.width;
  const wind = Math.sign(world.wind);
  const drift = wind === 0 ? (random() < 0.5 ? -1 : 1) : wind;
  const preferredX = x + drift;
  if (preferredX >= 0 && preferredX < world.width) {
    const diagonal = up + drift;
    if (world.cells[diagonal] === SAND_MATERIALS.empty) {
      swapCells(world, index, diagonal);
      return true;
    }
  }
  if (world.cells[up] === SAND_MATERIALS.empty) {
    swapCells(world, index, up);
    return true;
  }
  if (wind !== 0 && preferredX >= 0 && preferredX < world.width) {
    const horizontal = index + wind;
    if (world.cells[horizontal] === SAND_MATERIALS.empty) {
      swapCells(world, index, horizontal);
      return true;
    }
  }
  return false;
}

function moveLiquid(world: SandWorld, index: number, x: number, y: number, random: () => number): boolean {
  if (moveDown(world, index, x, y)) return true;
  if (world.cells[index] === SAND_MATERIALS.oil && y > 0) {
    const above = index - world.width;
    if (world.cells[above] === SAND_MATERIALS.water) {
      swapCells(world, index, above);
      return true;
    }
  }
  return flowSideways(world, index, x, random);
}

function reactWater(world: SandWorld, index: number, x: number, y: number, random: () => number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextX >= world.width || nextY < 0 || nextY >= world.height) continue;
      const neighbor = nextY * world.width + nextX;
      if ((world.cells[index] === SAND_MATERIALS.water && world.cells[neighbor] === SAND_MATERIALS.lava) ||
        (world.cells[index] === SAND_MATERIALS.lava && world.cells[neighbor] === SAND_MATERIALS.water)) {
        const water = world.cells[index] === SAND_MATERIALS.water ? index : neighbor;
        const lava = world.cells[index] === SAND_MATERIALS.lava ? index : neighbor;
        setCell(world, water, SAND_MATERIALS.steam, random);
        setCell(world, lava, SAND_MATERIALS.stone, random);
        world.temperature[lava] = 50;
        world.processed[water] = 1;
        world.processed[lava] = 1;
        world.effect[index] = 230;
        world.effect[neighbor] = 230;
        return true;
      }
      if (world.cells[index] !== SAND_MATERIALS.water) continue;
      if (world.cells[neighbor] === SAND_MATERIALS.fire) {
        setCell(world, neighbor, SAND_MATERIALS.smoke, random);
        world.processed[neighbor] = 1;
        world.effect[index] = 160;
        world.effect[neighbor] = 220;
        return true;
      }
      if (world.cells[neighbor] === SAND_MATERIALS.wood && world.life[neighbor] > 0) {
        setCell(world, index, SAND_MATERIALS.steam, random);
        world.processed[index] = 1;
        world.life[neighbor] = 0;
        world.temperature[neighbor] = 35;
        world.processed[neighbor] = 1;
        world.effect[index] = 200;
        world.effect[neighbor] = 200;
        return true;
      }
      if ((world.cells[neighbor] === SAND_MATERIALS.stone && world.temperature[neighbor] >= 72) ||
        (world.cells[neighbor] === SAND_MATERIALS.metal && world.temperature[neighbor] >= 86)) {
        setCell(world, index, SAND_MATERIALS.steam, random);
        world.processed[index] = 1;
        world.processed[neighbor] = 1;
        world.temperature[neighbor] = Math.max(SAND_AMBIENT_TEMPERATURE, world.temperature[neighbor] - 34);
        world.effect[index] = 180;
        world.effect[neighbor] = 180;
        return true;
      }
    }
  }
  return false;
}

export function stepSandWorld(world: SandWorld, random: () => number = Math.random): void {
  world.processed.fill(0);
  let explosionsThisStep = 0;
  for (let y = world.height - 1; y >= 0; y -= 1) {
    const leftToRight = y % 2 === 0;
    for (let offset = 0; offset < world.width; offset += 1) {
      const x = leftToRight ? offset : world.width - 1 - offset;
      const index = y * world.width + x;
      if (world.effect[index] > 0) world.effect[index] = Math.max(0, world.effect[index] - 36);
      if (world.processed[index]) continue;
      let material = world.cells[index];

      if (material === SAND_MATERIALS.fire) {
        world.temperature[index] = 100;
        heatNeighbors(world, index, x, y);
      } else if (material === SAND_MATERIALS.lava) {
        world.temperature[index] = Math.max(0, world.temperature[index] - 1);
        if (world.temperature[index] <= 34) {
          setCell(world, index, SAND_MATERIALS.stone, random);
          world.effect[index] = 190;
          world.processed[index] = 1;
          continue;
        }
        heatNeighbors(world, index, x, y);
      } else if (material === SAND_MATERIALS.wood && world.life[index] > 0) {
        world.temperature[index] = Math.max(70, world.temperature[index] - 1);
        heatNeighbors(world, index, x, y);
      } else if (world.temperature[index] > SAND_AMBIENT_TEMPERATURE) {
        world.temperature[index] -= 1;
      } else if (world.temperature[index] < SAND_AMBIENT_TEMPERATURE && material !== SAND_MATERIALS.ice &&
        material !== SAND_MATERIALS.snow) {
        world.temperature[index] += 1;
      }
      if ((material === SAND_MATERIALS.stone || material === SAND_MATERIALS.metal) &&
        world.temperature[index] > 42) {
        heatNeighbors(world, index, x, y);
      }

      if (material === SAND_MATERIALS.water || material === SAND_MATERIALS.lava) {
        if (reactWater(world, index, x, y, random)) {
          world.processed[index] = 1;
          continue;
        }
        material = world.cells[index];
      }

      if (material === SAND_MATERIALS.oil && world.temperature[index] >= 78) {
        igniteFuel(world, index, random);
        material = world.cells[index];
      }

      if (material === SAND_MATERIALS.explosive &&
        (adjacentMaterial(world, x, y, SAND_MATERIALS.fire) > 0 ||
          adjacentMaterial(world, x, y, SAND_MATERIALS.lava) > 0 || world.temperature[index] >= 96)) {
        if (explosionsThisStep < 3) {
          explode(world, index, random);
          explosionsThisStep += 1;
        } else {
          setCell(world, index, SAND_MATERIALS.fire, random);
        }
        world.processed[index] = 1;
        continue;
      }

      if ((material === SAND_MATERIALS.ice || material === SAND_MATERIALS.snow) && world.temperature[index] >= 34) {
        setCell(world, index, SAND_MATERIALS.water, random);
        material = SAND_MATERIALS.water;
      } else if (material === SAND_MATERIALS.water && world.temperature[index] <= 6) {
        setCell(world, index, SAND_MATERIALS.ice, random);
        material = SAND_MATERIALS.ice;
      } else if (material === SAND_MATERIALS.water && world.temperature[index] >= 92) {
        setCell(world, index, SAND_MATERIALS.steam, random);
        material = SAND_MATERIALS.steam;
      }

      if (material === SAND_MATERIALS.sand || material === SAND_MATERIALS.snow) {
        moveDown(world, index, x, y);
      } else if (material === SAND_MATERIALS.water || material === SAND_MATERIALS.oil ||
        material === SAND_MATERIALS.acid || material === SAND_MATERIALS.lava) {
        if (material === SAND_MATERIALS.acid) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nextX = x + dx;
              const nextY = y + dy;
              if (nextX < 0 || nextX >= world.width || nextY < 0 || nextY >= world.height) continue;
              const neighbor = nextY * world.width + nextX;
              const target = world.cells[neighbor];
              if ((target === SAND_MATERIALS.sand || target === SAND_MATERIALS.wood ||
                target === SAND_MATERIALS.plant || target === SAND_MATERIALS.ice ||
                target === SAND_MATERIALS.snow || target === SAND_MATERIALS.salt) && random() < 0.35) {
                setCell(world, neighbor, SAND_MATERIALS.empty, random);
                world.effect[neighbor] = 120;
                world.processed[neighbor] = 1;
              }
            }
          }
        }
        if (material === SAND_MATERIALS.lava) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
              const nextX = x + dx;
              const nextY = y + dy;
              if (nextX < 0 || nextX >= world.width || nextY < 0 || nextY >= world.height) continue;
              const neighbor = nextY * world.width + nextX;
              const target = world.cells[neighbor];
              if ((target === SAND_MATERIALS.wood && world.life[neighbor] === 0) ||
                target === SAND_MATERIALS.oil || target === SAND_MATERIALS.plant) {
                igniteFuel(world, neighbor, random);
                world.processed[neighbor] = 1;
              }
            }
          }
        }
        moveLiquid(world, index, x, y, random);
      } else if (material === SAND_MATERIALS.fire) {
        const waterNearby = adjacentMaterial(world, x, y, SAND_MATERIALS.water) > 0;
        if (waterNearby) {
          setCell(world, index, SAND_MATERIALS.smoke, random);
          world.effect[index] = 220;
        } else {
          let fuelNearby = false;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nextX = x + dx;
              const nextY = y + dy;
              if (nextX < 0 || nextX >= world.width || nextY < 0 || nextY >= world.height) continue;
              const neighbor = nextY * world.width + nextX;
              const target = world.cells[neighbor];
              if ((target === SAND_MATERIALS.wood && world.life[neighbor] === 0) ||
                target === SAND_MATERIALS.oil || target === SAND_MATERIALS.plant ||
                target === SAND_MATERIALS.explosive) fuelNearby = true;
              const windAssists = world.wind === 0 || Math.sign(dx) === Math.sign(world.wind);
              if (((target === SAND_MATERIALS.wood && world.life[neighbor] === 0) ||
                target === SAND_MATERIALS.oil || target === SAND_MATERIALS.plant) &&
                random() < (windAssists ? 0.045 : 0.02)) {
                igniteFuel(world, neighbor, random);
                world.processed[neighbor] = 1;
              }
              if (target === SAND_MATERIALS.explosive && explosionsThisStep < 3) {
                explode(world, neighbor, random);
                explosionsThisStep += 1;
                world.processed[neighbor] = 1;
              }
            }
          }
          world.life[index] = Math.max(0, world.life[index] - (fuelNearby ? 1 : 3));
          if (world.life[index] === 0) {
            setCell(world, index, SAND_MATERIALS.smoke, random);
            world.effect[index] = 130;
          }
        }
        world.processed[index] = 1;
      } else if (material === SAND_MATERIALS.smoke || material === SAND_MATERIALS.steam) {
        world.life[index] = Math.max(0, world.life[index] - 1);
        if (world.life[index] === 0) {
          setCell(world, index, SAND_MATERIALS.empty, random);
        } else {
          moveVapor(world, index, x, y, random);
        }
      } else if (material === SAND_MATERIALS.wood) {
        if (world.life[index] === 0 && world.temperature[index] >= 76) {
          igniteFuel(world, index, random);
        }
        if (world.life[index] > 0) {
          world.life[index] = Math.max(0, world.life[index] - 1);
          if (world.life[index] % 8 === 0 && y > 0) {
            const above = index - world.width;
            if (world.cells[above] === SAND_MATERIALS.empty) {
              setCell(world, above, SAND_MATERIALS.smoke, random);
              world.processed[above] = 1;
            }
          }
          if (world.life[index] === 0) {
            setCell(world, index, SAND_MATERIALS.smoke, random);
            world.effect[index] = 170;
          }
        }
      } else if (material === SAND_MATERIALS.plant) {
        if (world.temperature[index] > 80) {
          igniteFuel(world, index, random);
        } else if (world.temperature[index] >= 20 && world.temperature[index] <= 70 &&
          adjacentMaterial(world, x, y, SAND_MATERIALS.water) > 0 && random() < 0.06) {
          const growthX = x + (random() < 0.5 ? -1 : 1);
          if (growthX >= 0 && growthX < world.width && y > 0 &&
            world.cells[index - world.width] === SAND_MATERIALS.empty) {
            setCell(world, index - world.width, SAND_MATERIALS.plant, random);
            world.processed[index - world.width] = 1;
          } else if (growthX >= 0 && growthX < world.width &&
            world.cells[y * world.width + growthX] === SAND_MATERIALS.empty) {
            setCell(world, y * world.width + growthX, SAND_MATERIALS.plant, random);
            world.processed[y * world.width + growthX] = 1;
          }
        }
        world.processed[index] = 1;
      } else if (material === SAND_MATERIALS.salt) {
        if (adjacentMaterial(world, x, y, SAND_MATERIALS.water) > 0) {
          setCell(world, index, SAND_MATERIALS.empty, random);
        } else {
          moveDown(world, index, x, y);
        }
      }
      world.processed[index] = 1;
    }
  }
}

export function setSandWind(world: SandWorld, wind: number): void {
  if (!Number.isInteger(wind) || wind < -3 || wind > 3) throw new Error("Falling Sand wind settings are invalid.");
  world.wind = wind;
}

export function clearSandWorld(world: SandWorld): void {
  world.cells.fill(SAND_MATERIALS.empty);
  world.life.fill(0);
  world.temperature.fill(SAND_AMBIENT_TEMPERATURE);
  world.processed.fill(0);
  world.effect.fill(0);
}

function paintLine(world: SandWorld, y: number, startX: number, endX: number, material: SandMaterial) {
  for (let x = startX; x <= endX; x += 1) paintSandBrush(world, x, y, 1, material, () => 0.5);
}

function paintPatch(world: SandWorld, x: number, y: number, size: number, material: SandMaterial) {
  const radius = Math.floor(size / 2);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) paintSandBrush(world, x + dx, y + dy, 1, material, () => 0.5);
    }
  }
}

export function loadSandPreset(world: SandWorld, preset: SandPresetName): void {
  clearSandWorld(world);
  setSandWind(world, preset === "lava" ? 1 : preset === "frozen" ? -1 : 0);
  const ground = world.height - 7;
  if (preset === "lava") {
    paintLine(world, ground, 0, world.width - 1, SAND_MATERIALS.stone);
    paintLine(world, ground - 1, 0, 27, SAND_MATERIALS.stone);
    paintLine(world, ground - 1, world.width - 28, world.width - 1, SAND_MATERIALS.stone);
    paintPatch(world, 96, ground - 8, 24, SAND_MATERIALS.lava);
    paintPatch(world, 44, ground - 14, 12, SAND_MATERIALS.sand);
    paintPatch(world, 150, ground - 15, 11, SAND_MATERIALS.explosive);
    paintPatch(world, 40, ground - 2, 8, SAND_MATERIALS.water);
  } else if (preset === "frozen") {
    paintLine(world, ground, 0, world.width - 1, SAND_MATERIALS.ice);
    paintPatch(world, 54, ground - 14, 20, SAND_MATERIALS.snow);
    paintPatch(world, 100, ground - 8, 16, SAND_MATERIALS.water);
    paintPatch(world, 143, ground - 19, 9, SAND_MATERIALS.ice);
    heatSandBrush(world, 100, ground - 8, 16, 8);
  } else if (preset === "forest") {
    paintLine(world, ground, 0, world.width - 1, SAND_MATERIALS.sand);
    for (const x of [40, 77, 125, 163]) {
      for (let y = ground - 10; y < ground - 2; y += 1) {
        paintLine(world, y, x, x + 1, SAND_MATERIALS.wood);
      }
      paintPatch(world, x, ground - 14, 11, SAND_MATERIALS.plant);
    }
    paintPatch(world, 103, ground - 2, 8, SAND_MATERIALS.water);
    paintPatch(world, 28, ground - 2, 4, SAND_MATERIALS.fire);
  } else if (preset === "explosive") {
    paintLine(world, ground, 0, world.width - 1, SAND_MATERIALS.stone);
    paintLine(world, ground - 1, 0, 20, SAND_MATERIALS.metal);
    paintLine(world, ground - 1, world.width - 21, world.width - 1, SAND_MATERIALS.metal);
    paintPatch(world, 93, ground - 8, 9, SAND_MATERIALS.explosive);
    paintPatch(world, 100, ground - 9, 15, SAND_MATERIALS.sand);
    paintPatch(world, 107, ground - 8, 9, SAND_MATERIALS.explosive);
    paintPatch(world, 100, ground - 8, 4, SAND_MATERIALS.fire);
  } else {
    paintLine(world, ground, 0, world.width - 1, SAND_MATERIALS.stone);
    paintLine(world, ground - 1, 0, 42, SAND_MATERIALS.stone);
    paintLine(world, ground - 1, 157, world.width - 1, SAND_MATERIALS.stone);
    paintPatch(world, 100, ground - 7, 24, SAND_MATERIALS.water);
    paintPatch(world, 49, ground - 12, 14, SAND_MATERIALS.sand);
    paintPatch(world, 100, ground - 2, 8, SAND_MATERIALS.oil);
  }
}

export interface SavedSandScene {
  id: string;
  name: string;
  world: SandWorld;
  updatedAt: number;
}

export function serializeSandScene(world: SandWorld, name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 40) throw new Error("Scene names must contain 1 to 40 characters.");
  return JSON.stringify({
    version: 1,
    name: trimmedName,
    width: world.width,
    height: world.height,
    wind: world.wind,
    cells: Array.from(world.cells),
    life: Array.from(world.life),
    temperature: Array.from(world.temperature),
  });
}

export function restoreSandScene(world: SandWorld, value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The saved sandbox scene is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The saved sandbox scene is invalid.");
  const scene = parsed as Record<string, unknown>;
  const length = world.width * world.height;
  const validBytes = (candidate: unknown): candidate is number[] => Array.isArray(candidate) &&
    candidate.length === length && candidate.every((item) => Number.isInteger(item) && item >= 0 && item <= 255);
  if (scene.version !== 1 || scene.width !== world.width || scene.height !== world.height ||
    typeof scene.name !== "string" || scene.name.length < 1 || scene.name.length > 40 ||
    !Number.isInteger(scene.wind) || Number(scene.wind) < -3 || Number(scene.wind) > 3 ||
    !validBytes(scene.cells) || !validBytes(scene.life) || !validBytes(scene.temperature) ||
    scene.cells.some((material) => material > SAND_MATERIALS.explosive)) {
    throw new Error("The saved sandbox scene is incompatible or damaged.");
  }
  world.cells.set(scene.cells);
  world.life.set(scene.life);
  world.temperature.set(scene.temperature);
  world.processed.fill(0);
  world.effect.fill(0);
  world.wind = Number(scene.wind);
  return scene.name;
}

export function countSandParticles(world: SandWorld): number {
  let count = 0;
  for (const material of world.cells) if (material !== SAND_MATERIALS.empty) count += 1;
  return count;
}
