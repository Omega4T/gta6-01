// Procedural Solara City: a fixed-seed grid of roads, blocks, buildings, parks,
// the beach and the docks. The same seed always builds the same city, so the
// screenshots are reproducible and the missions can name fixed landmarks.

import { CFG } from './config.js';
import { rand, randi, pick, chance, shuffle } from './random.js';

export const ROAD_CENTERS = [300, 900, 1500, 2100, 2700, 3300, 3900, 4500];

// Fixed places the missions and side jobs use.
export const LANDMARKS = {
  safehouse: { x: 1500, y: 2100, label: 'Safehouse Garage' },
  bank:      { x: 2700, y: 600,  label: 'Uptown Bank' },
  docksDrop: { x: 2400, y: 4500, label: 'Docks Warehouse' },
  marina:    { x: 600,  y: 2400, label: 'Marina' },
  oldTown:   { x: 2100, y: 2100, label: 'Old Town Plaza' },
  raceStart: { x: 4500, y: 1500, label: 'East Highway' },
  airport:   { x: 3900, y: 900,  label: 'Airfield Gate' },
  plaza:     { x: 2100, y: 2700, label: 'Central Plaza' },
};

// Build the whole city from the seeded stream.
export function buildCity(rng) {
  const size = CFG.worldSize;
  const half = CFG.roadWidth / 2;
  const blocks = [];
  const buildings = [];
  const trees = [];
  const props = [];
  const parked = [];
  const lights = [];
  const roofColors = [CFG.colors.roofA, CFG.colors.roofB, CFG.colors.roofC, CFG.colors.roofD];

  // Interior blocks: the cells between neighbouring roads.
  for (let bi = 0; bi < 7; bi++) {
    for (let bj = 0; bj < 7; bj++) {
      const x0 = ROAD_CENTERS[bi] + half + 12;
      const x1 = ROAD_CENTERS[bi + 1] - half - 12;
      const y0 = ROAD_CENTERS[bj] + half + 12;
      const y1 = ROAD_CENTERS[bj + 1] - half - 12;
      const roll = rng();
      const kind = roll < 0.72 ? 'buildings' : roll < 0.82 ? 'park' : roll < 0.90 ? 'plaza' : roll < 0.96 ? 'parking' : 'grass';
      const block = { x0, y0, x1, y1, kind, district: districtAt(x0 + 10, y0 + 10).name };
      blocks.push(block);

      if (kind === 'buildings') {
        // 4 to 7 buildings on a loose sub-grid inside the block, plus a
        // few trees along the block's edges so no block reads as bare grass.
        const count = randi(rng, 4, 7);
        const cols = count <= 4 ? 2 : 3;
        const rows = Math.ceil(count / cols);
        const cw = (x1 - x0) / cols;
        const ch = (y1 - y0) / rows;
        let placed = 0;
        for (let r = 0; r < rows && placed < count; r++) {
          for (let c = 0; c < cols && placed < count; c++) {
            const w = rand(rng, 90, Math.min(190, cw - 36));
            const h = rand(rng, 80, Math.min(170, ch - 36));
            const bx = x0 + c * cw + (cw - w) / 2 + rand(rng, -8, 8);
            const by = y0 + r * ch + (ch - h) / 2 + rand(rng, -8, 8);
            const uptown = block.district === 'Uptown';
            buildings.push({
              x: bx + w / 2, y: by + h / 2, w, h,
              roof: pick(rng, roofColors),
              tall: uptown ? randi(rng, 2, 4) : randi(rng, 1, 2),
              ac: chance(rng, 0.7),
              neon: chance(rng, 0.25),
              district: block.district,
            });
            placed++;
          }
        }
        const shade = randi(rng, 2, 4);
        for (let i = 0; i < shade; i++) {
          const tx = rand(rng, x0 + 24, x1 - 24), ty = rand(rng, y0 + 24, y1 - 24);
          if (!blockedAtPoint(buildings, tx, ty, 26)) trees.push({ x: tx, y: ty, palm: false });
        }
      } else if (kind === 'park') {
        const n = randi(rng, 6, 10);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rand(rng, x0 + 30, x1 - 30), y: rand(rng, y0 + 30, y1 - 30), palm: false });
        }
        if (chance(rng, 0.6)) props.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, kind: 'bench' });
      } else if (kind === 'parking') {
        const n = randi(rng, 4, 8);
        for (let i = 0; i < n; i++) {
          parked.push({
            x: rand(rng, x0 + 40, x1 - 40), y: rand(rng, y0 + 40, y1 - 40),
            ang: chance(rng, 0.5) ? 0 : Math.PI / 2,
            type: pick(rng, ['sedan', 'sedan', 'taxi', 'van', 'muscle']),
          });
        }
      }
      // A couple of sidewalk props per block, on its edges.
      if (chance(rng, 0.5)) props.push({ x: x0 - 6, y: rand(rng, y0 + 40, y1 - 40), kind: 'hydrant' });
      if (chance(rng, 0.4)) props.push({ x: rand(rng, x0 + 40, x1 - 40), y: y0 - 6, kind: 'busstop' });
    }
  }

  // Beach palms along the west sand strip, and a few trees on the east edge.
  for (let i = 0; i < 42; i++) {
    trees.push({ x: rand(rng, 70, 220), y: rand(rng, 120, size - 120), palm: true });
  }
  let guard = 0;
  while (trees.length < CFG.treeCount && guard < 4000) {
    guard++;
    const x = rand(rng, 0, size), y = rand(rng, 0, size);
    if (isOnRoad(x, y)) continue;
    if (blockedAtPoint(buildings, x, y, 26)) continue;
    trees.push({ x, y, palm: chance(rng, 0.3) });
  }

  // Parked cars along road edges, clear of intersections.
  guard = 0;
  const carColors = ['#c8ccd4', '#d42a2a', '#2a6fd4', '#f2c200', '#3ec98a', '#e8e8e8', '#5a4a6a'];
  while (parked.length < CFG.parkedCount && guard < 6000) {
    guard++;
    const vertical = chance(rng, 0.5);
    const road = pick(rng, ROAD_CENTERS);
    const along = rand(rng, 140, size - 140);
    const side = chance(rng, 0.5) ? 1 : -1;
    const x = vertical ? road + side * (half + 18) : along;
    const y = vertical ? along : road + side * (half + 18);
    if (nearIntersection(x, y)) continue;
    if (blockedAtPoint(buildings, x, y, 40)) continue;
    parked.push({ x, y, ang: vertical ? Math.PI / 2 : 0, type: pick(rng, ['sedan', 'sedan', 'taxi', 'van', 'muscle', 'beach']), color: pick(rng, carColors) });
  }

  // Traffic lights at every interior intersection, each with its own phase.
  for (const rx of ROAD_CENTERS) {
    for (const ry of ROAD_CENTERS) {
      lights.push({ x: rx, y: ry, phase: rand(rng, 0, 12) });
    }
  }

  // Billboards on a few long straights, lamps along the marina road.
  for (let i = 0; i < 10; i++) {
    const road = pick(rng, ROAD_CENTERS);
    props.push({ x: road + (chance(rng, 0.5) ? half + 26 : -half - 26), y: rand(rng, 300, size - 300), kind: 'billboard' });
  }
  for (let y = 300; y < size; y += 300) {
    props.push({ x: 300 + half + 10, y, kind: 'lamp' });
  }

  return { size, blocks, buildings, trees, props, parked, lights };
}

// True when the point is on a road surface.
export function isOnRoad(x, y) {
  const half = CFG.roadWidth / 2;
  for (const c of ROAD_CENTERS) {
    if (Math.abs(x - c) < half || Math.abs(y - c) < half) return true;
  }
  return false;
}

// True when the point is close to any intersection centre.
export function nearIntersection(x, y) {
  for (const rx of ROAD_CENTERS) {
    for (const ry of ROAD_CENTERS) {
      if (Math.abs(x - rx) < 110 && Math.abs(y - ry) < 110) return true;
    }
  }
  return false;
}

// The district a point belongs to, by the config's district boxes.
export function districtAt(x, y) {
  for (const d of CFG.districts) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return CFG.districts[2];
}

// Circle-versus-buildings test used by the physics.
export function blockedAtPoint(buildings, x, y, r) {
  if (x < 44 + r || y < 4 + r || x > CFG.worldSize - 4 - r || y > CFG.worldSize - 4 - r) return true;
  for (const b of buildings) {
    const cx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
    const cy = Math.max(b.y - b.h / 2, Math.min(y, b.y + b.h / 2));
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

// Push a circle out of buildings and the world edge; returns true if it hit.
export function resolveBuildingCollision(buildings, body, r) {
  let hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x - b.w / 2, Math.min(body.x, b.x + b.w / 2));
    const cy = Math.max(b.y - b.h / 2, Math.min(body.y, b.y + b.h / 2));
    const dx = body.x - cx, dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * r;
        body.y = cy + (dy / d) * r;
      } else {
        body.y = b.y - b.h / 2 - r;
      }
    }
  }
  body.x = Math.max(44 + r, Math.min(CFG.worldSize - r, body.x));
  body.y = Math.max(4 + r, Math.min(CFG.worldSize - r, body.y));
  return hit;
}

// A random point on a road, for spawning traffic.
export function randomRoadPoint(rng) {
  const vertical = chance(rng, 0.5);
  const road = pick(rng, ROAD_CENTERS);
  const along = rand(rng, 200, CFG.worldSize - 200);
  return vertical ? { x: road, y: along, ang: Math.PI / 2 } : { x: along, y: road, ang: 0 };
}

// A random point on a sidewalk, for spawning pedestrians.
export function randomSidewalkPoint(rng) {
  const vertical = chance(rng, 0.5);
  const road = pick(rng, ROAD_CENTERS);
  const along = rand(rng, 200, CFG.worldSize - 200);
  const side = chance(rng, 0.5) ? 1 : -1;
  const off = CFG.roadWidth / 2 + 14;
  return vertical ? { x: road + side * off, y: along } : { x: along, y: road + side * off };
}

// The nearest road centre line to a point, with its axis.
export function nearestRoad(x, y) {
  let best = null, bestD = Infinity, axis = 'v';
  for (const c of ROAD_CENTERS) {
    const d = Math.abs(x - c);
    if (d < bestD) { bestD = d; best = c; axis = 'v'; }
    const d2 = Math.abs(y - c);
    if (d2 < bestD) { bestD = d2; best = c; axis = 'h'; }
  }
  return { center: best, axis, dist: bestD };
}
