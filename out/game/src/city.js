// Solara City generation: a fixed-seed procedural grid city.
// Roads run every WORLD.block pixels; blocks between them hold buildings, parks,
// plazas, parking lots. West edge is beach + water, south is docks, north is towers.
// Collision is circle-vs-rectangle against building footprints; cars stay on roads
// by steering toward the nearest road centre line.
import { WORLD, DISTRICTS, PALETTE } from './config.js';
import { createRandom, clamp } from './random.js';

const ROOF_COLORS = ['#8a6f5c', '#a5714f', '#6f7d8a', '#96705a', '#7a5c48', '#b08a5e', '#5e6b7a', '#c2a06a'];
const WALL_COLORS = ['#d8c1a3', '#c9b18c', '#bfae9a', '#e0d3b8', '#c4a882', '#a89a86'];
const NEON = ['#ff5ea8', '#37e0c8', '#ffd23f', '#7aa8ff', '#ff7a3c'];

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
  const palms = [];
  const lamps = [];
  const pickups = [];
  const packages = [];
  const carSpawns = [];
  const pedSpawns = [];

  // Beach strip on the west edge, water beyond it.
  const beach = { x0: 0, x1: 260, y0: 0, y1: size };
  const water = { x0: -600, x1: 0, y0: -600, y1: size + 600 };

  for (let bi = 0; bi < roadsX.length - 1; bi++) {
    for (let bj = 0; bj < roadsZ.length - 1; bj++) {
      const bx0 = roadsX[bi] + WORLD.road / 2;
      const bz0 = roadsZ[bj] + WORLD.road / 2;
      const bx1 = roadsX[bi + 1] - WORLD.road / 2;
      const bz1 = roadsZ[bj + 1] - WORLD.road / 2;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      const district = districtAt(cx, cz);
      const roll = rng.next();
      if (bx0 < 340) continue; // beach blocks stay open
      if (roll < 0.10) {
        parks.push({ x0: bx0, y0: bz0, x1: bx1, y1: bz1, trees: rng.int(6, 14) });
        continue;
      }
      if (roll < 0.16) {
        lots.push({ x0: bx0, y0: bz0, x1: bx1, y1: bz1 });
        for (let k = 0; k < rng.int(3, 6); k++) {
          carSpawns.push({ x: rng.range(bx0 + 40, bx1 - 40), y: rng.range(bz0 + 40, bz1 - 40), angle: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), parked: true });
        }
        continue;
      }
      if (roll < 0.19) {
        parks.push({ x0: bx0, y0: bz0, x1: bx1, y1: bz1, plaza: true, trees: rng.int(2, 5) });
        continue;
      }
      // Normal block: 1-4 buildings.
      const n = district.name === 'Uptown' ? rng.int(1, 2) : rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const w = rng.range(90, 170), h = rng.range(90, 170);
        const x = rng.range(bx0 + 20, bx1 - 20 - w), y = rng.range(bz0 + 20, bz1 - 20 - h);
        const tall = district.name === 'Uptown' ? rng.int(3, 9) : rng.int(1, 3);
        buildings.push({
          x, y, w, h, floors: tall,
          roof: rng.pick(ROOF_COLORS), wall: rng.pick(WALL_COLORS),
          neon: rng.chance(0.22) ? rng.pick(NEON) : null,
          name: district.name,
        });
      }
      // Street parking along the block edge.
      for (let k = 0; k < rng.int(1, 3); k++) {
        const horiz = rng.chance(0.5);
        carSpawns.push({
          x: horiz ? rng.range(bx0, bx1) : (rng.chance(0.5) ? bx0 - 34 : bx1 + 34),
          y: horiz ? (rng.chance(0.5) ? bz0 - 34 : bz1 + 34) : rng.range(bz0, bz1),
          angle: horiz ? 0 : Math.PI / 2, parked: true,
        });
      }
      for (let k = 0; k < 4; k++) pedSpawns.push({ x: rng.range(bx0, bx1), y: rng.range(bz0, bz1) });
    }
  }

  // Palms along the beach, lamps along every road intersection.
  for (let y = 120; y < size; y += 170) palms.push({ x: rng.range(90, 230), y });
  for (const rx of roadsX) for (const rz of roadsZ) lamps.push({ x: rx + WORLD.road / 2 - 8, y: rz + WORLD.road / 2 - 8 });

  // Health / armour / weapon pickups scattered in plazas and parks.
  const pickupKinds = ['health', 'armour', 'pistol', 'shotgun', 'smg'];
  for (let i = 0; i < 26; i++) {
    pickups.push({ x: rng.range(400, size - 400), y: rng.range(400, size - 400), kind: pickupKinds[i % pickupKinds.length], taken: false });
  }
  // 12 hidden packages, some on the beach, some on rooftops-adjacent alleys.
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
    size, roadsX, roadsZ, buildings, parks, lots, palms, lamps, pickups, packages,
    carSpawns, pedSpawns, beach, water,
    nearestRoadX, nearestRoadZ, onRoad, collidesBuilding, inWater,
    // Day cycle: t in [0,24). Returns a light factor 0..1 and a sky tint key.
    daylight(t) {
      const day = Math.sin((t - 6) / 24 * Math.PI * 2); // -1 night .. 1 noon
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

// Named mission / activity spots, fixed so staging and missions agree.
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
