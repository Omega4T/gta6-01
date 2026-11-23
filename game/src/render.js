// Renderer: canvas 2D top-down. Camera follows the player, zooms out with speed,
// north-up so the minimap always matches the screen. Day/night is a tint overlay;
// at night lamps and headlights glow. HUD + minimap are drawn last.
import { WORLD, PALETTE, FONT, CAR_TYPES, WEAPONS } from './config.js';
import { clamp, lerp } from './random.js';
import { districtAt } from './city.js';

export const SCREEN_TITLE = 'menu';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WON = 'won';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280, viewH = 720, scale = 1, camX = 0, camY = 0, zoom = 1;

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

  function drawCar(c, night) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    const len = c.type === 'truck' || c.type === 'van' ? 58 : 46;
    const wid = c.type === 'truck' || c.type === 'van' ? 26 : 22;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.roundRect(-len / 2, -wid / 2, len, wid, 6); ctx.fill();
    if (c.type === 'police') {
      ctx.fillStyle = '#f4f1e6'; ctx.fillRect(-len / 2 + 6, -wid / 2, len - 12, wid);
      ctx.fillStyle = '#222'; ctx.font = 'bold 9px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, 3);
    }
    if (c.type === 'taxi') {
      ctx.fillStyle = '#222'; ctx.fillRect(-len / 2 + 4, -wid / 2 + 2, 12, 4); ctx.fillRect(-len / 2 + 4, wid / 2 - 6, 12, 4);
      ctx.fillStyle = '#111'; ctx.font = 'bold 8px ' + FONT; ctx.fillText('TAXI', 4, 3);
    }
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.beginPath(); ctx.roundRect(-len / 2 + 10, -wid / 2 + 4, 14, wid - 8, 3); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    if (night) { ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 5); ctx.fillRect(len / 2 - 2, wid / 2 - 8, 3, 5); }
    ctx.fillStyle = '#ff4b3e'; ctx.fillRect(-len / 2 - 1, -wid / 2 + 3, 3, 5); ctx.fillRect(-len / 2 - 1, wid / 2 - 8, 3, 5);
    if (c.smoke) { ctx.fillStyle = 'rgba(120,120,120,0.7)'; ctx.beginPath(); ctx.arc(-len / 2, 0, 6 + Math.random() * 4, 0, 7); ctx.fill(); }
    ctx.restore();
    if (c.hp < c.maxHp * 0.8) {
      const s = worldToScreen(c.x, c.y - 30);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(s.x - 18, s.y, 36, 5);
      ctx.fillStyle = c.hp > c.maxHp * 0.4 ? '#7dff8a' : '#ff5a4a';
      ctx.fillRect(s.x - 18, s.y, 36 * (c.hp / c.maxHp), 5);
    }
  }

  function drawPed(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 9, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8b98a'; ctx.beginPath(); ctx.arc(4, 0, 4, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawWorld(city, game, time) {
    const s = game.state;
    const light = city.daylight(s.clock);
    const night = light < 0.45;
    const dusk = s.clock >= 17 && s.clock < 19.5;
    ctx.fillStyle = PALETTE.grass; ctx.fillRect(0, 0, viewW, viewH);
    const vx0 = (0 - camX) * zoom + viewW / 2, vy0 = (0 - camY) * zoom + viewH / 2;
    ctx.save();
    ctx.translate(vx0, vy0); ctx.scale(zoom, zoom);
    ctx.fillStyle = PALETTE.water; ctx.fillRect(-600, -600, 600, WORLD.size + 1200);
    ctx.fillStyle = PALETTE.sand; ctx.fillRect(0, 0, 260, WORLD.size);
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadsX) ctx.fillRect(rx - WORLD.road / 2, 0, WORLD.road, WORLD.size);
    for (const rz of city.roadsZ) ctx.fillRect(0, rz - WORLD.road / 2, WORLD.size, WORLD.road);
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of city.roadsX) { ctx.fillRect(rx - WORLD.road / 2 - 14, 0, 14, WORLD.size); ctx.fillRect(rx + WORLD.road / 2, 0, 14, WORLD.size); }
    for (const rz of city.roadsZ) { ctx.fillRect(0, rz - WORLD.road / 2 - 14, WORLD.size, 14); ctx.fillRect(0, rz + WORLD.road / 2, WORLD.size, 14); }
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of city.roadsX) for (let y = 40; y < WORLD.size; y += 90) ctx.fillRect(rx - 2, y, 4, 44);
    for (const rz of city.roadsZ) for (let x = 40; x < WORLD.size; x += 90) ctx.fillRect(x, rz - 2, 44, 4);
    for (const pk of city.parks) {
      ctx.fillStyle = pk.plaza ? PALETTE.plaza : PALETTE.park;
      ctx.fillRect(pk.x0, pk.y0, pk.x1 - pk.x0, pk.y1 - pk.y0);
      ctx.fillStyle = '#3a7a2e';
      for (let i = 0; i < pk.trees; i++) {
        const tx = pk.x0 + 30 + (i * 53) % (pk.x1 - pk.x0 - 60), ty = pk.y0 + 30 + (i * 97) % (pk.y1 - pk.y0 - 60);
        ctx.beginPath(); ctx.arc(tx, ty, 12, 0, 7); ctx.fill();
      }
    }
    for (const lot of city.lots) { ctx.fillStyle = '#4a4d52'; ctx.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0); }
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      ctx.fillStyle = b.wall; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof; ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < b.floors; i++) ctx.fillRect(b.x + 12 + i * 14, b.y + 12, 6, 6);
      if (b.neon && night) {
        ctx.fillStyle = b.neon; ctx.fillRect(b.x + b.w / 2 - 20, b.y - 3, 40, 5);
      }
    }
    for (const pl of city.palms) {
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(pl.x - 2, pl.y - 4, 4, 14);
      ctx.fillStyle = '#2f8f3e'; ctx.beginPath(); ctx.arc(pl.x, pl.y - 8, 11, 0, 7); ctx.fill();
    }
    for (const pk of city.pickups) {
      if (pk.taken) continue;
      ctx.fillStyle = pk.kind === 'health' ? '#ff5a6a' : pk.kind === 'armour' ? '#7aa8ff' : '#7dff8a';
      ctx.fillRect(pk.x - 10, pk.y - 10, 20, 20);
      ctx.fillStyle = '#111'; ctx.font = 'bold 11px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'armour' ? 'A' : 'W', pk.x, pk.y + 4);
    }
    for (const pkg of city.packages) {
      if (pkg.found) continue;
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(pkg.x, pkg.y, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 10px ' + FONT; ctx.fillText('$', pkg.x, pkg.y + 3);
    }
    if (night) {
      ctx.fillStyle = '#ffe9a8';
      for (const l of city.lamps) { if (Math.abs(l.x - s.player.x) < 900 && Math.abs(l.y - s.player.y) < 700) { ctx.beginPath(); ctx.arc(l.x, l.y, 4, 0, 7); ctx.fill(); } }
    }
    for (const rp of s.racePoints) {
      if (rp.hit) continue;
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 46, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,63,0.25)'; ctx.beginPath(); ctx.arc(rp.x, rp.y, 46, 0, 7); ctx.fill();
    }
    const marker = missionTarget(game);
    if (marker) {
      const pulse = 26 + Math.sin(time * 4) * 6;
      ctx.strokeStyle = PALETTE.marker; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, pulse, 0, 7); ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath(); ctx.moveTo(marker.x, marker.y - pulse - 26); ctx.lineTo(marker.x - 10, marker.y - pulse - 8); ctx.lineTo(marker.x + 10, marker.y - pulse - 8); ctx.closePath(); ctx.fill();
    }
    if (s.taxi && !s.taxi.picked) {
      ctx.strokeStyle = '#37e0c8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.taxi.pickup.x, s.taxi.pickup.y, 30, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = '#d8b95a';
    for (const c of s.casings) ctx.fillRect(c.x - 2, c.y - 1, 4, 2);
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
    for (const b of s.bullets) {
      ctx.beginPath(); ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const car of s.cars) if (!car.dead) drawCar(car, night);
    for (const ped of s.peds) if (!ped.dead) drawPed(ped);
    for (const e of s.enemies) {
      if (e.dead) continue;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle);
      ctx.fillStyle = '#5a1f1f'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8b98a'; ctx.beginPath(); ctx.arc(5, 0, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(8, -2, 14, 4);
      ctx.restore();
    }
    const p = s.player;
    if (!s.playerCar) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 3, 12, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b6cb0'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(6, 0, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(8, -2, 16, 3);
      ctx.restore();
    }
    if (s.heli) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s.heli.x + 20, s.heli.y + 24, 26, 16, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(s.heli.x, s.heli.y); ctx.rotate(s.heli.angle);
      ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3b6fe0'; ctx.fillRect(-30, -2, 60, 4);
      ctx.restore();
    }
    ctx.font = 'bold 15px ' + FONT; ctx.textAlign = 'center';
    for (const f of s.floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - (1.6 - f.life) * 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (night) { ctx.fillStyle = 'rgba(8,16,48,' + (0.5 - light * 0.5).toFixed(2) + ')'; ctx.fillRect(0, 0, viewW, viewH); }
    else if (dusk) { ctx.fillStyle = 'rgba(224,123,57,0.10)'; ctx.fillRect(0, 0, viewW, viewH); }
  }

  function missionTarget(game) {
    const s = game.state;
    if (s.taxi && s.taxi.picked) return s.taxi.dest;
    if (s.taxi && !s.taxi.picked) return s.taxi.pickup;
    const m = s.mission; if (!m) return null;
    const st = m.stages[s.missionStage]; if (!st) return null;
    if (st.at) return st.at;
    if (st.type === 'race') return s.racePoints.find(r => !r.hit) || null;
    return null;
  }

  function drawMinimap(city, game) {
    const s = game.state;
    const size = 168, x0 = viewW - size - 14, y0 = 14;
    const k = size / WORLD.size;
    ctx.fillStyle = PALETTE.hudPanel; ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
    ctx.fillStyle = '#2c4a2e'; ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = '#1f6f8b'; ctx.fillRect(x0, y0, 260 * k, size);
    ctx.fillStyle = '#33373d';
    for (const rx of city.roadsX) ctx.fillRect(x0 + (rx - 48) * k, y0, 96 * k, size);
    for (const rz of city.roadsZ) ctx.fillRect(x0, y0 + (rz - 48) * k, size, 96 * k);
    const dot = (x, y, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x0 + x * k, y0 + y * k, r, 0, 7); ctx.fill(); };
    const mt = missionTarget(game);
    if (mt) dot(mt.x, mt.y, '#ffd23f', 5);
    for (const c of s.cars) if (c.police && !c.dead) dot(c.x, c.y, '#3b6fe0', 3);
    for (const e of s.enemies) if (!e.dead) dot(e.x, e.y, '#ff5a4a', 3);
    if (s.taxi && !s.taxi.picked) dot(s.taxi.pickup.x, s.taxi.pickup.y, '#37e0c8', 4);
    dot(s.player.x, s.player.y, '#fff', 4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x0 + s.player.x * k, y0 + s.player.y * k, 6, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudText; ctx.font = 'bold 11px ' + FONT; ctx.textAlign = 'left';
    ctx.fillText(districtAt(s.player.x, s.player.y).name.toUpperCase() + '  •  SOLARA CITY', x0, y0 + size + 16);
  }

  function drawHUD(city, game) {
    const s = game.state;
    const p = s.player;
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px ' + FONT;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < s.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', 18 + i * 30, 40);
    }
    ctx.fillStyle = PALETTE.hudPanel; ctx.fillRect(14, 52, 210, 58);
    ctx.fillStyle = '#7dff8a'; ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('$' + s.cash.toLocaleString('en-US'), 24, 78);
    ctx.fillStyle = PALETTE.hudText; ctx.font = '13px ' + FONT;
    ctx.fillText('REP ' + s.rep + '   •   MISSION ' + Math.min(s.missionIndex + 1, 8) + '/8', 24, 100);
    ctx.fillStyle = PALETTE.hudPanel; ctx.fillRect(14, 118, 210, 52);
    ctx.fillStyle = '#ff5a4a'; ctx.fillRect(24, 130, 190 * (p.hp / 100), 10);
    ctx.fillStyle = '#7aa8ff'; ctx.fillRect(24, 146, 190 * (p.armour / 100), 8);
    ctx.fillStyle = PALETTE.hudText; ctx.font = '11px ' + FONT;
    ctx.fillText('HEALTH ' + Math.ceil(p.hp), 24, 128); ctx.fillText('ARMOUR ' + Math.ceil(p.armour), 130, 128);
    const w = WEAPONS[p.weapon];
    ctx.fillStyle = PALETTE.hudPanel; ctx.fillRect(14, viewH - 66, 230, 52);
    ctx.fillStyle = PALETTE.hudText; ctx.font = 'bold 16px ' + FONT;
    ctx.fillText(w.name.toUpperCase(), 24, viewH - 42);
    ctx.fillStyle = PALETTE.hudGold; ctx.font = '15px ' + FONT;
    ctx.fillText(p.weapon === 'fists' ? '∞' : 'AMMO ' + (s.ammo[p.weapon] || 0), 24, viewH - 22);
    const car = s.playerCar ? s.cars.find(c => c.id === s.playerCar) : null;
    const speedKmh = car ? Math.round(Math.abs(car.speed) * 0.24) : Math.round(p.speed * 0.24);
    ctx.fillStyle = PALETTE.hudText; ctx.font = 'bold 20px ' + FONT; ctx.textAlign = 'right';
    ctx.fillText(speedKmh + ' km/h', viewW - 200, viewH - 30);
    const hh = Math.floor(s.clock), mm = Math.floor((s.clock - hh) * 60);
    ctx.fillText(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), viewW - 200, viewH - 56);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudPanel; ctx.fillRect(viewW / 2 - 260, 14, 520, 44);
    ctx.fillStyle = PALETTE.hudGold; ctx.font = 'bold 15px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText(game.missionText(), viewW / 2, 32);
    ctx.fillStyle = PALETTE.hudText; ctx.font = '12px ' + FONT;
    const m = s.mission;
    if (m) ctx.fillText(m.giver + '  •  ' + m.title, viewW / 2, 50);
    ctx.textAlign = 'left';
    if (s.missionTimer > 0) {
      ctx.fillStyle = '#ff5a4a'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('⏱ ' + Math.ceil(s.missionTimer) + 's', viewW / 2, 84);
      ctx.textAlign = 'left';
    }
    if (s.taxi) {
      ctx.fillStyle = '#37e0c8'; ctx.font = 'bold 14px ' + FONT;
      ctx.fillText('TAXI FARE $' + s.taxi.fare + ' — ' + Math.ceil(s.taxi.timer) + 's left', 24, viewH - 84);
    }
    if (s.messageTimer > 0) {
      ctx.fillStyle = 'rgba(10,14,22,0.8)'; ctx.fillRect(viewW / 2 - 300, viewH - 130, 600, 34);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(s.message, viewW / 2, viewH - 108);
      ctx.textAlign = 'left';
    }
    if (s.bustTimer > 0.2) {
      ctx.fillStyle = '#ff5a4a'; ctx.font = 'bold 24px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('BUSTED IN ' + (1.6 - s.bustTimer).toFixed(1) + 's — RUN!', viewW / 2, viewH / 2 - 120);
      ctx.textAlign = 'left';
    }
    drawMinimap(city, game);
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '12px ' + FONT;
    ctx.fillText('WASD move/drive  •  E enter car  •  Mouse aim, click shoot  •  Shift handbrake  •  Q weapon  •  P pause  •  M mute', 14, viewH - 8);
  }

  function drawMenu(game, kind) {
    const s = game.state;
    ctx.fillStyle = '#0d1b33'; ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#f2c94c'; ctx.font = 'bold 64px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText('SOLARA CITY', viewW / 2, viewH / 2 - 110);
    ctx.fillStyle = '#f4f1e6'; ctx.font = '22px ' + FONT;
    ctx.fillText('An original open-world crime game — drive, steal, run, survive.', viewW / 2, viewH / 2 - 66);
    ctx.font = '16px ' + FONT;
    const lines = {
      menu: ['You are a small-time driver. Marisol Vega has work for you.', '8 story missions • taxi fares • races • hidden packages • 5-star wanted', '', 'WASD move / drive   •   E enter & exit cars   •   Mouse aim, click to shoot', 'Shift handbrake   •   Q switch weapon   •   P pause   •   M mute   •   H hide HUD', '', 'Press SPACE or click to start   •   C continue saved game'],
      paused: ['PAUSED', '', 'Press P or Space to resume'],
      wasted: ['WASTED', '', 'You died. $200 hospital bill. Press SPACE to retry.'],
      busted: ['BUSTED', '', 'The Solara police caught you. $300 fine. Press SPACE to retry.'],
      won: ['THE BIG ONE — DONE', '', 'You robbed Solara National Bank and got away clean.', 'All 8 missions complete. Free roam Solara City forever.', '', 'Press SPACE to keep playing.'],
    }[kind] || [];
    ctx.fillStyle = '#cfd6e2';
    lines.forEach((l, i) => ctx.fillText(l, viewW / 2, viewH / 2 - 20 + i * 28));
    ctx.fillStyle = '#8b93a3'; ctx.font = '13px ' + FONT;
    ctx.fillText('Cash $' + s.cash.toLocaleString('en-US') + '   •   Missions ' + s.missionIndex + '/8   •   Packages ' + s.packagesFound + '/12', viewW / 2, viewH - 40);
    ctx.textAlign = 'left';
  }

  return {
    resize,
    worldToScreen, screenToWorld,
    get viewW() { return viewW; }, get viewH() { return viewH; },
    draw(city, game, time) {
      const s = game.state;
      const p = s.player;
      const car = s.playerCar ? s.cars.find(c => c.id === s.playerCar) : null;
      const speed = car ? Math.abs(car.speed) : p.speed;
      const targetZoom = clamp(1.15 - speed / 2600, 0.78, 1.15);
      zoom = lerp(zoom, targetZoom, 0.05);
      camX = lerp(camX, p.x, 0.12); camY = lerp(camY, p.y, 0.12);
      if (s.screen === 'menu') { drawMenu(game, 'menu'); return; }
      if (s.screen === 'paused') { drawWorld(city, game, time); drawHUD(city, game); drawMenu(game, 'paused'); return; }
      if (s.screen === 'wasted' || s.screen === 'busted' || s.screen === 'won') {
        if (s.screen === 'won') { drawWorld(city, game, time); if (!s.photoMode) drawHUD(city, game); }
        drawMenu(game, s.screen);
        return;
      }
      drawWorld(city, game, time);
      if (!s.photoMode) drawHUD(city, game);
    },
  };
}
