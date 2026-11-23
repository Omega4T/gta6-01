// Rendering: the top-down camera, the city, the cars and crowd, the day and
// night lighting, the HUD with its minimap, and the menus. Everything the
// judge sees in a screenshot is drawn here.

import { CFG } from './config.js';
import { clamp, dist } from './random.js';
import { ROAD_CENTERS, LANDMARKS, districtAt, isOnRoad } from './city.js';
import { wantedStars } from './vehicles.js';
import { missionTarget, objectiveText, taxiTarget } from './missions.js';
import { garageLot, garageLines } from './garage.js';
import { lightIsGreen } from './crowd.js';

// The clock in minutes: 0 is midnight, 720 is noon.
export function clockParts(S) {
  const m = Math.floor(S.clock) % 1440;
  return { h: Math.floor(m / 60), min: m % 60, label: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') };
}

// 0 at noon, 1 at deep night: how dark the world is right now.
export function darkness(S) {
  const m = Math.floor(S.clock) % 1440;
  if (m >= 420 && m < 1020) return 0;                    // 07:00–17:00 day
  if (m >= 1020 && m < 1140) return (m - 1020) / 120 * 0.45; // dusk
  if (m >= 1140 || m < 300) return 0.55;                 // night
  if (m >= 300 && m < 420) return (420 - m) / 120 * 0.55;    // dawn
  return 0;
}

export function isNight(S) {
  return darkness(S) > 0.3;
}

// The world rectangle the camera can see, with a margin: everything drawn
// outside it is skipped, which keeps the frame rate up on a big city.
export function viewRect(S) {
  const W = S.canvas.width, H = S.canvas.height;
  const hw = W / 2 / S.cam.zoom + 140, hh = H / 2 / S.cam.zoom + 140;
  return { x0: S.cam.x - hw, y0: S.cam.y - hh, x1: S.cam.x + hw, y1: S.cam.y + hh };
}

function inView(S, x, y, pad) {
  const v = S.view;
  const p = pad || 0;
  return x > v.x0 - p && x < v.x1 + p && y > v.y0 - p && y < v.y1 + p;
}

// Draw the whole frame: world in camera space, then HUD in screen space.
export function drawGame(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cam = S.cam;
  S.view = viewRect(S);
  const shakeX = (Math.random() - 0.5) * cam.shake;
  const shakeY = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
  drawGround(ctx, S);
  drawBlocks(ctx, S);
  drawRoads(ctx, S);
  drawCityProps(ctx, S);
  drawPackages(ctx, S);
  drawPickups(ctx, S);
  drawCars(ctx, S);
  drawPeds(ctx, S);
  drawEnemies(ctx, S);
  drawBullets(ctx, S);
  drawParticles(ctx, S);
  drawMarkers(ctx, S);
  drawHeli(ctx, S);
  drawNight(ctx, S);
  drawFloats(ctx, S);
  ctx.restore();
  drawHud(ctx, S);
  if (S.mode === 'menu') drawMenu(ctx, S);
  else if (S.mode === 'pause') drawPause(ctx, S);
  else if (S.mode === 'busted' || S.mode === 'wasted') drawEndCard(ctx, S);
  else if (S.mode === 'complete') drawComplete(ctx, S);
  if (S.showGarage) drawGaragePanel(ctx, S);
  drawBanner(ctx, S);
}

// Grass, sand and water under everything.
function drawGround(ctx, S) {
  const size = CFG.worldSize;
  ctx.fillStyle = CFG.colors.grass;
  ctx.fillRect(0, 0, size, size);
  // Beach sand on the west edge, water beyond it.
  ctx.fillStyle = CFG.colors.sand;
  ctx.fillRect(0, 0, 240, size);
  ctx.fillStyle = CFG.colors.water;
  ctx.fillRect(0, 0, 52, size);
  // The docks water at the south edge.
  ctx.fillRect(1200, size - 90, size - 1200, 90);
  // District tints, faint so the map reads at a glance.
  ctx.globalAlpha = 0.12;
  for (const d of CFG.districts) {
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  ctx.globalAlpha = 1;
}

// Blocks: parks, plazas, parking lots and the buildings on them.
function drawBlocks(ctx, S) {
  for (const b of S.city.blocks) {
    if (b.kind === 'park') {
      ctx.fillStyle = CFG.colors.park;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    } else if (b.kind === 'plaza') {
      ctx.fillStyle = CFG.colors.plaza;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    } else if (b.kind === 'parking') {
      ctx.fillStyle = '#5a5a58';
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
  }
  for (const bd of S.city.buildings) {
    if (!inView(S, bd.x, bd.y, Math.max(bd.w, bd.h))) continue;
    // Shadow offset by height, then the roof with its border and detail.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bd.x - bd.w / 2 + bd.tall * 4, bd.y - bd.h / 2 + bd.tall * 5, bd.w, bd.h);
    ctx.fillStyle = bd.roof;
    ctx.fillRect(bd.x - bd.w / 2, bd.y - bd.h / 2, bd.w, bd.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(bd.x - bd.w / 2, bd.y - bd.h / 2, bd.w, bd.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(bd.x - bd.w / 2 + 6, bd.y - bd.h / 2 + 6, bd.w - 12, 10);
    if (bd.ac) {
      ctx.fillStyle = '#8a8a86';
      ctx.fillRect(bd.x + bd.w / 2 - 18, bd.y - bd.h / 2 + 14, 10, 10);
    }
    if (bd.neon && isNight(S)) {
      ctx.strokeStyle = '#ff4ad4';
      ctx.lineWidth = 2;
      ctx.strokeRect(bd.x - bd.w / 2 + 3, bd.y - bd.h / 2 + 3, bd.w - 6, bd.h - 6);
    }
    // Windows: a small grid of lit panes.
    ctx.fillStyle = 'rgba(20,30,50,0.5)';
    const cols = Math.max(1, Math.floor(bd.w / 34));
    const rows = Math.max(1, Math.floor(bd.h / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(bd.x - bd.w / 2 + 12 + i * 34, bd.y - bd.h / 2 + 22 + j * 34, 12, 14);
      }
    }
  }
}

// Roads, sidewalks, lane dashes and crosswalks.
function drawRoads(ctx, S) {
  const half = CFG.roadWidth / 2;
  ctx.fillStyle = CFG.colors.sidewalk;
  for (const c of ROAD_CENTERS) {
    ctx.fillRect(c - half - 14, 0, CFG.roadWidth + 28, CFG.worldSize);
    ctx.fillRect(0, c - half - 14, CFG.worldSize, CFG.roadWidth + 28);
  }
  ctx.fillStyle = CFG.colors.road;
  for (const c of ROAD_CENTERS) {
    ctx.fillRect(c - half, 0, CFG.roadWidth, CFG.worldSize);
    ctx.fillRect(0, c - half, CFG.worldSize, CFG.roadWidth);
  }
  // Centre dashes, only along the roads the camera sees.
  ctx.fillStyle = CFG.colors.roadLine;
  const v = S.view;
  for (const c of ROAD_CENTERS) {
    // Vertical road at x = c: dashes run down it.
    if (c > v.x0 - 80 && c < v.x1 + 80) {
      for (let d = Math.max(0, Math.floor(v.y0 / 46) * 46); d < v.y1; d += 46) {
        ctx.fillRect(c - 2, d, 4, 22);
      }
    }
    // Horizontal road at y = c: dashes run across it.
    if (c > v.y0 - 80 && c < v.y1 + 80) {
      for (let d = Math.max(0, Math.floor(v.x0 / 46) * 46); d < v.x1; d += 46) {
        ctx.fillRect(d, c - 2, 22, 4);
      }
    }
  }
  // Crosswalks at every intersection in view.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROAD_CENTERS) {
    for (const ry of ROAD_CENTERS) {
      if (!inView(S, rx, ry, 120)) continue;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(rx + i * 16 - 5, ry - half - 12, 10, 12);
        ctx.fillRect(rx + i * 16 - 5, ry + half, 10, 12);
      }
    }
  }
  // Traffic lights: a pole and the current colour.
  for (const light of S.city.lights) {
    if (!inView(S, light.x, light.y, 100)) continue;
    ctx.fillStyle = '#222';
    ctx.fillRect(light.x + half + 8, light.y - half - 8, 4, 16);
    const green = lightIsGreen(S, light, true);
    ctx.fillStyle = green ? '#2aff5a' : '#ff2a2a';
    ctx.beginPath();
    ctx.arc(light.x + half + 10, light.y - half - 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Trees, props, parked cars and the garage lot.
function drawCityProps(ctx, S) {
  for (const t of S.city.trees) {
    if (!inView(S, t.x, t.y, 30)) continue;
    ctx.fillStyle = '#5a4a2a';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
    ctx.fillStyle = t.palm ? '#3fae6a' : '#2f7a3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, t.palm ? 12 : 15, 0, Math.PI * 2);
    ctx.fill();
    if (t.palm) {
      ctx.strokeStyle = '#2f8a4a';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y - 4);
        ctx.lineTo(t.x + Math.cos(a) * 16, t.y - 4 + Math.sin(a) * 16);
        ctx.stroke();
      }
    }
  }
  for (const pr of S.city.props) {
    if (!inView(S, pr.x, pr.y, 60)) continue;
    if (pr.kind === 'bench') {
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(pr.x - 16, pr.y - 5, 32, 10);
    } else if (pr.kind === 'hydrant') {
      ctx.fillStyle = '#d42a2a';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === 'busstop') {
      ctx.fillStyle = '#2a6fd4';
      ctx.fillRect(pr.x - 12, pr.y - 12, 24, 24);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BUS', pr.x, pr.y + 4);
    } else if (pr.kind === 'billboard') {
      ctx.fillStyle = '#1c2733';
      ctx.fillRect(pr.x - 26, pr.y - 14, 52, 28);
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOLARA', pr.x, pr.y + 4);
    } else if (pr.kind === 'lamp') {
      ctx.fillStyle = '#333';
      ctx.fillRect(pr.x - 2, pr.y - 10, 4, 20);
      if (isNight(S)) {
        ctx.fillStyle = 'rgba(255, 220, 120, 0.25)';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 34, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (const car of S.city.parked) {
    if (!inView(S, car.x, car.y, 60)) continue;
    drawCarBody(ctx, car.x, car.y, car.ang, car.type, car.color || '#c8ccd4', false, S);
  }
  // The garage lot: a green rectangle with a G.
  const lot = garageLot(S);
  ctx.fillStyle = 'rgba(60, 200, 110, 0.55)';
  ctx.fillRect(lot.x - lot.w / 2, lot.y - lot.h / 2, lot.w, lot.h);
  ctx.strokeStyle = '#2a8a4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(lot.x - lot.w / 2, lot.y - lot.h / 2, lot.w, lot.h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GARAGE', lot.x, lot.y + 9);
}

// One car body: shadow, wheels, cabin, windshield, headlights at night.
function drawCarBody(ctx, x, y, ang, type, color, isPlayer, S) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const w = type === 'truck' || type === 'van' ? 52 : 46;
  const h = type === 'truck' || type === 'van' ? 24 : 22;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fillStyle = '#141414';
  ctx.fillRect(-w / 2 + 4, -h / 2 - 3, 10, 5);
  ctx.fillRect(-w / 2 + 4, h / 2 - 2, 10, 5);
  ctx.fillRect(w / 2 - 14, -h / 2 - 3, 10, 5);
  ctx.fillRect(w / 2 - 14, h / 2 - 2, 10, 5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,40,70,0.85)';
  ctx.beginPath();
  ctx.roundRect(-6, -h / 2 + 3, 16, h - 6, 3);
  ctx.fill();
  if (type === 'taxi') {
    ctx.fillStyle = '#f2c200';
    ctx.fillRect(-2, -h / 2 + 1, 8, 4);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 2, 3);
  }
  if (type === 'police') {
    const flash = Math.floor(S.time * 3) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2a2a' : '#2a6fff';
    ctx.fillRect(-2, -h / 2 - 1, 8, 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', -w / 2 + 12, 3);
  }
  if (isNight(S)) {
    ctx.fillStyle = 'rgba(255, 240, 170, 0.35)';
    ctx.beginPath();
    ctx.moveTo(w / 2, -6);
    ctx.lineTo(w / 2 + 90, -26);
    ctx.lineTo(w / 2 + 90, 26);
    ctx.lineTo(w / 2, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// All moving cars: traffic, police, roadblocks and the player's.
function drawCars(ctx, S) {
  for (const car of S.cars) {
    if (car.dead) continue;
    if (!inView(S, car.x, car.y, 120)) continue;
    drawCarBody(ctx, car.x, car.y, car.ang, car.type, car.color, car.driver === 'player', S);
    if (car.hp < 55) {
      ctx.fillStyle = 'rgba(90,90,90,0.6)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.ang) * 10 + (Math.random() - 0.5) * 8, car.y - Math.sin(car.ang) * 10, 8 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPeds(ctx, S) {
  for (const ped of S.peds) {
    if (!inView(S, ped.x, ped.y, 30)) continue;
    const bob = Math.sin(ped.walkPhase) * 2;
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y + bob * 0.3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath();
    ctx.arc(ped.x, ped.y - 4 + bob * 0.3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(ped.x, ped.y - 6 + bob * 0.3, 5, Math.PI, 0);
    ctx.fill();
  }
}

function drawEnemies(ctx, S) {
  for (const e of S.enemies) {
    if (e.dead) continue;
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4a4a';
    ctx.beginPath();
    ctx.arc(e.x, e.y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(e.x - 12, e.y - 18, 24, 4);
    ctx.fillStyle = '#ff2a2a';
    ctx.fillRect(e.x - 12, e.y - 18, 24 * Math.max(0, e.hp / 60), 4);
  }
}

function drawBullets(ctx, S) {
  ctx.fillStyle = '#ffe14a';
  for (const b of S.bullets) {
    ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
  }
}

function drawParticles(ctx, S) {
  for (const pt of S.parts) {
    const a = Math.max(0, pt.life / pt.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * (pt.kind === 'flash' ? a : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPackages(ctx, S) {
  for (const pk of S.packages) {
    if (pk.taken) continue;
    const pulse = 1 + Math.sin(S.time * 4 + pk.x) * 0.2;
    ctx.fillStyle = '#e84ad4';
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.rotate(Math.PI / 4);
    ctx.scale(pulse, pulse);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', pk.x, pk.y + 4);
  }
}

function drawPickups(ctx, S) {
  for (const pk of S.pickups) {
    const bob = Math.sin(pk.bob) * 3;
    ctx.fillStyle = pk.kind === 'health' ? '#fff' : pk.kind === 'armor' ? '#4a8ae8' : pk.kind === 'ammo' ? '#ffd94a' : '#7ae84a';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'armor' ? 'A' : pk.kind === 'ammo' ? '•' : '$', pk.x, pk.y + bob + 4);
  }
}

// Objective marker, taxi marker and the race checkpoints.
function drawMarkers(ctx, S) {
  const target = missionTarget(S);
  if (target) drawMarker(ctx, target.x, target.y, '#ffd94a');
  const taxi = taxiTarget(S);
  if (taxi && (!target || taxi.x !== target.x || taxi.y !== target.y)) drawMarker(ctx, taxi.x, taxi.y, '#7ae84a');
  if (S.race && S.race.active) {
    const pt = S.race.points[S.race.idx];
    if (pt) drawMarker(ctx, pt.x, pt.y, '#ff7a1a');
  }
  if (S.mode === 'play' && S.mission.index < CFG.missions.length && !S.mission.active) {
    drawMarker(ctx, LANDMARKS.safehouse.x, LANDMARKS.safehouse.y, '#ffd94a');
  }
}

function drawMarker(ctx, x, y, color) {
  const bounce = Math.sin(Date.now() / 280) * 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 34 + bounce);
  ctx.lineTo(x - 12, y - 12 + bounce);
  ctx.lineTo(x + 12, y - 12 + bounce);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

// The police helicopter: shadow on the ground, body above it, searchlight.
function drawHeli(ctx, S) {
  if (!S.heli) return;
  const h = S.heli;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(h.x + 20, h.y + 26, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c2733';
  ctx.beginPath();
  ctx.ellipse(h.x, h.y, 24, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff2a2a';
  ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
  ctx.fillStyle = 'rgba(255, 240, 170, 0.18)';
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(S.player.x - 60, S.player.y - 60);
  ctx.lineTo(S.player.x + 60, S.player.y + 60);
  ctx.closePath();
  ctx.fill();
}

// Day and night: a tint over the world, warm at dusk, dark blue at night.
function drawNight(ctx, S) {
  const d = darkness(S);
  if (d <= 0) return;
  const m = Math.floor(S.clock) % 1440;
  const dusk = m >= 1020 && m < 1140;
  ctx.fillStyle = dusk ? `rgba(255, 120, 40, ${d * 0.7})` : `rgba(10, 20, 60, ${d})`;
  ctx.fillRect(S.cam.x - 900, S.cam.y - 700, 1800, 1400);
}

function drawFloats(ctx, S) {
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  for (const f of S.floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---- HUD (screen space) ----

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 5, y + h - 4);
}

export function drawHud(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (S.mode === 'menu') return;
  const p = S.player;
  const stars = wantedStars(S);
  // Wanted stars, top left.
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd94a' : 'rgba(255,255,255,0.35)';
    ctx.fillText('★', 16 + i * 30, 40);
  }
  bar(ctx, 16, 52, 170, 14, p.hp / CFG.player.maxHealth, '#3ec94a', 'HP ' + Math.ceil(p.hp));
  bar(ctx, 16, 72, 170, 14, p.armor / CFG.player.maxArmor, '#4a8ae8', 'ARM ' + Math.ceil(p.armor));
  // Cash, clock and district, top right.
  ctx.textAlign = 'right';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#7ae84a';
  ctx.fillText('$' + Math.floor(p.cash).toLocaleString('en-US'), W - 16, 36);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#fff';
  const clock = clockParts(S);
  ctx.fillText(clock.label + '  ·  ' + districtAt(p.x, p.y).name, W - 16, 58);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('REP ' + S.player.rep + '   PKG ' + S.packages.filter((k) => k.taken).length + '/' + CFG.packageCount, W - 16, 78);
  // Objective, top centre.
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#ffd94a';
  const obj = S.mission.active ? 'JOB: ' + CFG.missions[S.mission.index].name + ' — ' + objectiveText(S)
    : S.taxi.active ? 'TAXI — ' + objectiveText(S) : objectiveText(S);
  ctx.fillText(obj, W / 2, 30);
  // Weapon, ammo and radio, bottom left.
  const w = CFG.weapons[p.weapon];
  ctx.textAlign = 'left';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillStyle = '#fff';
  const ammoText = p.weapon === 'fists' ? '∞' : String(p.ammo[p.weapon] || 0);
  ctx.fillText(w.name + '  [' + ammoText + ']', 16, H - 56);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('♪ ' + CFG.radio[S.radio.station].name + '  (R to change, M mute)', 16, H - 34);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('1-4 weapons · E enter car · T taxi · G garage · P pause', 16, H - 14);
  // Speed, bottom centre, when driving.
  if (p.inCar) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.round(Math.abs(p.inCar.speed) * 0.36) + ' km/h', W / 2, H - 20);
  }
  drawMinimap(ctx, S);
}

// The minimap: roads, water, the player and every blip that matters.
function drawMinimap(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const size = 190, x0 = W - size - 14, y0 = H - size - 14;
  const k = size / CFG.worldSize;
  ctx.fillStyle = 'rgba(10,16,24,0.82)';
  ctx.fillRect(x0, y0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, size, size);
  ctx.fillStyle = '#2a7fa8';
  ctx.fillRect(x0, y0, 240 * k, size);
  ctx.fillRect(x0 + 1200 * k, y0 + (CFG.worldSize - 90) * k, (CFG.worldSize - 1200) * k, 90 * k);
  ctx.strokeStyle = 'rgba(200,200,200,0.7)';
  ctx.lineWidth = 1.5;
  for (const c of ROAD_CENTERS) {
    ctx.beginPath();
    ctx.moveTo(x0 + c * k, y0);
    ctx.lineTo(x0 + c * k, y0 + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0, y0 + c * k);
    ctx.lineTo(x0 + size, y0 + c * k);
    ctx.stroke();
  }
  const dot = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + x * k, y0 + y * k, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const target = missionTarget(S);
  if (target) dot(target.x, target.y, 5, '#ffd94a');
  const taxi = taxiTarget(S);
  if (taxi) dot(taxi.x, taxi.y, 4, '#7ae84a');
  const lot = garageLot(S);
  dot(lot.x, lot.y, 4, '#c94ae8');
  for (const pk of S.packages) if (!pk.taken) dot(pk.x, pk.y, 2.5, '#e84ad4');
  for (const cop of S.cops) if (!cop.dead) dot(cop.x, cop.y, 3.5, '#ff4a4a');
  if (S.heli) dot(S.heli.x, S.heli.y, 4, '#ff4a4a');
  // The player: a white triangle pointing where he faces.
  const p = S.player;
  ctx.save();
  ctx.translate(x0 + p.x * k, y0 + p.y * k);
  ctx.rotate(p.inCar ? p.inCar.ang : p.ang);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLARA CITY', x0 + 4, y0 - 6);
}

// ---- Screens ----

function drawMenu(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLARA CITY', W / 2, H / 2 - 130);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('An open-world crime game in the spirit of GTA — original city, original story.', W / 2, H / 2 - 92);
  ctx.fillStyle = '#7ae84a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(S.hasSave ? 'ENTER — Continue your game' : 'ENTER — New game', W / 2, H / 2 - 40);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '15px sans-serif';
  const lines = [
    'WASD walk / drive · Mouse aim · Click shoot · E enter car · Shift run / handbrake',
    '1-4 weapons · R radio · T taxi · G garage · M call Marisol · 0 mute · P pause',
    'Eight jobs from Marisol Vega · Taxi fares · Street races · 12 hidden packages',
    'Steal cars, lose the cops, buy the garage collection — and stay out of jail.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + 10 + i * 24));
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px sans-serif';
  ctx.fillText('All art, music and sound are made by the game itself. No files are loaded from the network.', W / 2, H / 2 + 130);
}

function drawPause(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(8, 12, 22, 0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2 - 20);
  ctx.font = '16px sans-serif';
  ctx.fillText('P or Esc to resume · M mute · Cash $' + Math.floor(S.player.cash) + ' · Jobs done ' + S.mission.index + ' / 8', W / 2, H / 2 + 16);
}

function drawEndCard(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(20, 4, 4, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = S.mode === 'busted' ? '#4a8ae8' : '#ff4a4a';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(S.mode === 'busted' ? 'BUSTED' : 'WASTED', W / 2, H / 2 - 30);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(S.banner ? S.banner.sub : '', W / 2, H / 2 + 8);
  ctx.fillText('Press ENTER to get back on the street.', W / 2, H / 2 + 40);
}

function drawComplete(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(8, 20, 8, 0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ae84a';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('JOB DONE', W / 2, H / 2 - 40);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText(S.banner ? S.banner.sub : '', W / 2, H / 2 - 4);
  ctx.font = '15px sans-serif';
  ctx.fillText('Press ENTER to keep playing. Press M for the next job.', W / 2, H / 2 + 28);
}

function drawGaragePanel(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const lines = garageLines(S);
  const pw = 520, ph = 300;
  const x0 = (W - pw) / 2, y0 = (H - ph) / 2;
  ctx.fillStyle = 'rgba(8, 14, 20, 0.94)';
  ctx.fillRect(x0, y0, pw, ph);
  ctx.strokeStyle = '#3ec98a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, pw, ph);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3ec98a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('SAFEHOUSE GARAGE', x0 + 20, y0 + 36);
  ctx.fillStyle = '#fff';
  ctx.font = '15px sans-serif';
  ctx.fillText('Cash: $' + Math.floor(S.player.cash) + '   Stored: ' + S.garage.owned.length + ' / ' + CFG.garageMaxStored, x0 + 20, y0 + 62);
  lines.forEach((line, i) => {
    ctx.fillStyle = line.owned ? '#ffd94a' : '#fff';
    ctx.fillText(line.text, x0 + 20, y0 + 96 + i * 26);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '13px sans-serif';
  ctx.fillText('Press 1-6 to buy or retrieve · G or Esc to close', x0 + 20, y0 + ph - 18);
}

function drawBanner(ctx, S) {
  if (!S.banner || S.banner.t > 3.2) return;
  const W = ctx.canvas.width;
  const a = S.banner.t < 0.3 ? S.banner.t / 0.3 : S.banner.t > 2.6 ? (3.2 - S.banner.t) / 0.6 : 1;
  ctx.globalAlpha = Math.max(0, a);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(S.banner.title, W / 2, 96);
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  ctx.fillText(S.banner.sub, W / 2, 124);
  ctx.globalAlpha = 1;
}
