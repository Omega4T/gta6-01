// Combat: fists, pistol, shotgun and SMG, bullets, mission enemies and the
// pickups the player finds on the street. Enemies are pedestrians with a gun
// and a grudge; they take cover poorly and shoot back.

import { CFG } from './config.js';
import { rand, pick, chance, dist, clamp } from './random.js';
import { blockedAtPoint } from './city.js';
import { addHeat } from './vehicles.js';
import { scatterPeds } from './crowd.js';

// Fire the player's current weapon toward the mouse aim.
export function fireWeapon(S, aimX, aimY) {
  const p = S.player;
  const w = CFG.weapons[p.weapon];
  if (S.fireCooldown > 0) return false;
  if (p.weapon !== 'fists' && (p.ammo[p.weapon] || 0) <= 0) {
    S.audio.pickup();
    return false;
  }
  S.fireCooldown = w.rate;
  const baseAng = Math.atan2(aimY - p.y, aimX - p.x);
  if (p.weapon === 'fists') {
    // A short punch arc in front of the player.
    for (const e of S.enemies) {
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < w.range) {
        hurtEnemy(S, e, w.damage);
      }
    }
    for (const ped of S.peds) {
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (d < w.range) {
        S.peds.splice(S.peds.indexOf(ped), 1);
        addHeat(S, CFG.police.heatPerKill);
        scatterPeds(S, p.x, p.y, 260);
        S.stats.kills++;
      }
    }
    S.audio.shot('fists');
    return true;
  }
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const spread = (Math.random() - 0.5) * (w.pellets ? 0.22 : 0.05);
    S.bullets.push({
      x: p.x + Math.cos(baseAng) * 22, y: p.y + Math.sin(baseAng) * 22,
      vx: Math.cos(baseAng + spread) * 900, vy: Math.sin(baseAng + spread) * 900,
      damage: w.damage, range: w.range, travelled: 0, from: 'player',
    });
  }
  p.ammo[p.weapon]--;
  S.audio.shot(p.weapon);
  addHeat(S, CFG.police.heatPerShot);
  scatterPeds(S, p.x, p.y, 300);
  // Muzzle flash.
  S.parts.push({ x: p.x + Math.cos(baseAng) * 26, y: p.y + Math.sin(baseAng) * 26, vx: 0, vy: 0, life: 0.07, max: 0.07, size: 14, color: '#ffd94a', kind: 'flash' });
  return true;
}

// Spawn a mission enemy at a point. He shoots at the player on sight.
export function spawnEnemy(S, x, y, hp) {
  const e = { x, y, hp: hp || 60, cooldown: rand(S.rng, 0.3, 1), speed: 95, state: 'hunt', shirt: '#3a3a3a' };
  S.enemies.push(e);
  return e;
}

// Hurt an enemy; at zero health he drops a pickup and falls.
export function hurtEnemy(S, e, damage) {
  e.hp -= damage;
  S.parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 10, color: '#ff4a4a', kind: 'flash' });
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    S.stats.kills++;
    addHeat(S, CFG.police.heatPerKill * 0.5);
    if (chance(S.rng, 0.6)) spawnPickup(S, e.x, e.y, pick(S.rng, ['health', 'ammo', 'cash']));
    scatterPeds(S, e.x, e.y, 220);
  }
}

// Move bullets, test hits against enemies, peds, cars and buildings.
export function updateBullets(S, dt) {
  for (const b of S.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += Math.hypot(b.vx, b.vy) * dt;
    if (b.travelled > b.range) { b.dead = true; continue; }
    if (blockedAtPoint(S.city.buildings, b.x, b.y, 2)) {
      b.dead = true;
      S.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, size: 5, color: '#d8d8d8', kind: 'flash' });
      continue;
    }
    if (b.from === 'player') {
      for (const e of S.enemies) {
        if (!e.dead && dist(e.x, e.y, b.x, b.y) < 16) {
          hurtEnemy(S, e, b.damage);
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const ped of S.peds) {
        if (dist(ped.x, ped.y, b.x, b.y) < 13) {
          S.peds.splice(S.peds.indexOf(ped), 1);
          addHeat(S, CFG.police.heatPerKill);
          scatterPeds(S, b.x, b.y, 260);
          S.stats.kills++;
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const car of S.cars) {
        if (!car.dead && dist(car.x, car.y, b.x, b.y) < car.radius) {
          car.hp -= b.damage;
          if (car.hp <= 0 && !car.dead) {
            car.dead = true;
            S.audio.boom();
          }
          b.dead = true;
          break;
        }
      }
    } else {
      // Enemy bullets only threaten the player.
      const p = S.player;
      if (dist(p.x, p.y, b.x, b.y) < (p.onFoot ? 14 : 22)) {
        hurtPlayer(S, b.damage);
        b.dead = true;
      }
    }
  }
  S.bullets = S.bullets.filter((b) => !b.dead);
}

// Enemies walk at the player and shoot when in range.
export function updateEnemies(S, dt) {
  const p = S.player;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d > 60) {
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(ang) * e.speed * dt;
      e.y += Math.sin(ang) * e.speed * dt;
    }
    e.cooldown -= dt;
    if (e.cooldown <= 0 && d < 480 && d > 40) {
      e.cooldown = rand(S.rng, 0.9, 1.6);
      const ang = Math.atan2(p.y - e.y, p.x - e.x) + (Math.random() - 0.5) * 0.16;
      S.bullets.push({
        x: e.x + Math.cos(ang) * 20, y: e.y + Math.sin(ang) * 20,
        vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620,
        damage: 9, range: 460, travelled: 0, from: 'enemy',
      });
      S.audio.shot('pistol');
    }
  }
  S.enemies = S.enemies.filter((e) => !e.dead);
}

// Armour absorbs first, health second.
export function hurtPlayer(S, damage) {
  const p = S.player;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, damage);
    p.armor -= absorbed;
    damage -= absorbed;
  }
  p.hp -= damage;
  S.cam.shake = Math.max(S.cam.shake, 4);
  if (p.hp <= 0) {
    p.hp = 0;
  }
}

// Drop a pickup: health cross, ammo box or a cash roll.
export function spawnPickup(S, x, y, kind) {
  S.pickups.push({ x, y, kind, bob: Math.random() * 6 });
}

// Walk over a pickup to take it.
export function updatePickups(S, dt) {
  const p = S.player;
  for (const pk of S.pickups) {
    pk.bob += dt * 3;
    if (dist(pk.x, pk.y, p.x, p.y) < 30) {
      pk.dead = true;
      if (pk.kind === 'health') p.hp = Math.min(CFG.player.maxHealth, p.hp + 40);
      else if (pk.kind === 'armor') p.armor = Math.min(CFG.player.maxArmor, p.armor + 50);
      else if (pk.kind === 'ammo') { p.ammo.pistol += 30; p.ammo.shotgun += 8; p.ammo.smg += 30; }
      else if (pk.kind === 'cash') { p.cash += 60; S.stats.earned += 60; }
      S.audio.pickup();
    }
  }
  S.pickups = S.pickups.filter((pk) => !pk.dead);
}

// Particles: smoke, fire, sparks and floating text, all fading with time.
export function updateParticles(S, dt) {
  for (const pt of S.parts) {
    pt.life -= dt;
    pt.x += (pt.vx || 0) * dt;
    pt.y += (pt.vy || 0) * dt;
    if (pt.kind === 'fire') { pt.vx *= 0.98; pt.vy *= 0.98; }
  }
  S.parts = S.parts.filter((pt) => pt.life > 0);
}

// Floating text that rises and fades, for payouts and pickups.
export function addFloatText(S, x, y, text, color) {
  S.floats.push({ x, y, text, color: color || '#ffffff', life: 1.6, max: 1.6 });
}

export function updateFloats(S, dt) {
  for (const f of S.floats) {
    f.life -= dt;
    f.y -= 34 * dt;
  }
  S.floats = S.floats.filter((f) => f.life > 0);
}
