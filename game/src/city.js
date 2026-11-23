// Solara City generation, v2: a much denser fixed-seed grid city.
// Roads run every WORLD.block pixels. Every block between them is filled: rows
// of buildings with varied roofs and neon, sidewalk trees, benches, hydrants,
// bus stops, billboards and parked cars along the kerb. The west edge is beach
// and water, the south is the Docks, the north is Uptown towers. Collision is
// circle-vs-rectangle against building footprints; cars steer along road lines.
import { WORLD, DISTRICTS, PALETTE, DENSITY } from './config.js';
import { createRandom, clamp } from './random.js';

const ROOF_COLORS = ['#8a6f5c', '#a5714f', '#6f7d8a', '#96705a', '#7a5c48', '#b08a5e', '#5e6b7a', '#c2a06a', '#94654f', '#77828e'];
const WALL_COLORS = ['#d8c1a3', '#c9b18c', '#bfae9a', '#e0d3b8', '#c4a882', '#a89a86', '#d0bfa8', '#b7a58e'];
const NEON = ['#ff5ea8', '#37e0c8', '#ffd23f', '#7aa8ff', '#ff7a3c', '#c96bff'];
const TREE_GREENS = ['#2f8f3e', '#3a7a2e', '#4e9a3a', '#2a7a35'];

export function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.z0 && y < d.z1) return d;
  return DISTRICTS[1];
}

export function createCity(seed) {
  const rng = createRandom(seed);
  const size = WORLD.size;
  const pitch = WORLD.block + WORLD.road;
  const roadsX = [], roadsZ = [];
  for (let x = WORLD.road / 2; x < size; x += pitch) roadsX.push(x);
  for (let z = WORLD.road / 2; z < size; z += pitch) roadsZ.push(z);

  const buildings = [];
  const parks = [];
  const lots = [];
  const trees = [];
  const benches = [];
  const hydrants = [];
  const billboards = [];
  const busStops = [];
  const palms = [];
  const lamps = [];
  const pickups = [];
  const packages = [];
  const carSpawns = [];
  const pedSpawns = [];

  const beach = { x0: 0, x1: 260, y0: 0, y1: size };
  const water = { x0: -600, x1: 0, y0: -600, y1: size + 600 };

  function scatterTrees(x0, y0, x1, y1, n) {
    for (let i = 0; i < n; i++) {
      trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), r: rng.range(9, 15), color: rng.pick(TREE_GREENS) });
    }
  }
  function kerbProps(x0, y0, x1, y1) {
    // Trees and benches along the block's sidewalk edges.
    const nT = rng.int(DENSITY.treesPerBlockMin, DENSITY.treesPerBlockMax);
    for (let i = 0; i < nT; i++) {
      const edge = rng.int(0, 3);
      if (edge === 0) trees.push({ x: rng.range(x0, x1), y: y0 - 16, r: rng.range(9, 14), color: rng.pick(TREE_GREENS) });
      else if (edge === 1) trees.push({ x: rng.range(x0, x1), y: y1 + 16, r: rng.range(9, 14), color: rng.pick(TREE_GREENS) });
      else if (edge === 2) trees.push({ x: x0 - 16, y: rng.range(y0, y1), r: rng.range(9, 14), color: rng.pick(TREE_GREENS) });
      else trees.push({ x: x1 + 16, y: rng.range(y0, y1), r: rng.range(9, 14), color: rng.pick(TREE_GREENS) });
    }
    for (let i = 0; i < rng.int(1, 3); i++) {
      benches.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.chance(0.5) ? y0 - 12 : y1 + 12, angle: rng.chance(0.5) ? 0 : Math.PI / 2 });
    }
    if (rng.chance(0.6)) hydrants.push({ x: rng.range(x0, x1), y: rng.chance(0.5) ? y0 - 18 : y1 + 18 });
    if (rng.chance(0.4)) busStops.push({ x: rng.chance(0.5) ? x0 - 30 : x1 + 30, y: rng.range(y0, y1) });
  }

  for (let bi = 0; bi < roadsX.length - 1; bi++) {
    for (let bj = 0; bj < roadsZ.length - 1; bj++) {
      const bx0 = roadsX[bi] + WORLD.road / 2;
      const bz0 = roadsZ[bj] + WORLD.road / 2;
      const bx1 = roadsX[bi + 1] - WORLD.road / 2;
      const bz1 = roadsZ[bj + 1] - WORLD.road / 2;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      const district = districtAt(cx, cz);
      const roll = rng.next();
      if (bx0 < 340) continue; // beach blocks stay open sand
      if (roll < 0.08) {
        parks.push({ x0: bx0, y0: bz0, x1: bx1, y1: bz1, trees: rng.int(10, 20) });
        scatterTrees(bx0, bz0, bx1, bz1, rng.int(8, 14));
        kerbProps(bx0, bz0, bx1, bz1);
        continue;
      }
      if (roll < 0.13) {
        lots.push({ x0: bx0, y0: bz0, x1: bx1, y1: bz1 });
        for (let k = 0; k < rng.int(5, 9); k++) {
          carSpawns.push({ x: rng.range(bx0 + 40, bx1 - 40), y: rng.range(bz0 + 40, bz1 - 40), angle: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), parked: true });
        }
        kerbProps(bx0, bz0, bx1, bz1);
        continue;
      }
      if (roll < 0.16) {
        parks.push({ x0: bx0, y0: bz0, x1: bx1, y1: bz1, plaza: true, trees: rng.int(3, 6) });
        scatterTrees(bx0, bz0, bx1, bz1, rng.int(3, 6));
        kerbProps(bx0, bz0, bx1, bz1);
        continue;
      }
      // Built block: 3-6 buildings, tighter and taller than v1.
      const n = district.name === 'Uptown' ? rng.int(1, 2) : rng.int(3, 6);
      for (let k = 0; k < n; k++) {
        const w = rng.range(80, 150), h = rng.range(80, 150);
        const x = rng.range(bx0 + 16, bx1 - 16 - w), y = rng.range(bz0 + 16, bz1 - 16 - h);
        const tall = district.name === 'Uptown' ? rng.int(4, 10) : rng.int(1, 4);
        const hasBoard = rng.chance(0.18);
        const b = {
          x, y, w, h, floors: tall,
          roof: rng.pick(ROOF_COLORS), wall: rng.pick(WALL_COLORS),
          neon: rng.chance(0.3) ? rng.pick(NEON) : null,
          board: hasBoard ? rng.pick(NEON) : null,
          name: district.name,
        };
        buildings.push(b);
        if (hasBoard) billboards.push({ x: b.x + b.w / 2, y: b.y - 6, w: Math.min(64, b.w - 20), color: b.board });
      }
      // Parked cars along both kerbs, denser than v1.
      for (let k = 0; k < rng.int(DENSITY.parkedPerBlockMin, DENSITY.parkedPerBlockMax); k++) {
        const horiz = rng.chance(0.5);
        carSpawns.push({
          x: horiz ? rng.range(bx0, bx1) : (rng.chance(0.5) ? bx0 - 34 : bx1 + 34),
          y: horiz ? (rng.chance(0.5) ? bz0 - 34 : bz1 + 34) : rng.range(bz0, bz1),
          angle: horiz ? 0 : Math.PI / 2, parked: true,
        });
      }
      kerbProps(bx0, bz0, bx1, bz1);
      for (let k = 0; k < rng.int(DENSITY.pedsPerBlockMin, DENSITY.pedsPerBlockMax); k++) {
        pedSpawns.push({ x: rng.range(bx0, bx1), y: rng.range(bz0, bz1) });
      }
    }
  }

  for (let y = 120; y < size; y += 150) palms.push({ x: rng.range(90, 230), y });
  for (const rx of roadsX) for (const rz of roadsZ) lamps.push({ x: rx + WORLD.road / 2 - 8, y: rz + WORLD.road / 2 - 8 });

  const pickupKinds = ['health', 'armour', 'pistol', 'shotgun', 'smg'];
  for (let i = 0; i < 30; i++) {
    pickups.push({ x: rng.range(400, size - 400), y: rng.range(400, size - 400), kind: pickupKinds[i % pickupKinds.length], taken: false });
  }
  for (let i = 0; i < 12; i++) {
    packages.push({ x: rng.range(300, size - 300), y: rng.range(300, size - 300), found: false });
  }

  function nearestRoadX(x) { let best = roadsX[0], bd = 1e18; for (const r of roadsX) { const d = Math.abs(r - x); if (d < bd) { bd = d; best = r; } } return best; }
  function nearestRoadZ(y) { let best = roadsZ[0], bd = 1e18; for (const r of roadsZ) { const d = Math.abs(r - y); if (d < bd) { bd = d; best = r; } } return best; }
  function onRoad(x, y) {
    const dx = Math.abs(x - nearestRoadX(x)), dz = Math.abs(y - nearestRoadZ(y));
    return dx < WORLD.road / 2 - 6 || dz < WORLD.road / 2 - 6;
  }
  function collidesBuilding(x, y, r) {
    for (const b of buildings) {
      const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return b;
    }
    return null;
  }
  function inWater(x, y) { return x < beach.x1 - 40 && x > water.x0; }

  return {
    size, roadsX, roadsZ, buildings, parks, lots, trees, benches, hydrants,
    billboards, busStops, palms, lamps, pickups, packages, carSpawns, pedSpawns,
    beach, water,
    nearestRoadX, nearestRoadZ, onRoad, collidesBuilding, inWater,
    daylight(t) {
      const day = Math.sin((t - 6) / 24 * Math.PI * 2);
      return clamp(0.5 + day * 0.55, 0.06, 1);
    },
    skyColor(t) {
      if (t >= 7 && t < 17) return PALETTE.skyNoon;
      if (t >= 17 && t < 19.5) return PALETTE.skyDusk;
      if (t >= 5.5 && t < 7) return '#e89a5a';
      return PALETTE.skyNight;
    },
  };
}

// Named spots, fixed so missions, staging and the garage all agree.
export const SPOTS = {
  marisolOffice: { x: 2450, y: 2650, label: "Marisol's Office" },
  marina: { x: 700, y: 3200, label: 'Marina' },
  bank: { x: 3100, y: 900, label: 'Solara National Bank' },
  docks: { x: 2600, y: 5600, label: 'Docks Warehouse' },
  uptown: { x: 3400, y: 800, label: 'Uptown Towers' },
  garage: { x: 2100, y: 3900, label: 'Safehouse Garage' },
  plaza: { x: 2600, y: 3000, label: 'Plaza del Sol' },
  hospital: { x: 4200, y: 2400, label: 'St. Aurelia Hospital' },
};
