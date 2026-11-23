// Renderer: canvas 2D top-down with view culling. The camera follows the
// player and zooms out with speed, north-up so the minimap always matches
// the screen. Day and night are tint overlays; lamps, headlights and neon
// glow at night. HUD, minimap and menus are drawn last. Everything drawn
// here is read from the game state — the renderer never changes it.
import { WORLD, PALETTE, FONT, CAR_TYPES, WEAPONS } from './config.js';
import { clamp, lerp } from './random.js';
import { districtAt, SPOTS } from './city.js';
import { garageEntries } from './garage.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 720;
  let scale = 1;
  let camX = 0;
  let camY = 0;
  let zoom = 1;

  // Fit the canvas to its element (or the window) at device pixel ratio.
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = canvas.clientWidth || window.innerWidth;
    viewH = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function worldToScreen(x, y) {
    return { x: (x - camX) * zoom + viewW / 2, y: (y - camY) * zoom + viewH / 2 };
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - viewW / 2) / zoom + camX, y: (sy - viewH / 2) / zoom + camY };
  }

  // The world rectangle currently on screen, with a small margin.
  function visible() {
    const hw = viewW / 2 / zoom + 60;
    const hh = viewH / 2 / zoom + 60;
    return { x0: camX - hw, y0: camY - hh, x1: camX + hw, y1: camY + hh };
  }

  function inView(v, x, y, r) {
    return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
  }

  // One car: shadow, body, police livery or taxi markings, windshield,
  // headlights at night, taillights, damage smoke, and a health bar when hurt.
  function drawCar(car, night) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.type === 'truck' || car.type === 'van' ? 58 : 46;
    const wid = car.type === 'truck' || car.type === 'van' ? 26 : 22;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
    if (car.type === 'police') {
      ctx.fillStyle = '#f4f1e6';
      ctx.fillRect(-len / 2 + 6, -wid / 2, len - 12, wid);
      ctx.fillStyle = '#222';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      ctx.fillStyle = '#e23b3b';
      ctx.fillRect(-8, -wid / 2 - 3, 7, 4);
      ctx.fillStyle = '#3b6fe0';
      ctx.fillRect(1, -wid / 2 - 3, 7, 4);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-len / 2 + 4, -wid / 2 + 2, 12, 4);
      ctx.fillRect(-len / 2 + 4, wid / 2 - 6, 12, 4);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 4, 3);
    }
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.beginPath();
    ctx.roundRect(-len / 2 + 10, -wid / 2 + 4, 14, wid - 8, 3);
    ctx.fill();
    if (night) {
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 5);
      ctx.fillRect(len / 2 - 2, wid / 2 - 8, 3, 5);
    }
    ctx.fillStyle = '#ff4b3e';
    ctx.fillRect(-len / 2 - 1, -wid / 2 + 3, 3, 5);
    ctx.fillRect(-len / 2 - 1, wid / 2 - 8, 3, 5);
    if (car.smoke) {
      ctx.fillStyle = 'rgba(120,120,120,0.7)';
      ctx.beginPath();
      ctx.arc(-len / 2, 0, 6 + Math.random() * 4, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    if (car.hp < car.maxHp * 0.8) {
      const scr = worldToScreen(car.x, car.y - 30);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(scr.x - 18, scr.y, 36, 5);
      ctx.fillStyle = car.hp > car.maxHp * 0.4 ? '#7dff8a' : '#ff5a4a';
      ctx.fillRect(scr.x - 18, scr.y, 36 * (car.hp / car.maxHp), 5);
    }
  }

  // One pedestrian: shadow, coloured body, head.
  function drawPed(ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 9, 7, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  // The world: water, sand, roads, sidewalks, markings, crossings, traffic
  // lights, parks, trees, lots, buildings, street props, the garage lot,
  // pickups and packages, night lamps, race points, the mission marker, then
  // every moving thing, then floaters, then the day/night tint.
  function drawWorld(city, game, time) {
    const st = game.state;
    const light = city.daylight(st.clock);
    const night = light < 0.45;
    const dusk = st.clock >= 17 && st.clock < 19.5;
    const v = visible();
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate((0 - camX) * zoom + viewW / 2, (0 - camY) * zoom + viewH / 2);
    ctx.scale(zoom, zoom);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(-600, -600, 600, WORLD.size + 1200);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, 0, 260, WORLD.size);
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadsX) ctx.fillRect(rx - WORLD.road / 2, 0, WORLD.road, WORLD.size);
    for (const rz of city.roadsZ) ctx.fillRect(0, rz - WORLD.road / 2, WORLD.size, WORLD.road);
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of city.roadsX) {
      ctx.fillRect(rx - WORLD.road / 2 - 14, 0, 14, WORLD.size);
      ctx.fillRect(rx + WORLD.road / 2, 0, 14, WORLD.size);
    }
    for (const rz of city.roadsZ) {
      ctx.fillRect(0, rz - WORLD.road / 2 - 14, WORLD.size, 14);
      ctx.fillRect(0, rz + WORLD.road / 2, WORLD.size, 14);
    }
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of city.roadsX) {
      for (let y = 40; y < WORLD.size; y += 90) ctx.fillRect(rx - 2, y, 4, 44);
    }
    for (const rz of city.roadsZ) {
      for (let x = 40; x < WORLD.size; x += 90) ctx.fillRect(x, rz - 2, 44, 4);
    }
    // Zebra crossings at every intersection.
    ctx.fillStyle = 'rgba(244,241,230,0.85)';
    for (const rx of city.roadsX) {
      for (const rz of city.roadsZ) {
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(rx + i * 12 - 4, rz - WORLD.road / 2 + 6, 8, 16);
          ctx.fillRect(rx + i * 12 - 4, rz + WORLD.road / 2 - 22, 8, 16);
        }
      }
    }
    // Traffic lights: green one way, red the other, flipping every 4 seconds.
    const greenNS = (st.time % 8) < 4;
    for (const rx of city.roadsX) {
      for (const rz of city.roadsZ) {
        if (!inView(v, rx, rz, 120)) continue;
        ctx.fillStyle = '#222';
        ctx.fillRect(rx - WORLD.road / 2 - 4, rz - WORLD.road / 2 - 4, 8, 22);
        ctx.fillStyle = greenNS ? '#37d67a' : '#e23b3b';
        ctx.beginPath();
        ctx.arc(rx - WORLD.road / 2, rz - WORLD.road / 2 + 2, 3, 0, 7);
        ctx.fill();
        ctx.fillStyle = greenNS ? '#e23b3b' : '#37d67a';
        ctx.beginPath();
        ctx.arc(rx - WORLD.road / 2, rz - WORLD.road / 2 + 12, 3, 0, 7);
        ctx.fill();
      }
    }
    for (const pk of city.parks) {
      if (!inView(v, (pk.x0 + pk.x1) / 2, (pk.y0 + pk.y1) / 2, 300)) continue;
      ctx.fillStyle = pk.plaza ? PALETTE.plaza : PALETTE.park;
      ctx.fillRect(pk.x0, pk.y0, pk.x1 - pk.x0, pk.y1 - pk.y0);
    }
    for (const t of city.trees) {
      if (!inView(v, t.x, t.y, 30)) continue;
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(t.x - 2, t.y - 4, 4, 14);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 8, t.r, 0, 7);
      ctx.fill();
    }
    for (const lot of city.lots) {
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
    }
    for (const b of city.buildings) {
      if (!inView(v, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = night ? 'rgba(255,233,168,0.5)' : 'rgba(255,255,255,0.25)';
      for (let i = 0; i < b.floors; i++) ctx.fillRect(b.x + 12 + i * 14, b.y + 12, 6, 6);
      if (b.neon && night) {
        ctx.fillStyle = b.neon;
        ctx.fillRect(b.x + b.w / 2 - 20, b.y - 3, 40, 5);
      }
    }
    for (const bb of city.billboards) {
      if (!inView(v, bb.x, bb.y, 80)) continue;
      ctx.fillStyle = '#1a1d22';
      ctx.fillRect(bb.x - bb.w / 2, bb.y - 16, bb.w, 14);
      ctx.fillStyle = bb.color;
      ctx.fillRect(bb.x - bb.w / 2 + 2, bb.y - 14, bb.w - 4, 10);
    }
    for (const bn of city.benches) {
      if (!inView(v, bn.x, bn.y, 30)) continue;
      ctx.save();
      ctx.translate(bn.x, bn.y);
      ctx.rotate(bn.angle);
      ctx.fillStyle = '#7a5c38';
      ctx.fillRect(-12, -3, 24, 6);
      ctx.restore();
    }
    for (const h of city.hydrants) {
      if (!inView(v, h.x, h.y, 30)) continue;
      ctx.fillStyle = '#d23b2e';
      ctx.fillRect(h.x - 4, h.y - 6, 8, 12);
    }
    for (const bs of city.busStops) {
      if (!inView(v, bs.x, bs.y, 40)) continue;
      ctx.fillStyle = '#2b6cb0';
      ctx.fillRect(bs.x - 3, bs.y - 14, 6, 28);
      ctx.fillStyle = '#f4f1e6';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('BUS', bs.x, bs.y + 24);
    }
    for (const pl of city.palms) {
      if (!inView(v, pl.x, pl.y, 30)) continue;
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(pl.x - 2, pl.y - 4, 4, 14);
      ctx.fillStyle = '#2f8f3e';
      ctx.beginPath();
      ctx.arc(pl.x, pl.y - 8, 11, 0, 7);
      ctx.fill();
    }
    // The garage itself: a marked lot with a green roof sign.
    ctx.fillStyle = '#3d5a3a';
    ctx.fillRect(SPOTS.garage.x - 70, SPOTS.garage.y - 50, 140, 100);
    ctx.fillStyle = '#2f8f3e';
    ctx.fillRect(SPOTS.garage.x - 46, SPOTS.garage.y - 62, 92, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('GARAGE', SPOTS.garage.x, SPOTS.garage.y - 48);
    for (const pk of city.pickups) {
      if (pk.taken || !inView(v, pk.x, pk.y, 30)) continue;
      ctx.fillStyle = pk.kind === 'health' ? '#ff5a6a' : pk.kind === 'armour' ? '#7aa8ff' : '#7dff8a';
      ctx.fillRect(pk.x - 10, pk.y - 10, 20, 20);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'armour' ? 'A' : 'W', pk.x, pk.y + 4);
    }
    for (const pkg of city.packages) {
      if (pkg.found || !inView(v, pkg.x, pkg.y, 30)) continue;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(pkg.x, pkg.y, 9, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px ' + FONT;
      ctx.fillText('$', pkg.x, pkg.y + 3);
    }
    if (night) {
      ctx.fillStyle = '#ffe9a8';
      for (const l of city.lamps) {
        if (Math.abs(l.x - st.player.x) < 900 && Math.abs(l.y - st.player.y) < 700) {
          ctx.beginPath();
          ctx.arc(l.x, l.y, 4, 0, 7);
          ctx.fill();
        }
      }
    }
    for (const rp of st.racePoints) {
      if (rp.hit) continue;
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 46, 0, 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,63,0.25)';
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 46, 0, 7);
      ctx.fill();
    }
    const marker = missionTarget(game);
    if (marker) {
      const pulse = 26 + Math.sin(time * 4) * 6;
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, pulse, 0, 7);
      ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.moveTo(marker.x, marker.y - pulse - 26);
      ctx.lineTo(marker.x - 10, marker.y - pulse - 8);
      ctx.lineTo(marker.x + 10, marker.y - pulse - 8);
      ctx.closePath();
      ctx.fill();
    }
    if (st.taxi && !st.taxi.picked) {
      ctx.strokeStyle = '#37e0c8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(st.taxi.pickup.x, st.taxi.pickup.y, 30, 0, 7);
      ctx.stroke();
    }
    ctx.fillStyle = '#d8b95a';
    for (const c of st.casings) ctx.fillRect(c.x - 2, c.y - 1, 4, 2);
    for (const pt of st.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const b of st.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const car of st.cars) {
      if (!car.dead && inView(v, car.x, car.y, 80)) drawCar(car, night);
    }
    for (const ped of st.peds) {
      if (!ped.dead && inView(v, ped.x, ped.y, 30)) drawPed(ped);
    }
    for (const e of st.enemies) {
      if (e.dead || !inView(v, e.x, e.y, 30)) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.fillStyle = '#5a1f1f';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(5, 0, 5, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 14, 4);
      ctx.restore();
    }
    const p = st.player;
    if (!st.playerCar) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 3, 12, 9, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2b6cb0';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(6, 0, 5, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 16, 3);
      ctx.restore();
    }
    if (st.heli) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(st.heli.x + 20, st.heli.y + 24, 26, 16, 0, 0, 7);
      ctx.fill();
      ctx.save();
      ctx.translate(st.heli.x, st.heli.y);
      ctx.rotate(st.heli.angle);
      ctx.fillStyle = '#2b2f36';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 12, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#3b6fe0';
      ctx.fillRect(-30, -2, 60, 4);
      ctx.restore();
    }
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    for (const f of st.floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - (1.6 - f.life) * 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (night) {
      ctx.fillStyle = 'rgba(8,16,48,' + (0.5 - light * 0.5).toFixed(2) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    } else if (dusk) {
      ctx.fillStyle = 'rgba(224,123,57,0.10)';
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  // Where the yellow marker points: the taxi pickup or destination first,
  // then the current mission stage's spot or the next race checkpoint.
  function missionTarget(game) {
    const st = game.state;
    if (st.taxi && st.taxi.picked) return st.taxi.dest;
    if (st.taxi && !st.taxi.picked) return st.taxi.pickup;
    const m = st.mission;
    if (!m) return null;
    const stage = m.stages[st.missionStage];
    if (!stage) return null;
    if (stage.at) return stage.at;
    if (stage.type === 'race') return st.racePoints.find((r) => !r.hit) || null;
    return null;
  }

  // The minimap: roads, water, the mission marker, the garage, police,
  // enemies, the taxi pickup, and the player ring, plus the district name.
  function drawMinimap(city, game) {
    const st = game.state;
    const size = 168;
    const x0 = viewW - size - 14;
    const y0 = 14;
    const k = size / WORLD.size;
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#2c4a2e';
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = '#1f6f8b';
    ctx.fillRect(x0, y0, 260 * k, size);
    ctx.fillStyle = '#33373d';
    for (const rx of city.roadsX) ctx.fillRect(x0 + (rx - 48) * k, y0, 96 * k, size);
    for (const rz of city.roadsZ) ctx.fillRect(x0, y0 + (rz - 48) * k, size, 96 * k);
    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * k, y0 + y * k, r, 0, 7);
      ctx.fill();
    };
    const mt = missionTarget(game);
    if (mt) dot(mt.x, mt.y, '#ffd23f', 5);
    dot(SPOTS.garage.x, SPOTS.garage.y, '#37d67a', 4);
    for (const c of st.cars) {
      if (c.police && !c.dead) dot(c.x, c.y, '#3b6fe0', 3);
    }
    for (const e of st.enemies) {
      if (!e.dead) dot(e.x, e.y, '#ff5a4a', 3);
    }
    if (st.taxi && !st.taxi.picked) dot(st.taxi.pickup.x, st.taxi.pickup.y, '#37e0c8', 4);
    dot(st.player.x, st.player.y, '#fff', 4);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + st.player.x * k, y0 + st.player.y * k, 6, 0, 7);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(districtAt(st.player.x, st.player.y).name.toUpperCase() + '  •  SOLARA CITY', x0, y0 + size + 16);
  }

  // The HUD: wanted stars, cash, reputation, health and armour bars, the
  // current weapon and its ammo, speed, clock, radio station, the mission
  // banner, the race timer, the taxi fare, toasts, the bust countdown, the
  // garage hint, the minimap, and the controls footer.
  function drawHUD(city, game, audio) {
    const st = game.state;
    const p = st.player;
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px ' + FONT;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < st.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', 18 + i * 30, 40);
    }
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(14, 52, 210, 58);
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('$' + st.cash.toLocaleString('en-US'), 24, 78);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '13px ' + FONT;
    ctx.fillText('REP ' + st.rep + '   •   MISSION ' + Math.min(st.missionIndex + 1, 8) + '/8   •   GARAGE ' + st.ownedCars.length + '/3', 24, 100);
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(14, 118, 210, 52);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(24, 130, 190 * (p.hp / 100), 10);
    ctx.fillStyle = '#7aa8ff';
    ctx.fillRect(24, 146, 190 * (p.armour / 100), 8);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '11px ' + FONT;
    ctx.fillText('HEALTH ' + Math.ceil(p.hp), 24, 128);
    ctx.fillText('ARMOUR ' + Math.ceil(p.armour), 130, 128);
    const w = WEAPONS[p.weapon];
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(14, viewH - 66, 230, 52);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillText(w.name.toUpperCase(), 24, viewH - 42);
    ctx.fillStyle = PALETTE.hudGold;
    ctx.font = '15px ' + FONT;
    ctx.fillText(p.weapon === 'fists' ? '∞' : 'AMMO ' + (st.ammo[p.weapon] || 0), 24, viewH - 22);
    const car = st.playerCar ? st.cars.find((c) => c.id === st.playerCar) : null;
    const speedKmh = car ? Math.round(Math.abs(car.speed) * 0.24) : Math.round(p.speed * 0.24);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 20px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(speedKmh + ' km/h', viewW - 200, viewH - 30);
    const hh = Math.floor(st.clock);
    const mm = Math.floor((st.clock - hh) * 60);
    ctx.fillText(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), viewW - 200, viewH - 56);
    ctx.fillStyle = '#37e0c8';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText('♪ ' + (audio ? audio.stationName() : 'SOLARA FM'), viewW - 200, viewH - 78);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(viewW / 2 - 260, 14, 520, 44);
    ctx.fillStyle = PALETTE.hudGold;
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(game.missionText(), viewW / 2, 32);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '12px ' + FONT;
    const m = st.mission;
    if (m) ctx.fillText(m.giver + '  •  ' + m.title, viewW / 2, 50);
    ctx.textAlign = 'left';
    if (st.missionTimer > 0) {
      ctx.fillStyle = '#ff5a4a';
      ctx.font = 'bold 22px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('⏱ ' + Math.ceil(st.missionTimer) + 's', viewW / 2, 84);
      ctx.textAlign = 'left';
    }
    if (st.taxi) {
      ctx.fillStyle = '#37e0c8';
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillText('TAXI FARE $' + st.taxi.fare + ' — ' + Math.ceil(st.taxi.timer) + 's left', 24, viewH - 84);
    }
    if (st.messageTimer > 0) {
      ctx.fillStyle = 'rgba(10,14,22,0.8)';
      ctx.fillRect(viewW / 2 - 300, viewH - 130, 600, 34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(st.message, viewW / 2, viewH - 108);
      ctx.textAlign = 'left';
    }
    if (st.bustTimer > 0.2) {
      ctx.fillStyle = '#ff5a4a';
      ctx.font = 'bold 24px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('BUSTED IN ' + (1.6 - st.bustTimer).toFixed(1) + 's — RUN!', viewW / 2, viewH / 2 - 120);
      ctx.textAlign = 'left';
    }
    if (Math.hypot(st.player.x - SPOTS.garage.x, st.player.y - SPOTS.garage.y) < 160) {
      ctx.fillStyle = '#37d67a';
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('G — SAFEHOUSE GARAGE', viewW / 2, viewH - 150);
      ctx.textAlign = 'left';
    }
    drawMinimap(city, game);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '12px ' + FONT;
    ctx.fillText('WASD move/drive  •  E enter car  •  Mouse aim, click shoot  •  Shift handbrake  •  Q weapon  •  R radio  •  G garage  •  P pause  •  M mute', 14, viewH - 8);
  }

  // The garage menu over the world: title, cash, owned count, the buy/take
  // rows with the highlighted one, and the key hints.
  function drawGarageMenu(game) {
    const st = game.state;
    ctx.fillStyle = 'rgba(8,12,20,0.82)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#37d67a';
    ctx.font = 'bold 40px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('SAFEHOUSE GARAGE', viewW / 2, 140);
    ctx.fillStyle = '#f4f1e6';
    ctx.font = '18px ' + FONT;
    ctx.fillText('Cash $' + st.cash.toLocaleString('en-US') + '   •   Stored ' + st.ownedCars.length + '/3', viewW / 2, 178);
    const entries = garageEntries(game);
    ctx.font = '17px ' + FONT;
    entries.forEach((e, i) => {
      const y = 230 + i * 40;
      if (i === st.garageSelected) {
        ctx.fillStyle = 'rgba(55,214,122,0.25)';
        ctx.fillRect(viewW / 2 - 320, y - 24, 640, 34);
      }
      ctx.fillStyle = i === st.garageSelected ? '#7dff8a' : '#cfd6e2';
      ctx.fillText((i === st.garageSelected ? '▶  ' : '     ') + e.label, viewW / 2, y);
    });
    ctx.fillStyle = '#8b93a3';
    ctx.font = '14px ' + FONT;
    ctx.fillText('Q cycle   •   Space buy / take out   •   G close', viewW / 2, 230 + entries.length * 40 + 30);
    ctx.fillText('Drive any car into the garage and press G to store it.', viewW / 2, 230 + entries.length * 40 + 56);
    ctx.textAlign = 'left';
  }

  // Full-screen menus: the title screen, paused, wasted, busted, won.
  function drawMenu(game, kind) {
    const st = game.state;
    ctx.fillStyle = '#0d1b33';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 64px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('SOLARA CITY', viewW / 2, viewH / 2 - 110);
    ctx.fillStyle = '#f4f1e6';
    ctx.font = '22px ' + FONT;
    ctx.fillText('An original open-world crime game — drive, steal, run, survive.', viewW / 2, viewH / 2 - 66);
    ctx.font = '16px ' + FONT;
    const lines = {
      menu: ['You are a small-time driver. Marisol Vega has work for you.', '8 story missions • taxi fares • races • hidden packages • 5-star wanted', 'Garage • 3 radio stations • SMG • day & night', '', 'WASD move / drive   •   E enter & exit cars   •   Mouse aim, click to shoot', 'Shift handbrake   •   Q switch weapon   •   R radio   •   G garage   •   P pause   •   M mute', '', 'Press SPACE or click to start   •   C continue saved game'],
      paused: ['PAUSED', '', 'Press P or Space to resume'],
      wasted: ['WASTED', '', 'You died. $200 hospital bill. Press SPACE to retry.'],
      busted: ['BUSTED', '', 'The Solara police caught you. $300 fine. Press SPACE to retry.'],
      won: ['THE BIG ONE — DONE', '', 'You robbed Solara National Bank and got away clean.', 'All 8 missions complete. Free roam Solara City forever.', '', 'Press SPACE to keep playing.'],
    }[kind] || [];
    ctx.fillStyle = '#cfd6e2';
    lines.forEach((l, i) => ctx.fillText(l, viewW / 2, viewH / 2 - 20 + i * 28));
    ctx.fillStyle = '#8b93a3';
    ctx.font = '13px ' + FONT;
    ctx.fillText('Cash $' + st.cash.toLocaleString('en-US') + '   •   Missions ' + st.missionIndex + '/8   •   Packages ' + st.packagesFound + '/12   •   Garage ' + st.ownedCars.length + '/3', viewW / 2, viewH - 40);
    ctx.textAlign = 'left';
  }

  return {
    resize,
    snapTo(x, y) {
      camX = x;
      camY = y;
    },
    worldToScreen,
    screenToWorld,
    get viewW() {
      return viewW;
    },
    get viewH() {
      return viewH;
    },
    // One frame: ease the camera toward the player and the zoom toward the
    // speed target, then paint the world plus the overlays for the screen.
    draw(city, game, audio, time) {
      const st = game.state;
      const p = st.player;
      const car = st.playerCar ? st.cars.find((c) => c.id === st.playerCar) : null;
      const speed = car ? Math.abs(car.speed) : p.speed;
      const targetZoom = clamp(1.15 - speed / 2600, 0.78, 1.15);
      zoom = lerp(zoom, targetZoom, 0.05);
      camX = lerp(camX, p.x, 0.12);
      camY = lerp(camY, p.y, 0.12);
      if (st.screen === 'menu') {
        drawMenu(game, 'menu');
        return;
      }
      if (st.screen === 'garage') {
        drawWorld(city, game, time);
        drawHUD(city, game, audio);
        drawGarageMenu(game);
        return;
      }
      if (st.screen === 'paused') {
        drawWorld(city, game, time);
        drawHUD(city, game, audio);
        drawMenu(game, 'paused');
        return;
      }
      if (st.screen === 'wasted' || st.screen === 'busted' || st.screen === 'won') {
        if (st.screen === 'won') {
          drawWorld(city, game, time);
          if (!st.photoMode) drawHUD(city, game, audio);
        }
        drawMenu(game, st.screen);
        return;
      }
      drawWorld(city, game, time);
      if (!st.photoMode) drawHUD(city, game, audio);
    },
  };
}
