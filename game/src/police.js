// SCPD: wanted level 0-5, cruiser pursuit with named units and tactics,
// roadblocks at 3+, the AIR-1 helicopter with spotlight at 4+, busted logic.
import * as THREE from 'three';
import { makeRng, clamp, angleDiff } from './rng.js';
import { Car, CAR_TYPES } from './cars.js';
import { randomRoadPoint, nearestRoadPoint } from './city.js';

const UNIT_NAMES = ['CORAL-12', 'KITE-1', 'REEF-07', 'PALM-22', 'TIDE-31', 'SURF-09',
  'GULL-4', 'ANCHOR-18', 'BAY-77', 'DUNE-55', 'PIER-3', 'SALT-26'];
const TACTICS = ['RAMMING', 'PIT MANEUVER', 'BLOCKING', 'PURSUIT', 'CUTTING OFF', 'MARKSMAN'];

export class Police {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(99);
    this.wanted = 0;
    this.cruisers = [];
    this.roadblocks = [];
    this.heli = null;
    this.heliLight = null;
    this.bustedTimer = 0;
    this.heat = 0; // 0..1, decays when hidden
    this.escapedCount = 0;
    this.dispatch = []; // {name, tactic, dist} for the HUD
    this.airDeployed = false;
    this.spotlightTarget = null;
  }
  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 1);
    const level = this.heat < 0.12 ? 0 : this.heat < 0.3 ? 1 : this.heat < 0.48 ? 2
      : this.heat < 0.66 ? 3 : this.heat < 0.84 ? 4 : 5;
    if (level > this.wanted) this.onWantedUp(level);
    if (level < this.wanted && level === 0) this.escapedCount++;
    this.wanted = level;
  }
  onWantedUp(level) {
    // spawn the right number of cruisers for the new level
    const want = level === 0 ? 0 : level + 1;
    while (this.cruisers.length < want) this.spawnCruiser();
    if (level >= 3 && this.roadblocks.length === 0) this.spawnRoadblocks();
    if (level >= 4 && !this.heli) this.spawnHeli();
  }
  spawnCruiser() {
    const p = randomRoadPoint(this.rng);
    const type = CAR_TYPES[0];
    const car = new Car(this.scene, type, p.x, p.z, this.rng.range(0, Math.PI * 2), { police: true });
    car.dispatchName = UNIT_NAMES[this.cruisers.length % UNIT_NAMES.length];
    car.tactic = TACTICS[this.rng.int(0, TACTICS.length - 1)];
    car.top = 44 + this.wanted * 2;
    this.cruisers.push(car);
  }
  spawnRoadblocks() {
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
      for (let k = -1; k <= 1; k++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 4.2), mat);
        c.position.set(k * 2.4, 0.45, 0);
        group.add(c);
      }
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.25, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      stripe.position.set(0, 1.0, 2.1);
      group.add(stripe);
      const p = randomRoadPoint(this.rng);
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.alongX ? Math.PI / 2 : 0;
      this.scene.add(group);
      this.roadblocks.push({ group, x: p.x, z: p.z });
    }
  }
  spawnHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x22304a }));
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5),
      new THREE.MeshLambertMaterial({ color: 0x22304a }));
    tail.position.set(0, 0.3, -5); g.add(tail);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x8ac8e8 }));
    glass.position.set(0, 0.3, 2.4); g.add(glass);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1.2; g.add(rotor);
    g.userData.rotor = rotor;
    // visible spotlight beam + ground pool so AIR-1 reads in screenshots
    const beamGeo = new THREE.ConeGeometry(7, 30, 12, 1, true);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    beam.rotation.x = Math.PI;
    beam.position.y = -14;
    g.add(beam);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.22, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.15;
    this.scene.add(pool);
    this.spotPool = pool;
    const spot = new THREE.SpotLight(0xfff2b0, 60, 120, 0.32, 0.4, 1.2);
    spot.position.set(0, -0.5, 0);
    g.add(spot);
    g.add(spot.target);
    this.scene.add(g);
    this.heli = g;
    this.heliLight = spot;
    this.airDeployed = true;
  }
  update(dt, px, pz, playerSpeed, playerInCar, onBusted, heading = 0) {
    // heat decays when the player is slow and out of sight of cruisers
    let nearest = Infinity;
    for (const c of this.cruisers) nearest = Math.min(nearest, Math.hypot(c.x - px, c.z - pz));
    if (this.wanted > 0 && nearest > 90 && playerSpeed < 2) this.heat -= dt * 0.02;
    if (this.heat <= 0 && this.wanted > 0) {
      this.wanted = 0;
      this.clearPursuit();
    }
    // cruiser pursuit: steer at the player, ram when close
    for (const c of this.cruisers) {
      if (c.dead) continue;
      if (c.formation) { c.update(dt, null, this.colliders); continue; }
      const d = Math.hypot(c.x - px, c.z - pz);
      const target = Math.atan2(px - c.x, pz - c.z);
      c.heading += clamp(angleDiff(c.heading, target), -2.4 * dt, 2.4 * dt);
      const want = d > 6 ? c.type.top : 10;
      c.speed += (want - c.speed) * Math.min(1, dt * 0.9);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.syncMesh(dt);
      // ram damage when touching the player car / player
      if (d < 4.5 && playerInCar) playerInCar.damage(6 * dt);
    }
    // heli holds ahead of the player so it stays in the chase-cam frame,
    // weaving side to side, spotlight locked on the player
    if (this.heli) {
      const t = performance.now() / 1000;
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const side = Math.sin(t * 0.3) * 14;
      const hx = px + fx * 38 + Math.cos(heading) * side;
      const hz = pz + fz * 38 - Math.sin(heading) * side;
      this.heli.position.set(hx, 20 + Math.sin(t * 0.7) * 2, hz);
      this.heli.rotation.y = Math.atan2(px - hx, pz - hz);
      this.heli.userData.rotor.rotation.y += dt * 22;
      this.heliLight.target.position.set(px - hx, -20, pz - hz);
      this.spotlightTarget = { x: px, z: pz };
      if (this.spotPool) this.spotPool.position.set(px, 0.15, pz);
    }
    // busted: a cruiser sits on a slow player for a while
    if (this.wanted > 0 && nearest < 4.5 && playerSpeed < 1.5) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 2.5) {
        this.bustedTimer = 0;
        onBusted();
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    // dispatch list for the HUD
    this.dispatch = this.cruisers.filter(c => !c.dead).slice(0, 6).map(c => ({
      name: c.dispatchName,
      tactic: c.tactic,
      dist: Math.round(Math.hypot(c.x - px, c.z - pz)),
    })).sort((a, b) => a.dist - b.dist);
    if (this.airDeployed && this.wanted >= 4) {
      this.dispatch.unshift({ name: 'AIR-1', tactic: 'SPOTLIGHT', dist: 0 });
    }
  }
  clearPursuit() {
    for (const c of this.cruisers) c.remove(this.scene);
    this.cruisers = [];
    for (const r of this.roadblocks) this.scene.remove(r.group);
    this.roadblocks = [];
    if (this.heli) { this.scene.remove(this.heli); this.heli = null; this.airDeployed = false; }
    if (this.spotPool) { this.scene.remove(this.spotPool); this.spotPool = null; }
    this.dispatch = [];
  }
  reset() {
    this.wanted = 0; this.heat = 0; this.bustedTimer = 0;
    this.clearPursuit();
  }
}
