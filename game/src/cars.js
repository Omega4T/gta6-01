// Vehicles: low-poly car factory, arcade driving physics, and city traffic.
// Seven drivable types; any parked or traffic car can be stolen.
import * as THREE from 'three';
import { makeRng, clamp, angleDiff } from './rng.js';
import { nearestRoadPoint, randomRoadPoint, collideBuildings, clampToCity, CITY_HALF } from './city.js';

export const CAR_TYPES = [
  { id: 'peko',   name: 'PEKO HATCH',     color: 0xd8d8d8, top: 30, accel: 13, price: 0,    desc: 'city runabout' },
  { id: 'rukano', name: 'RUKAN PELO GT',  color: 0xd83c2a, top: 52, accel: 19, price: 12000, desc: 'sports coupe' },
  { id: 'muscle', name: 'VULCAR MUSCLE', color: 0x2a4ad8, top: 46, accel: 17, price: 8000,  desc: 'old-school V8' },
  { id: 'taxi',   name: 'SOLARA TAXI',    color: 0xe8c03c, top: 34, accel: 14, price: 4500,  desc: 'cab with meter' },
  { id: 'van',    name: 'BURRO VAN',      color: 0x8a8a92, top: 32, accel: 12, price: 6000,  desc: 'panel van' },
  { id: 'truck',  name: 'DUNE TRUCK',     color: 0x7a5a3a, top: 36, accel: 13, price: 9000,  desc: 'pickup 4x4' },
  { id: 'beach',  name: 'SAND BUGGY',     color: 0x3ad8c8, top: 38, accel: 15, price: 5500,  desc: 'open-top buggy' },
];

export function makeCarMesh(type, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0xe8e8e8 : type.color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x2a4a5e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.15, -0.25); g.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.9), bodyMat);
  hood.position.set(0, 0.98, 1.75); g.add(hood);
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    stripe.position.y = 0.62; g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.5, -0.25); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.3, 1.66, -0.25); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.3, 1.66, -0.25); g.add(blue);
    g.userData.lights = [red, blue];
  }
  if (type.id === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe94a }));
    sign.position.set(0, 1.56, -0.25); g.add(sign);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
  });
  // headlights
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  [-0.7, 0.7].forEach((x) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), hlMat);
    hl.position.set(x, 0.72, 2.22); g.add(hl);
  });
  g.userData.wheels = wheels;
  g.userData.type = type;
  return g;
}

export class Car {
  constructor(scene, type, x, z, heading, opts = {}) {
    this.type = type;
    this.mesh = makeCarMesh(type, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.police = !!opts.police;
    this.traffic = !!opts.traffic;
    this.dead = false;
    this.steer = 0;
    this.parked = !!opts.parked;
    this.burning = false;
  }
  update(dt, input, colliders) {
    if (this.dead) return;
    if (this.formation) { // staged chase pack: hold lane and speed, no pursuit
      const cruise = this.cruise ?? 30;
      this.speed += (cruise - this.speed) * Math.min(1, dt * 1.5);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.syncMesh(dt);
      return;
    }
    if (this.traffic) { this.updateTraffic(dt, colliders); return; }
    const t = this.type;
    if (input.forward) this.speed += t.accel * dt;
    if (input.back) this.speed -= t.accel * 0.8 * dt;
    if (input.brake) this.speed *= Math.pow(0.02, dt);
    this.speed -= this.speed * 0.55 * dt; // drag
    this.speed = clamp(this.speed, -12, t.top);
    if (Math.abs(this.speed) > 0.5) {
      const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      this.steer += (target - this.steer) * Math.min(1, dt * 8);
      this.heading += this.steer * 1.9 * dt * Math.sign(this.speed)
        * clamp(Math.abs(this.speed) / 12, 0.25, 1);
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    const fixed = collideBuildings(colliders, this.x, this.z, 2.2);
    if (fixed.x !== this.x || fixed.z !== this.z) {
      this.speed *= 0.4;
      this.health -= Math.abs(this.speed) * 0.4;
    }
    this.x = fixed.x; this.z = fixed.z;
    const c = clampToCity(this.x, this.z);
    this.x = c.x; this.z = c.z;
    this.syncMesh(dt);
  }
  updateTraffic(dt, colliders) {
    // follow the road grid: drive along current axis, turn at intersections
    if (this.speed < 1) this.speed = this.type.top * 0.55;
    const p = nearestRoadPoint(this.x, this.z);
    const targetHeading = p.alongX
      ? (Math.sin(this.heading) >= 0 ? Math.PI / 2 : -Math.PI / 2)
      : (Math.cos(this.heading) >= 0 ? 0 : Math.PI);
    this.heading += clamp(angleDiff(this.heading, targetHeading), -1.6 * dt, 1.6 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    const c = clampToCity(this.x, this.z);
    if (c.x !== this.x || c.z !== this.z) { // reached edge: turn around
      this.heading += Math.PI;
      this.x = c.x; this.z = c.z;
    }
    this.syncMesh(dt);
  }
  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt * 2.6;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.police && this.mesh.userData.lights) {
      const t = performance.now() / 180;
      this.mesh.userData.lights[0].material.color.setHex(Math.sin(t) > 0 ? 0xff2222 : 0x551111);
      this.mesh.userData.lights[1].material.color.setHex(Math.sin(t) > 0 ? 0x111155 : 0x2244ff);
    }
  }
  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) { this.dead = true; this.burning = true; }
  }
  remove(scene) { scene.remove(this.mesh); }
}

export class TrafficSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(777);
    this.cars = [];
    for (let i = 0; i < 26; i++) {
      const p = randomRoadPoint(this.rng);
      const type = this.rng.pick(CAR_TYPES);
      const heading = p.alongX ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
        : (this.rng.chance(0.5) ? 0 : Math.PI);
      const car = new Car(scene, type, p.x, p.z, heading, { traffic: true });
      this.cars.push(car);
    }
    // parked cars along roads, stealable
    this.parked = [];
    for (let i = 0; i < 22; i++) {
      const p = randomRoadPoint(this.rng);
      const type = this.rng.pick(CAR_TYPES);
      const off = this.rng.chance(0.5) ? 5.5 : -5.5;
      const car = new Car(scene, type,
        p.x + (p.alongX ? 0 : off), p.z + (p.alongX ? off : 0),
        p.alongX ? Math.PI / 2 : 0, { parked: true });
      this.parked.push(car);
    }
  }
  update(dt) {
    for (const c of this.cars) c.update(dt, null, this.colliders);
  }
  nearestCar(x, z, maxDist, includeParked = true) {
    let best = null, bd = maxDist;
    const all = includeParked ? this.cars.concat(this.parked) : this.cars;
    for (const c of all) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}
