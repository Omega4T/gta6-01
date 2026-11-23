// Combat: five weapon slots, hitscan shooting with tracers, enemy shooters
// for missions, car explosions and burning wrecks.
import * as THREE from 'three';
import { makeRng, clamp } from './rng.js';
import { makePersonMesh } from './people.js';

export const WEAPONS = [
  { id: 'fists',  name: 'FISTS',  key: '1', damage: 12, rate: 0.35, range: 2.5, ammo: Infinity, auto: false, locked: false },
  { id: 'pistol', name: '.38 REVOLVER', key: '2', damage: 26, rate: 0.32, range: 55, ammo: 48, auto: false, locked: false },
  { id: 'smg',    name: 'SMG-9',  key: '3', damage: 13, rate: 0.09, range: 48, ammo: 120, auto: true, locked: false },
  { id: 'shotgun',name: '12G PUMP', key: '4', damage: 16, rate: 0.85, range: 26, ammo: 24, auto: false, locked: true, pellets: 6 },
  { id: 'ar',     name: 'AR-9',   key: '5', damage: 22, rate: 0.12, range: 70, ammo: 90, auto: true, locked: true },
];

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(31337);
    this.weaponIndex = 1;
    this.ammo = {};
    for (const w of WEAPONS) this.ammo[w.id] = w.ammo === Infinity ? Infinity : w.ammo;
    this.cooldown = 0;
    this.enemies = [];
    this.tracers = [];
    this.explosions = [];
    this.muzzle = null;
    this.kills = 0;
  }
  get weapon() { return WEAPONS[this.weaponIndex]; }
  select(i) {
    if (i < 0 || i >= WEAPONS.length) return false;
    if (WEAPONS[i].locked) return false;
    this.weaponIndex = i;
    return true;
  }
  unlock(id) {
    const w = WEAPONS.find(x => x.id === id);
    if (w) w.locked = false;
  }
  addAmmo(id, n) {
    if (this.ammo[id] !== Infinity) this.ammo[id] += n;
  }
  // fire from (ox,oy,oz) toward a direction; returns true if a shot went off
  fire(ox, oy, oz, dirX, dirY, dirZ, targets) {
    const w = this.weapon;
    if (this.cooldown > 0) return false;
    if (this.ammo[w.id] !== Infinity && this.ammo[w.id] <= 0) return false;
    if (this.ammo[w.id] !== Infinity) this.ammo[w.id]--;
    this.cooldown = w.rate;
    const pellets = w.pellets || 1;
    let hitAnything = false;
    for (let p = 0; p < pellets; p++) {
      const spread = w.id === 'shotgun' ? 0.09 : 0.02;
      const dx = dirX + (this.rng.next() - 0.5) * spread;
      const dy = dirY + (this.rng.next() - 0.5) * spread;
      const dz = dirZ + (this.rng.next() - 0.5) * spread;
      const end = this.rayHit(ox, oy, oz, dx, dy, dz, w.range, targets);
      this.spawnTracer(ox, oy, oz, end.x, end.y, end.z);
      if (end.hit) hitAnything = true;
    }
    return true;
  }
  rayHit(ox, oy, oz, dx, dy, dz, range, targets) {
    // targets: [{x, z, y?, radius, hp, onHit(dmg), kind}]
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let best = null, bestT = range;
    for (const t of targets) {
      if (t.dead) continue;
      const ty = t.y ?? 1.2;
      // closest approach of the ray to the target centre
      const rx = t.x - ox, ry = ty - oy, rz = t.z - oz;
      const proj = rx * dx + ry * dy + rz * dz;
      if (proj < 0 || proj > range) continue;
      const cx = ox + dx * proj, cy = oy + dy * proj, cz = oz + dz * proj;
      const dd = Math.hypot(t.x - cx, ty - cy, t.z - cz);
      if (dd < (t.radius || 1.1) && proj < bestT) { best = t; bestT = proj; }
    }
    if (best) {
      best.onHit(this.weapon.damage);
      if (best.hp !== undefined && best.hp <= 0) this.kills++;
      return { x: best.x, y: best.y ?? 1.2, z: best.z, hit: true };
    }
    return { x: ox + dx * range, y: oy + dy * range, z: oz + dz * range, hit: false };
  }
  spawnTracer(x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe94a }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }
  spawnExplosion(x, y, z, big = false) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(big ? 4 : 2.2, 10, 8), mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const light = new THREE.PointLight(0xff8a3c, 80, 40);
    light.position.set(x, y + 2, z);
    this.scene.add(light);
    this.explosions.push({ mesh, light, life: 0.5, max: 0.5, big });
  }
  spawnEnemy(x, z, opts = {}) {
    const mesh = makePersonMesh(opts.shirt ?? 0x8a2a2a, 0x2a2a2a);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const e = {
      mesh, x, z, hp: opts.hp ?? 60, radius: 1.0, dead: false,
      speed: opts.speed ?? 3.2, shootTimer: this.rng.range(0.5, 2),
      kind: 'enemy', y: 1.2,
      onHit: (dmg) => { e.hp -= dmg; if (e.hp <= 0 && !e.dead) { e.dead = true; e.mesh.visible = false; } },
    };
    this.enemies.push(e);
    return e;
  }
  updateEnemies(dt, px, pz, player, onEnemyShot) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - px, e.z - pz);
      if (d > 3) {
        const a = Math.atan2(px - e.x, pz - e.z);
        e.x += Math.sin(a) * e.speed * dt;
        e.z += Math.cos(a) * e.speed * dt;
        e.mesh.rotation.y = a;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 45) {
        e.shootTimer = this.rng.range(1.2, 2.4);
        onEnemyShot(e, d);
      }
    }
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      const k = 1 - e.life / e.max;
      e.mesh.scale.setScalar(1 + k * 2.4);
      e.mesh.material.opacity = 1 - k;
      e.mesh.material.transparent = true;
      e.light.intensity = 80 * (1 - k);
      if (e.life <= 0) {
        this.scene.remove(e.mesh); this.scene.remove(e.light);
        this.explosions.splice(i, 1);
      }
    }
  }
  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
}
