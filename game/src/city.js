// Solara City: a procedural sun-soaked coastal city built from one fixed seed.
// Grid of avenues, six named districts, a beach strip and docks to the east.
// Everything is low-poly boxes/cylinders with a canvas window texture — no
// external assets, no network.
import * as THREE from 'three';
import { makeRng, clamp } from './rng.js';

export const BLOCK = 64;          // block size in metres
export const ROAD = 16;           // road width
export const GRID = 9;            // blocks per side
export const PITCH = BLOCK + ROAD;
export const CITY_HALF = (GRID * PITCH) / 2;

export const DISTRICTS = [
  { name: 'OLD TOWN',   x0: -CITY_HALF, z0: -CITY_HALF, x1: -80,  z1: -40,  color: '#c98a4b', stand: 0 },
  { name: 'DOWNTOWN',   x0: -80,  z0: -CITY_HALF, x1: 120,  z1: 60,   color: '#7fa8d8', stand: 0 },
  { name: 'PALM ROW',   x0: 120,  z0: -CITY_HALF, x1: CITY_HALF, z1: -40, color: '#7dc98a', stand: 0 },
  { name: 'DOCKS',      x0: 120,  z0: -40,  x1: CITY_HALF, z1: 180,  color: '#b08968', stand: 0 },
  { name: 'MARINA',     x0: -80,  z0: 60,   x1: 120,  z1: CITY_HALF, color: '#e8b64c', stand: 0 },
  { name: 'BEACHFRONT', x0: -CITY_HALF, z0: 180, x1: -80, z1: CITY_HALF, color: '#f2d38a', stand: 0 },
];

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 22) {
      const lit = Math.random() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#2c3e55';
      g.fillRect(x, y, 14, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[1];
}

// Snap a point onto the nearest road centre line.
export function nearestRoadPoint(x, z) {
  const gx = Math.round((x + CITY_HALF) / PITCH - 0.5);
  const gz = Math.round((z + CITY_HALF) / PITCH - 0.5);
  const roadX = -CITY_HALF + gx * PITCH + PITCH / 2 - ROAD / 2 - BLOCK / 2 + ROAD / 2;
  // road centre lines sit at multiples of PITCH offset by -CITY_HALF - ROAD/2
  const line = (i) => -CITY_HALF - ROAD / 2 + i * PITCH + ROAD / 2;
  const cx = line(Math.round((x - line(0)) / PITCH));
  const cz = line(Math.round((z - line(0)) / PITCH));
  const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
  if (dx < dz) return { x: cx, z, alongX: false };
  return { x, z: cz, alongX: true };
}

export function randomRoadPoint(rng) {
  const i = rng.int(0, GRID - 1);
  const j = rng.int(0, GRID - 1);
  const line = (k) => -CITY_HALF + k * PITCH + ROAD / 2;
  if (rng.chance(0.5)) return { x: line(i), z: -CITY_HALF + rng.range(0, GRID * PITCH), alongX: false };
  return { x: -CITY_HALF + rng.range(0, GRID * PITCH), z: line(j), alongX: true };
}

export function buildCity(scene, timeOfDay) {
  const rng = makeRng(20261124);
  const sun = timeOfDay === 'night'
    ? { sky: 0x0d1526, fog: 0x0d1526, sun: 0x8fa8d8, sunI: 0.55, hemi: 0x2c3a58, amb: 0.5 }
    : timeOfDay === 'dusk'
    ? { sky: 0xff9a52, fog: 0xe88a4a, sun: 0xffb35c, sunI: 1.35, hemi: 0x8a6a7a, amb: 0.55 }
    : { sky: 0xffb35c, fog: 0xf2a35e, sun: 0xffd9a0, sunI: 1.6, hemi: 0xffd9b0, amb: 0.6 };
  scene.background = new THREE.Color(sun.sky);
  scene.fog = new THREE.Fog(sun.fog, 120, 620);

  const hemi = new THREE.HemisphereLight(sun.hemi, 0x3a2f28, sun.amb);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(sun.sun, sun.sunI);
  sunLight.position.set(-180, 220, 120);
  sunLight.castShadow = false;
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  // Ground slab + beach + water (south edge is the sea).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, CITY_HALF * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5e }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, 90),
    new THREE.MeshLambertMaterial({ color: 0xe8d193 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY_HALF + 45 + 40);
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 400, 220),
    new THREE.MeshLambertMaterial({ color: 0x2a7a9e }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, CITY_HALF + 200);
  scene.add(water);

  // Roads: dark strips along the grid lines, plus centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8c86a });
  const roadGeoX = new THREE.BoxGeometry(GRID * PITCH + ROAD, 0.1, ROAD);
  const roadGeoZ = new THREE.BoxGeometry(ROAD, 0.1, GRID * PITCH + ROAD);
  for (let i = 0; i <= GRID; i++) {
    const p = -CITY_HALF - ROAD / 2 + i * PITCH + ROAD / 2;
    const rx = new THREE.Mesh(roadGeoX, roadMat);
    rx.position.set(0, 0, p); scene.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMat);
    rz.position.set(p, 0, 0); scene.add(rz);
  }
  // sidewalk strips around each block
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  const walkGeo = new THREE.BoxGeometry(BLOCK + 8, 0.08, BLOCK + 8);
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const w = new THREE.Mesh(walkGeo, walkMat);
      w.position.set(-CITY_HALF + ROAD + BLOCK / 2 + i * PITCH, 0.01,
        -CITY_HALF + ROAD + BLOCK / 2 + j * PITCH);
      scene.add(w);
    }
  }

  // Buildings: one InstancedMesh, per-instance tint, window texture.
  const winTex = windowTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshLambertMaterial({ map: winTex });
  const spots = [];
  const palette = [0xd8b48a, 0xb8c4d0, 0xe8d8b0, 0xc98a7a, 0x9ab8a0, 0xd0a0b8, 0x8fb8d8, 0xe0c090];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const cx = -CITY_HALF + ROAD + BLOCK / 2 + i * PITCH;
      const cz = -CITY_HALF + ROAD + BLOCK / 2 + j * PITCH;
      const d = districtAt(cx, cz);
      const n = d.name === 'DOWNTOWN' ? rng.int(4, 6) : rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const w = rng.range(10, 20), dep = rng.range(10, 20);
        const h = d.name === 'DOWNTOWN' ? rng.range(22, 68)
          : d.name === 'BEACHFRONT' ? rng.range(8, 18) : rng.range(10, 34);
        const ox = rng.range(-BLOCK / 2 + w / 2 + 3, BLOCK / 2 - w / 2 - 3);
        const oz = rng.range(-BLOCK / 2 + dep / 2 + 3, BLOCK / 2 - dep / 2 - 3);
        spots.push({ x: cx + ox, z: cz + oz, w, h, d: dep, c: rng.pick(palette) });
      }
    }
  }
  const inst = new THREE.InstancedMesh(bGeo, bMat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  const col = new THREE.Color();
  const colliders = [];
  spots.forEach((b, idx) => {
    pos.set(b.x, 0, b.z); s.set(b.w, b.h, b.d);
    m4.compose(pos, q, s);
    inst.setMatrixAt(idx, m4);
    inst.setColorAt(idx, col.setHex(b.c));
    colliders.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 });
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);

  // Rooftop details: neon signs on a few downtown towers.
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff4d8d });
  const neonMat2 = new THREE.MeshBasicMaterial({ color: 0x4dd8ff });
  spots.filter(b => b.h > 40).slice(0, 10).forEach((b, i) => {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.4), i % 2 ? neonMat : neonMat2);
    sign.position.set(b.x, b.h + 0.6, b.z - b.d / 2 - 0.2);
    scene.add(sign);
  });

  // Palms: instanced trunks + instanced frond cones, along beach + Palm Row.
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const frondGeo = new THREE.ConeGeometry(3.2, 2.6, 7);
  frondGeo.translate(0, 7.6, 0);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
  const palmSpots = [];
  for (let i = 0; i < 130; i++) {
    if (i < 60) {
      palmSpots.push({ x: -CITY_HALF + rng.range(0, GRID * PITCH), z: CITY_HALF + rng.range(6, 78) });
    } else {
      const p = randomRoadPoint(rng);
      palmSpots.push({ x: p.x + rng.range(-9, 9), z: p.z + rng.range(-9, 9) });
    }
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  palmSpots.forEach((p, idx) => {
    pos.set(p.x, 0, p.z); s.set(1, 1, 1);
    m4.compose(pos, q, s);
    trunks.setMatrixAt(idx, m4);
    fronds.setMatrixAt(idx, m4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  scene.add(trunks); scene.add(fronds);

  // Street props: lamps, hydrants, billboards, bus stops.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: timeOfDay === 'night' ? 0xffe9a8 : 0xfff2c8 });
  const lampGeo = new THREE.CylinderGeometry(0.18, 0.22, 6.5, 6);
  lampGeo.translate(0, 3.25, 0);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const lamps = [];
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j += 2) {
      const p = -CITY_HALF - ROAD / 2 + i * PITCH + ROAD / 2;
      const q2 = -CITY_HALF - ROAD / 2 + j * PITCH + ROAD / 2;
      lamps.push({ x: p + ROAD / 2 + 1, z: q2 });
      lamps.push({ x: q2, z: p + ROAD / 2 + 1 });
    }
  }
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
  const headMesh = new THREE.InstancedMesh(headGeo, lampHeadMat, lamps.length);
  lamps.forEach((l, idx) => {
    pos.set(l.x, 0, l.z); s.set(1, 1, 1);
    m4.compose(pos, q, s); lampMesh.setMatrixAt(idx, m4);
    pos.set(l.x, 6.4, l.z); m4.compose(pos, q, s); headMesh.setMatrixAt(idx, m4);
  });
  lampMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  scene.add(lampMesh); scene.add(headMesh);

  // Billboards on the Marina strip + docks cranes.
  const bbMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const bbFace = new THREE.MeshBasicMaterial({ color: 0xff5a3c });
  const bbFace2 = new THREE.MeshBasicMaterial({ color: 0x2ad8c8 });
  [[-40, 300, 0], [30, 300, 1], [200, 120, 0]].forEach(([x, z, f]) => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), bbMat);
    pole.position.set(x, 6, z); scene.add(pole);
    const face = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 0.5), f ? bbFace2 : bbFace);
    face.position.set(x, 14, z); scene.add(face);
  });
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a03c });
  for (let i = 0; i < 3; i++) {
    const crane = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), craneMat);
    leg.position.y = 13; crane.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2), craneMat);
    arm.position.set(12, 25, 0); crane.add(arm);
    crane.position.set(300 + i * 22, 0, -60 + i * 70);
    scene.add(crane);
  }

  // Garage lot (green pad) in Marina + docks warehouse block.
  const lot = new THREE.Mesh(new THREE.BoxGeometry(30, 0.15, 22),
    new THREE.MeshLambertMaterial({ color: 0x1e6a3a }));
  lot.position.set(40, 0.05, 250);
  scene.add(lot);
  const warehouse = new THREE.Mesh(new THREE.BoxGeometry(44, 12, 26),
    new THREE.MeshLambertMaterial({ color: 0x9a8a7a, map: winTex }));
  warehouse.position.set(300, 0, 40);
  scene.add(warehouse);
  colliders.push({ x0: 278, z0: 27, x1: 322, z1: 53 });

  // Night-market stalls for the on-foot shootout (Old Town crossroads).
  const stallColors = [0xd84a4a, 0x4a8ad8, 0xe8a03c, 0x7ac84a];
  const stalls = [];
  for (let i = 0; i < 8; i++) {
    const sx = -140 + (i % 4) * 14, sz = -132 + Math.floor(i / 4) * 16;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 3),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
    counter.position.y = 0.7; stall.add(counter);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 4),
      new THREE.MeshLambertMaterial({ color: stallColors[i % 4] }));
    roof.position.y = 3.2; stall.add(roof);
    const poleG = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6);
    const poleM = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    [[-3, -1.5], [3, -1.5], [-3, 1.5], [3, 1.5]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(poleG, poleM);
      p.position.set(px, 1.6, pz); stall.add(p);
    });
    stall.position.set(sx, 0, sz);
    scene.add(stall);
    stalls.push({ x: sx, z: sz });
    colliders.push({ x0: sx - 3.5, z0: sz - 2, x1: sx + 3.5, z1: sz + 2 });
  }

  return { colliders, stalls, garageLot: { x: 40, z: 250 }, rng };
}

// Circle vs building AABB push-out; returns corrected position.
export function collideBuildings(colliders, x, z, r) {
  for (const c of colliders) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) {
      const dxl = x + r - c.x0, dxr = c.x1 - (x - r);
      const dzl = z + r - c.z0, dzr = c.z1 - (z - r);
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.x0 - r;
      else if (m === dxr) x = c.x1 + r;
      else if (m === dzl) z = c.z0 - r;
      else z = c.z1 + r;
    }
  }
  return { x, z };
}

export function clampToCity(x, z, margin = 20) {
  return {
    x: clamp(x, -CITY_HALF - 40, CITY_HALF + 60),
    z: clamp(z, -CITY_HALF - 40, CITY_HALF + 130),
  };
}
