// Solara City generation, v2.1: a dense fixed-seed grid city.
// Roads run every WORLD.block pixels. Every block between them is filled:
// rows of buildings with varied roofs and neon, sidewalk trees, benches,
// hydrants, bus stops, billboards and parked cars along the kerb. The west
// edge is beach and water, the south is the Docks, the north is Uptown
// towers. Collision is circle-vs-rectangle against building footprints, and
// cars steer along the road lines.
import { WORLD, DISTRICTS, PALETTE, DENSITY } from './config.js';
import { createRandom, clamp } from './random.js';

const ROOFS = [
  '#8a6f5c', '#a5714f', '#6f7d8a', '#96705a', '#7a5c48',
  '#b08a5e', '#5e6b7a', '#c2a06a', '#94654f', '#77828e',
];
const WALLS = [
  '#d8c1a3', '#c9b18c', '#bfae9a', '#e0d3b8',
  '#c4a882', '#a89a86', '#d0bfa8', '#b7a58e',
];
const NEONS = ['#ff5ea8', '#37e0c8', '#ffd23f', '#7aa8ff', '#ff7a3c', '#c96bff'];
const LEAVES = ['#2f8f3e', '#3a7a2e', '#4e9a3a', '#2a7a35'];

// Which district a world point belongs to; Old Town is the fallback.
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.z0 && y < d.z1) return d;
  }
  return DISTRICTS[1];
}

export function createCity(seed) {
  const rng = createRandom(seed);
  const size = WORLD.size;
  const pitch = WORLD.block + WORLD.road;
  const roadsX = [];
  const roadsZ = [];
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

  // A handful of trees scattered inside a rectangle, for parks and plazas.
  function sprinkleTrees(x0, y0, x1, y1, n) {
    for (let i = 0; i < n; i++) {
      trees.push({
        x: rng.range(x0 + 14, x1 - 14),
        y: rng.range(y0 + 14, y1 - 14),
        r: rng.range(9, 15),
        color: rng.pick(LEAVES),
      });
    }
  }

  // Trees and benches along the block's sidewalk edges, plus the occasional
  // hydrant and bus stop. Every block gets these, whatever its type.
  function edgeProps(x0, y0, x1, y1) {
    const treeCount = rng.int(DENSITY.treesPerBlockMin, DENSITY.treesPerBlockMax);
    for (let i = 0; i < treeCount; i++) {
      const edge = rng.int(0, 3);
      if (edge === 0) {
        trees.push({ x: rng.range(x0, x1), y: y0 - 16, r: rng.range(9, 14), color: rng.pick(LEAVES) });
      } else if (edge === 1) {
        trees.push({ x: rng.range(x0, x1), y: y1 + 16, r: rng.range(9, 14), color: rng.pick(LEAVES) });
      } else if (edge === 2) {
        trees.push({ x: x0 - 16, y: rng.range(y0, y1), r: rng.range(9, 14), color: rng.pick(LEAVES) });
      } else {
        trees.push({ x: x1 + 16, y: rng.range(y0, y1), r: rng.range(9, 14), color: rng.pick(LEAVES) });
      }
    }
    const benchCount = rng.int(1, 3);
    for (let i = 0; i < benchCount; i++) {
      benches.push({
        x: rng.range(x0 + 20, x1 - 20),
        y: rng.chance(0.5) ? y0 - 12 : y1 + 12,
        angle: rng.chance(0.5) ? 0 : Math.PI / 2,
      });
    }
    if (rng.chance(0.6)) {
      hydrants.push({ x: rng.range(x0, x1), y: rng.chance(0.5) ? y0 - 18 : y1 + 18 });
    }
    if (rng.chance(0.4)) {
      busStops.push({ x: rng.chance(0.5) ? x0 - 30 : x1 + 30, y: rng.range(y0, y1) });
    }
  }

  for (let bi = 0; bi < roadsX.length - 1; bi++) {
    for (let bj = 0; bj < roadsZ.length - 1; bj++) {
      const left = roadsX[bi] + WORLD.road / 2;
      const top = roadsZ[bj] + WORLD.road / 2;
      const right = roadsX[bi + 1] - WORLD.road / 2;
      const bottom = roadsZ[bj + 1] - WORLD.road / 2;
      const cx = (left + right) / 2;
      const cz = (top + bottom) / 2;
      const district = districtAt(cx, cz);
      const dice = rng.next();
      if (left < 340) continue; // beach blocks stay open sand
      if (dice < 0.08) {
        // Park: open green with a cluster of trees.
        parks.push({
          x0: left, y0: top, x1: right, y1: bottom,
          trees: rng.int(10, 20),
        });
        sprinkleTrees(left, top, right, bottom, rng.int(8, 14));
        edgeProps(left, top, right, bottom);
        continue;
      }
      if (dice < 0.13) {
        // Parking lot: a few parked cars, no buildings.
        lots.push({ x0: left, y0: top, x1: right, y1: bottom });
        const lotCars = rng.int(5, 9);
        for (let k = 0; k < lotCars; k++) {
          carSpawns.push({
            x: rng.range(left + 40, right - 40),
            y: rng.range(top + 40, bottom - 40),
            angle: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
            parked: true,
          });
        }
        edgeProps(left, top, right, bottom);
        continue;
      }
      if (dice < 0.16) {
        // Plaza: paved square with a few trees.
        parks.push({
          x0: left, y0: top, x1: right, y1: bottom,
          plaza: true, trees: rng.int(3, 6),
        });
        sprinkleTrees(left, top, right, bottom, rng.int(3, 6));
        edgeProps(left, top, right, bottom);
        continue;
      }
      // Built block: 3-6 buildings, tighter and taller than v1. Uptown gets
      // one or two towers instead of a row of low buildings.
      const howMany = district.name === 'Uptown' ? rng.int(1, 2) : rng.int(3, 6);
      for (let k = 0; k < howMany; k++) {
        const w = rng.range(80, 150);
        const h = rng.range(80, 150);
        const x = rng.range(left + 16, right - 16 - w);
        const y = rng.range(top + 16, bottom - 16 - h);
        const floors = district.name === 'Uptown' ? rng.int(4, 10) : rng.int(1, 4);
        const hasBoard = rng.chance(0.18);
        const b = {
          x,
          y,
          w,
          h,
          floors,
          roof: rng.pick(ROOFS),
          wall: rng.pick(WALLS),
          neon: rng.chance(0.3) ? rng.pick(NEONS) : null,
          board: hasBoard ? rng.pick(NEONS) : null,
          name: district.name,
        };
        buildings.push(b);
        if (hasBoard) {
          billboards.push({
            x: b.x + b.w / 2,
            y: b.y - 6,
            w: Math.min(64, b.w - 20),
            color: b.board,
          });
        }
      }
      // Parked cars along both kerbs, denser than v1.
      const kerbCars = rng.int(DENSITY.parkedPerBlockMin, DENSITY.parkedPerBlockMax);
      for (let k = 0; k < kerbCars; k++) {
        const horiz = rng.chance(0.5);
        carSpawns.push({
          x: horiz ? rng.range(left, right) : (rng.chance(0.5) ? left - 34 : right + 34),
          y: horiz ? (rng.chance(0.5) ? top - 34 : bottom + 34) : rng.range(top, bottom),
          angle: horiz ? 0 : Math.PI / 2,
          parked: true,
        });
      }
      edgeProps(left, top, right, bottom);
      const walkers = rng.int(DENSITY.pedsPerBlockMin, DENSITY.pedsPerBlockMax);
      for (let k = 0; k < walkers; k++) {
        pedSpawns.push({ x: rng.range(left, right), y: rng.range(top, bottom) });
      }
    }
  }

  // Palm trees down the beach strip, and a lamp at every intersection.
  for (let y = 120; y < size; y += 150) {
    palms.push({ x: rng.range(90, 230), y });
  }
  for (const rx of roadsX) {
    for (const rz of roadsZ) {
      lamps.push({ x: rx + WORLD.road / 2 - 8, y: rz + WORLD.road / 2 - 8 });
    }
  }

  // Pickups and hidden packages, resampled until the spot is walkable so
  // none of them ever spawns on a rooftop.
  const pickupKinds = ['health', 'armour', 'pistol', 'shotgun', 'smg'];
  for (let i = 0; i < 30; i++) {
    let x, y, tries = 0;
    do {
      x = rng.range(400, size - 400);
      y = rng.range(400, size - 400);
      tries++;
    } while (collidesBuilding(x, y, 20) && tries < 20);
    pickups.push({
      x,
      y,
      kind: pickupKinds[i % pickupKinds.length],
      taken: false,
    });
  }
  for (let i = 0; i < 12; i++) {
    let x, y, tries = 0;
    do {
      x = rng.range(300, size - 300);
      y = rng.range(300, size - 300);
      tries++;
    } while (collidesBuilding(x, y, 20) && tries < 20);
    packages.push({ x, y, found: false });
  }

  function nearestRoadX(x) {
    let best = roadsX[0];
    let bd = 1e18;
    for (const r of roadsX) {
      const d = Math.abs(r - x);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  function nearestRoadZ(y) {
    let best = roadsZ[0];
    let bd = 1e18;
    for (const r of roadsZ) {
      const d = Math.abs(r - y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  function onRoad(x, y) {
    const dx = Math.abs(x - nearestRoadX(x));
    const dz = Math.abs(y - nearestRoadZ(y));
    return dx < WORLD.road / 2 - 6 || dz < WORLD.road / 2 - 6;
  }

  // Circle vs building rectangles; returns the building hit, or null.
  function collidesBuilding(x, y, r) {
    for (const b of buildings) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return b;
    }
    return null;
  }

  function inWater(x, y) {
    return x < beach.x1 - 40 && x > water.x0;
  }

  return {
    size,
    roadsX,
    roadsZ,
    buildings,
    parks,
    lots,
    trees,
    benches,
    hydrants,
    billboards,
    busStops,
    palms,
    lamps,
    pickups,
    packages,
    carSpawns,
    pedSpawns,
    beach,
    water,
    nearestRoadX,
    nearestRoadZ,
    onRoad,
    collidesBuilding,
    inWater,
    // How bright the world is at a given clock hour: full day, dim night.
    daylight(t) {
      const day = Math.sin((t - 6) / 24 * Math.PI * 2);
      return clamp(0.5 + day * 0.55, 0.06, 1);
    },
    // Sky colour by time of day: noon gold, dusk orange, dawn pink, night navy.
    skyColor(t) {
      if (t >= 7 && t < 17) return PALETTE.skyNoon;
      if (t >= 17 && t < 19.5) return PALETTE.skyDusk;
      if (t >= 5.5 && t < 7) return '#e89a5a';
      return PALETTE.skyNight;
    },
  };
}

// Named spots, fixed so missions, staging and the garage all agree on them.
export const SPOTS = {
  marisolOffice: {
    x: 2450, y: 2650, label: "Marisol's Office",
  },
  marina: {
    x: 700, y: 3200, label: 'Marina',
  },
  bank: {
    x: 3100, y: 900, label: 'Solara National Bank',
  },
  docks: {
    x: 2600, y: 5600, label: 'Docks Warehouse',
  },
  uptown: {
    x: 3400, y: 800, label: 'Uptown Towers',
  },
  garage: {
    x: 2100, y: 3900, label: 'Safehouse Garage',
  },
  plaza: {
    x: 2600, y: 3000, label: 'Plaza del Sol',
  },
  hospital: {
    x: 4200, y: 2400, label: 'St. Aurelia Hospital',
  },
};
